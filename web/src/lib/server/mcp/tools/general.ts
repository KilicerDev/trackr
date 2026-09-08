// Cross-cutting tools: identity, org directory, search, user lookup, inbox,
// and attachment read/write. Scoping mirrors /api/v1/me, /search, /inbox and
// the attachment routes.

import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { notification, organization } from '$lib/server/db/app.schema';
import { can, isTrackrTeam } from '$lib/server/permissions';
import { searchAll, type SearchResult } from '$lib/server/search';
import { loadAssignableUsers } from '$lib/server/tickets';
import {
	authorizeAttachmentAccess,
	getAttachment,
	originalKey,
	resolveEntityContext,
	thumbKey
} from '$lib/server/attachments';
import { attachBytes, attachFromUrl, decodeInlineUpload } from '$lib/server/attachments-fetch';
import { storage } from '$lib/server/storage';
import { formatBytes, MAX_INLINE_UPLOAD_BYTES } from '$lib/config/attachments';
import { attachmentDownloadUrl, iso, listMd } from '../format';
import { isUuid, normalizeKey } from '../ids';
import {
	fail,
	guarded,
	imageResult,
	limitSchema,
	READ_ONLY,
	text,
	userDirectory,
	WRITE,
	type McpContext
} from './shared';
import { loadVisibleTicket, resolveOrgByKey } from './tickets';
import { loadAccessibleProject, loadVisibleTaskRef } from './tasks';

/** Raster images up to this size are returned inline (base64). */
const INLINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const SEARCH_TYPES = ['ticket', 'task', 'project', 'wiki', 'note'] as const;

export function registerGeneralTools(server: McpServer, ctx: McpContext): void {
	server.registerTool(
		'whoami',
		{
			title: 'Who am I',
			description:
				'Identity and scope of the account this MCP session acts as: user id, name, email, how you authenticated, whether you are internal staff / admin, your organization memberships (key, name, role) and the number of project memberships. Call this first to learn which org and project keys you can use.',
			inputSchema: z.object({}),
			outputSchema: z.object({
				id: z.string(),
				name: z.string(),
				email: z.string(),
				authKind: z.string(),
				staff: z.boolean(),
				admin: z.boolean(),
				orgs: z.array(
					z.object({
						key: z.string(),
						name: z.string(),
						role: z.string(),
						internal: z.boolean()
					})
				),
				projectMemberships: z.number()
			}),
			annotations: READ_ONLY
		},
		guarded(async () => {
			const { locals, principal } = ctx;
			const orgIds = locals.memberships.orgs.map((o) => o.orgId);
			const rows = orgIds.length
				? await db
						.select({ id: organization.id, key: organization.key, name: organization.name })
						.from(organization)
						.where(inArray(organization.id, orgIds))
				: [];
			const byId = new Map(rows.map((r) => [r.id, r]));
			const orgs = locals.memberships.orgs.map((m) => ({
				key: byId.get(m.orgId)?.key ?? m.orgId,
				name: byId.get(m.orgId)?.name ?? m.orgId,
				role: m.role,
				internal: m.isInternal
			}));
			const staff = isTrackrTeam(locals);
			const md = [
				`You are **${locals.user.name}** <${locals.user.email}> (id \`${locals.user.id}\`).`,
				`- Auth: ${principal.locals.authKind}${principal.locals.oauthClientId ? ` (client ${principal.locals.oauthClientId})` : ''}`,
				`- Internal staff: ${staff ? 'yes' : 'no'} · Admin: ${locals.isAdmin ? 'yes' : 'no'}`,
				`- Organizations: ${orgs.length ? orgs.map((o) => `${o.key} (${o.role})`).join(', ') : 'none'}`,
				`- Project memberships: ${locals.memberships.projects.length}${staff ? ' (staff sees every project)' : ''}`
			].join('\n');
			return text(md, {
				id: locals.user.id,
				name: locals.user.name,
				email: locals.user.email,
				authKind: principal.locals.authKind,
				staff,
				admin: locals.isAdmin,
				orgs,
				projectMemberships: locals.memberships.projects.length
			});
		})
	);

	server.registerTool(
		'list_orgs',
		{
			title: 'List organizations',
			description:
				'Organizations you can reference by key. Internal staff see every active organization; everyone else sees only their own. Each row: key (use it for `create_ticket` / `list_tickets` / `list_users`), name, your role, and whether it is the internal team org.',
			inputSchema: z.object({}),
			outputSchema: z.object({
				total: z.number(),
				orgs: z.array(
					z.object({
						key: z.string(),
						name: z.string(),
						slug: z.string(),
						role: z.string().nullable(),
						internal: z.boolean()
					})
				)
			}),
			annotations: READ_ONLY
		},
		guarded(async () => {
			const { locals } = ctx;
			const staff = isTrackrTeam(locals);
			const roleByOrg = new Map(locals.memberships.orgs.map((m) => [m.orgId, m.role]));
			const rows = await db
				.select({
					id: organization.id,
					key: organization.key,
					name: organization.name,
					slug: organization.slug,
					isInternal: organization.isInternal
				})
				.from(organization)
				.where(isNull(organization.archivedAt))
				.orderBy(asc(organization.name));
			const visible = staff ? rows : rows.filter((o) => roleByOrg.has(o.id));
			const orgs = visible.map((o) => ({
				key: o.key,
				name: o.name,
				slug: o.slug,
				role: roleByOrg.get(o.id) ?? null,
				internal: o.isInternal
			}));
			const lines = orgs.map(
				(o) =>
					`- **${o.key}** ${o.name}${o.internal ? ' · internal team' : ''}${o.role ? ` · your role: ${o.role}` : ''}`
			);
			return text(listMd('Organizations', lines, orgs.length), { total: orgs.length, orgs });
		})
	);

	server.registerTool(
		'search',
		{
			title: 'Search',
			description:
				'Permission-scoped title search across tickets, tasks, projects, wiki pages and notes (max 10 hits per type). Typing a display id like `TRACK-108` or `WEB-1` also matches by key/number. Optional `types` restricts result kinds; `orgKey` restricts tickets to one organization. Results carry the display id (tickets/tasks/projects) or uuid (wiki/notes) to pass to the matching `get_*` tool. Text only — pass the relevant ticket/task ids to `show_items` to show them.',
			inputSchema: z.object({
				query: z.string().min(1).describe('Search text (2+ chars unless `types` is set).'),
				types: z
					.array(z.enum(SEARCH_TYPES))
					.optional()
					.describe('Restrict to these kinds (ticket | task | project | wiki | note).'),
				orgKey: z.string().optional().describe('Restrict tickets to this organization key.')
			}),
			outputSchema: z.object({
				total: z.number(),
				results: z.array(
					z.object({
						type: z.string(),
						id: z.string(),
						ref: z.string(),
						title: z.string(),
						subtitle: z.string().nullable(),
						url: z.string()
					})
				)
			}),
			annotations: READ_ONLY
		},
		guarded(async ({ query, types, orgKey }) => {
			let orgId: string | undefined;
			if (orgKey) {
				const org = await resolveOrgByKey(orgKey);
				if (!org) fail(404, `Organization ${normalizeKey(orgKey)} not found.`);
				orgId = org.id;
			}
			const results = await searchAll(ctx.locals, query, {
				types: types as SearchResult['type'][] | undefined,
				orgId
			});
			const rows = results.map((r) => ({
				type: r.type,
				id: r.id,
				ref: r.displayId ?? r.id,
				title: r.title,
				subtitle: r.subtitle,
				url: `${ctx.origin}${r.url}`
			}));
			const lines = rows.map(
				(r) =>
					`- ${r.type}: **${r.ref}** ${r.title}${r.subtitle && r.subtitle !== r.ref ? ` · ${r.subtitle}` : ''}`
			);
			return text(listMd(`Search results for "${query}"`, lines, rows.length), {
				total: rows.length,
				results: rows
			});
		})
	);

	server.registerTool(
		'list_users',
		{
			title: 'List assignable users',
			description:
				'Resolve people to ids/emails for assignee fields. With `orgKey`: everyone assignable on that org’s tickets (org members + internal agents; requires org.tickets.edit.any there). With `projectKey`: internal team members assignable on tasks (requires project.tasks.edit.any). With neither: internal team members (staff only).',
			inputSchema: z.object({
				orgKey: z.string().optional().describe('Organization key (ticket assignees).'),
				projectKey: z.string().optional().describe('Project key (task assignees).')
			}),
			outputSchema: z.object({
				total: z.number(),
				users: z.array(
					z.object({
						id: z.string(),
						name: z.string(),
						email: z.string(),
						internal: z.boolean()
					})
				)
			}),
			annotations: READ_ONLY
		},
		guarded(async ({ orgKey, projectKey }) => {
			const { locals } = ctx;
			let rows: Awaited<ReturnType<typeof loadAssignableUsers>>;
			let scope: string;
			if (orgKey) {
				const org = await resolveOrgByKey(orgKey);
				if (!org) fail(404, `Organization ${normalizeKey(orgKey)} not found.`);
				if (!(await can(locals, 'org.tickets.edit.any', { orgId: org.id }))) {
					fail(403, `You cannot assign tickets in ${org.key}.`);
				}
				rows = await loadAssignableUsers([org.id]);
				scope = `assignable on ${org.key} tickets`;
			} else if (projectKey) {
				const project = await loadAccessibleProject(ctx, projectKey);
				if (!(await can(locals, 'project.tasks.edit.any', { projectId: project.id }))) {
					fail(403, `You cannot assign tasks in ${project.key}.`);
				}
				rows = (await loadAssignableUsers([])).filter((u) => u.internal);
				scope = `assignable on ${project.key} tasks (internal team)`;
			} else {
				if (!isTrackrTeam(locals)) fail(403, 'Pass `orgKey` or `projectKey`.');
				rows = (await loadAssignableUsers([])).filter((u) => u.internal);
				scope = 'internal team';
			}
			rows.sort((a, b) => a.name.localeCompare(b.name));
			const users = rows.map((u) => ({
				id: u.id,
				name: u.name,
				email: u.email,
				internal: u.internal
			}));
			const lines = users.map(
				(u) => `- ${u.name} <${u.email}> — id \`${u.id}\`${u.internal ? ' · internal' : ''}`
			);
			return text(listMd(`Users (${scope})`, lines, users.length), { total: users.length, users });
		})
	);

	server.registerTool(
		'get_inbox',
		{
			title: 'Get inbox',
			description:
				'Your notifications, newest first (unread only by default). Each row: kind, title, body, actor, related entity, created time, read state. Use `search` / `get_ticket` / `get_task` to open what a notification refers to.',
			inputSchema: z.object({
				unreadOnly: z.boolean().default(true).describe('Only unread notifications (default true).'),
				limit: limitSchema
			}),
			annotations: READ_ONLY
		},
		guarded(async ({ unreadOnly, limit }) => {
			const uid = ctx.locals.user.id;
			const conditions = [eq(notification.recipientId, uid)];
			if (unreadOnly) conditions.push(isNull(notification.readAt));
			const [rows, [totals]] = await Promise.all([
				db
					.select({
						id: notification.id,
						kind: notification.kind,
						title: notification.title,
						body: notification.body,
						url: notification.url,
						actorId: notification.actorId,
						entityType: notification.entityType,
						entityId: notification.entityId,
						readAt: notification.readAt,
						createdAt: notification.createdAt
					})
					.from(notification)
					.where(and(...conditions))
					.orderBy(desc(notification.createdAt))
					.limit(limit),
				db
					.select({ total: count() })
					.from(notification)
					.where(and(...conditions))
			]);
			const users = await userDirectory(rows.map((n) => n.actorId));
			const total = Number(totals?.total ?? 0);
			const items = rows.map((n) => ({
				id: n.id,
				kind: n.kind,
				title: n.title,
				body: n.body,
				url: `${ctx.origin}${n.url}`,
				actor: n.actorId ? (users.get(n.actorId) ?? n.actorId) : null,
				entityType: n.entityType,
				entityId: n.entityId,
				read: !!n.readAt,
				createdAt: n.createdAt.toISOString()
			}));
			const lines = items.map(
				(n) =>
					`- ${n.createdAt} · ${n.kind} · **${n.title}**${n.body ? ` — ${n.body}` : ''}${n.actor ? ` · by ${n.actor}` : ''}${n.read ? '' : ' · unread'}`
			);
			return text(listMd(unreadOnly ? 'Unread notifications' : 'Notifications', lines, total), {
				total,
				items
			});
		})
	);

	server.registerTool(
		'get_attachment',
		{
			title: 'Get attachment',
			description:
				'Fetch an attachment by uuid (ids come from `get_ticket` / `get_task`). Raster images up to 5 MiB are returned inline as an image block (larger images fall back to the 480px WebP thumbnail and say so); other files return metadata plus a download URL (needs a trackr credential). Access follows the parent ticket/task/wiki/note.',
			inputSchema: z.object({ id: z.string().describe('Attachment uuid.') }),
			annotations: READ_ONLY
		},
		guarded(async ({ id }) => {
			if (!isUuid(id)) fail(400, 'Attachment id must be a uuid.');
			const row = await getAttachment(id);
			if (!row) fail(404, 'Attachment not found.');
			const entityCtx = await resolveEntityContext(row.entityType, row.entityId);
			if (!entityCtx) fail(404, 'Attachment not found.');
			if (!(await authorizeAttachmentAccess(ctx.locals, row.entityType, entityCtx, 'read'))) {
				fail(404, 'Attachment not found.');
			}
			const meta = {
				id: row.id,
				filename: row.filename,
				mimeType: row.mimeType,
				sizeBytes: row.sizeBytes,
				width: row.width,
				height: row.height,
				entityType: row.entityType,
				entityId: row.entityId,
				uploadedBy: row.uploadedBy,
				createdAt: iso(row.createdAt),
				downloadUrl: attachmentDownloadUrl(ctx.origin, row.id)
			};
			const header = [
				`**${row.filename}** — ${row.mimeType}, ${formatBytes(row.sizeBytes)}${row.width && row.height ? `, ${row.width}×${row.height}` : ''}`,
				`- Attached to: ${row.entityType} ${row.entityId}`,
				`- Download: ${meta.downloadUrl}`
			];
			const isRaster = row.mimeType.startsWith('image/') && row.mimeType !== 'image/svg+xml';
			if (isRaster) {
				if (row.sizeBytes <= INLINE_IMAGE_MAX_BYTES) {
					const bytes = await storage.get(originalKey(row));
					return imageResult(
						header.join('\n'),
						{ data: bytes.toString('base64'), mimeType: row.mimeType },
						meta
					);
				}
				if (row.hasThumbnail) {
					const bytes = await storage.get(thumbKey(row));
					header.push(
						`- Original is ${formatBytes(row.sizeBytes)} (over the 5 MiB inline limit); showing the 480px WebP thumbnail instead.`
					);
					return imageResult(
						header.join('\n'),
						{ data: bytes.toString('base64'), mimeType: 'image/webp' },
						meta
					);
				}
				header.push(
					'- Image is over the 5 MiB inline limit and has no thumbnail; use the download URL.'
				);
			}
			return text(header.join('\n'), meta);
		})
	);

	server.registerTool(
		'attach_file',
		{
			title: 'Attach file',
			description: `Attach a file to a ticket or task (\`target\` + display \`key\`), either from a public https \`url\` (downloaded server-side: https only, no private/loopback hosts, ≤3 redirects, 25 MiB, 20 s) or from inline \`content\` (base64 of the file bytes, or a data: URL; ≤${MAX_INLINE_UPLOAD_BYTES / 1024 / 1024} MiB decoded — use this for local files). Exactly one of \`url\` / \`content\`. \`filename\` is required with \`content\` and optional with \`url\` (overrides the detected name); \`mimeType\` is derived from the filename when omitted. Requires write access on the parent (ticket: org.tickets.edit.any or comment; task: project.tasks.edit.any or comment). Returns the attachment id.`,
			inputSchema: z
				.object({
					target: z.enum(['ticket', 'task']).describe('Parent kind.'),
					key: z.string().describe('Parent display id (e.g. `TRACK-108` or `WEB-12`).'),
					url: z.url().optional().describe('Public https URL of the file.'),
					content: z
						.string()
						.optional()
						.describe('File bytes as base64 (or a data: URL). Alternative to `url`.'),
					filename: z
						.string()
						.max(255)
						.optional()
						.describe(
							'Filename (required with `content`; overrides the detected name with `url`).'
						),
					mimeType: z
						.string()
						.max(120)
						.optional()
						.describe('MIME type of `content` (default: derived from `filename`).')
				})
				.refine((v) => !!v.url !== !!v.content, {
					message: 'Provide exactly one of `url` or `content`.'
				})
				.refine((v) => !v.content || !!v.filename?.trim(), {
					message: '`filename` is required with `content`.'
				}),
			annotations: WRITE
		},
		guarded(async ({ target, key, url, content, filename, mimeType }) => {
			let entityId: string;
			let display: string;
			if (target === 'ticket') {
				const t = await loadVisibleTicket(ctx, key);
				entityId = t.id;
				display = t.displayId;
			} else {
				const ref = await loadVisibleTaskRef(ctx, key);
				entityId = ref.id;
				display = ref.display;
			}
			const a = content
				? await attachBytes(ctx.locals, {
						entityType: target,
						entityId,
						bytes: decodeInlineUpload(content),
						filename: filename!.trim(),
						mimeType
					})
				: await attachFromUrl(ctx.locals, {
						entityType: target,
						entityId,
						url: url!,
						filename: filename?.trim() || undefined
					});
			return text(
				`Attached **${a.filename}** (${a.mimeType}, ${formatBytes(a.sizeBytes)}) to ${display} — id \`${a.id}\`\n- Download: ${attachmentDownloadUrl(ctx.origin, a.id)}`,
				{
					id: a.id,
					filename: a.filename,
					mimeType: a.mimeType,
					sizeBytes: a.sizeBytes,
					target,
					key: display
				}
			);
		})
	);
}
