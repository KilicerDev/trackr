// Ticket tools. Scoping mirrors /api/v1/tickets exactly: the read.any /
// read.own org split for lists, `canViewTicket` for detail, `org.tickets.*`
// grants for writes. All mutations go through the W2 helpers so notifications,
// webhooks, system events and audit rows are identical to the app's.

import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/app.schema';
import { can, canViewTicket, isTrackrTeam } from '$lib/server/permissions';
import {
	applyTicketUpdate,
	createTicketWithEffects,
	deleteTicketFully,
	getTicket,
	loadAssignableUsers,
	loadTickets,
	loadTicketMessages,
	resolveTicketByDisplayId,
	sanitizeTicketChecklist,
	TICKET_CATEGORIES,
	TICKET_PRIORITIES,
	TICKET_STATUSES,
	type TicketCategory,
	type TicketPriority,
	type TicketRow,
	type TicketStatus
} from '$lib/server/tickets'; // W2: applyTicketUpdate, createTicketWithEffects, deleteTicketFully, resolveTicketByDisplayId
import { listLinkedTasks } from '$lib/server/tasks';
import { listAttachments, listAttachmentsForMany } from '$lib/server/attachments';
import { attachFromUrl } from '$lib/server/attachments-fetch'; // W2
import { describeCandidates, normalizeDisplayId, resolveUserRefs } from '../ids';
import {
	listMd,
	ticketDetailMd,
	ticketLine,
	ticketSummary,
	type TicketMessageWithFiles
} from '../format';
import {
	attachmentUrlsSchema,
	checklistSchema,
	DESTRUCTIVE,
	fail,
	guarded,
	limitSchema,
	READ_ONLY,
	text,
	userDirectory,
	WRITE,
	WRITE_IDEMPOTENT,
	type McpContext
} from './shared';

const statusEnum = z.enum(TICKET_STATUSES);
const priorityEnum = z.enum(TICKET_PRIORITIES);
const categoryEnum = z.enum(TICKET_CATEGORIES);

const ticketKeySchema = z
	.string()
	.describe('Ticket display id, e.g. `TRACK-108` (org key + number). Case-insensitive.');

// ─── Scoping (mirror of routes/api/v1/tickets/+server.ts) ───────────────────

async function loadAccessibleTickets(
	ctx: McpContext,
	extra: { ownerUserId?: string; pinnedByUserId?: string } = {}
): Promise<TicketRow[]> {
	const { locals } = ctx;
	if (isTrackrTeam(locals)) {
		return loadTickets({ includeInternalMessages: true, ...extra });
	}
	const myOrgIds = locals.memberships.orgs.map((o) => o.orgId);
	if (myOrgIds.length === 0) return [];
	const anyOrgIds: string[] = [];
	const ownOrgIds: string[] = [];
	for (const orgId of myOrgIds) {
		if (await can(locals, 'org.tickets.read.any', { orgId })) anyOrgIds.push(orgId);
		else if (await can(locals, 'org.tickets.read.own', { orgId })) ownOrgIds.push(orgId);
	}
	const uid = locals.user.id;
	const [anyRows, ownRows] = await Promise.all([
		anyOrgIds.length ? loadTickets({ orgIds: anyOrgIds, ...extra }) : Promise.resolve([]),
		ownOrgIds.length
			? loadTickets({ orgIds: ownOrgIds, ...extra, ownerUserId: uid })
			: Promise.resolve([])
	]);
	return [...anyRows, ...ownRows];
}

export async function resolveOrgByKey(
	key: string
): Promise<{ id: string; key: string; name: string; isInternal: boolean } | null> {
	const [row] = await db
		.select({
			id: organization.id,
			key: organization.key,
			name: organization.name,
			isInternal: organization.isInternal
		})
		.from(organization)
		.where(eq(organization.key, key.trim().toUpperCase()))
		.limit(1);
	return row ?? null;
}

/** Ticket the caller may see, or a 404 (unknown and invisible look the same). */
export async function loadVisibleTicket(ctx: McpContext, key: string): Promise<TicketRow> {
	const display = normalizeDisplayId(key);
	const ref = await resolveTicketByDisplayId(display);
	const ticket = ref ? await getTicket(ref.id) : null;
	if (!ticket) fail(404, `Ticket ${display} not found.`);
	if (!(await canViewTicket(ctx.locals, ticket))) fail(404, `Ticket ${display} not found.`);
	return ticket;
}

async function resolveTicketAssignees(orgId: string, refs: readonly string[]): Promise<string[]> {
	if (refs.length === 0) return [];
	const candidates = await loadAssignableUsers([orgId]);
	const { ids, unknown } = resolveUserRefs(refs, candidates);
	if (unknown.length) {
		fail(
			400,
			`Unknown assignee(s): ${unknown.join(', ')}. Assignable users for this org:\n${describeCandidates(candidates)}`
		);
	}
	return ids;
}

export type TicketDetail = {
	ticket: TicketRow;
	messages: TicketMessageWithFiles[];
	attachments: Awaited<ReturnType<typeof listAttachments>>;
	linkedTasks: Awaited<ReturnType<typeof listLinkedTasks>>;
	markdown: string;
};

/** Full ticket view (detail tool + resource): fields, timeline, files, links. */
export async function loadTicketDetail(ctx: McpContext, key: string): Promise<TicketDetail> {
	const ticket = await loadVisibleTicket(ctx, key);
	const staff = isTrackrTeam(ctx.locals);
	const rawMessages = await loadTicketMessages(ticket.id, { includeInternal: staff });
	const [attachments, messageAttachments, linkedTasks] = await Promise.all([
		listAttachments('ticket', ticket.id),
		listAttachmentsForMany(
			'message',
			rawMessages.map((m) => m.id)
		),
		staff ? listLinkedTasks(ticket.id) : Promise.resolve([])
	]);
	const messages: TicketMessageWithFiles[] = rawMessages.map((m) => ({
		...m,
		attachments: messageAttachments.get(m.id) ?? []
	}));
	const users = await userDirectory([
		ticket.customerId,
		ticket.createdBy,
		...ticket.assignees,
		...messages.map((m) => m.authorId),
		...messages.flatMap((m) => {
			const meta = m.meta;
			if (!meta || meta.event !== 'assigned') return [];
			return [...((meta.added as string[]) ?? []), ...((meta.removed as string[]) ?? [])];
		})
	]);
	const markdown = ticketDetailMd({
		ticket,
		messages,
		attachments,
		users,
		linkedTasks,
		origin: ctx.origin
	});
	return { ticket, messages, attachments, linkedTasks, markdown };
}

async function attachUrls(
	ctx: McpContext,
	entityType: 'ticket' | 'task',
	entityId: string,
	urls: readonly string[] | undefined
): Promise<string[]> {
	const notes: string[] = [];
	for (const url of urls ?? []) {
		try {
			const a = await attachFromUrl(ctx.locals, { entityType, entityId, url });
			notes.push(`- attached ${a.filename} (id \`${a.id}\`)`);
		} catch (err) {
			const msg =
				err instanceof Error
					? err.message
					: typeof err === 'object' && err && 'body' in err
						? String((err as { body?: { message?: string } }).body?.message ?? 'failed')
						: 'failed';
			notes.push(`- FAILED ${url}: ${msg}`);
		}
	}
	return notes;
}

// ─── Registration ───────────────────────────────────────────────────────────

export function registerTicketTools(server: McpServer, ctx: McpContext): void {
	server.registerTool(
		'list_tickets',
		{
			title: 'List tickets',
			description:
				'List support tickets you can see. `segment`: `mine` (customer, creator or assignee — default), `watched` (pinned by you), `all` (everything your roles allow). Filter by `status` and/or `orgKey`. Rows are compact (key, subject, status, priority, assignees, last activity), newest activity first; call `get_ticket` for the full conversation.',
			inputSchema: z.object({
				segment: z
					.enum(['mine', 'watched', 'all'])
					.default('mine')
					.describe('Which slice to list (default `mine`).'),
				status: statusEnum.optional().describe('Only tickets in this status.'),
				orgKey: z.string().optional().describe('Only tickets of this organization (org key).'),
				limit: limitSchema
			}),
			outputSchema: z.object({
				total: z.number(),
				tickets: z.array(
					z.object({
						key: z.string(),
						subject: z.string(),
						status: z.string(),
						priority: z.string(),
						category: z.string(),
						orgKey: z.string(),
						orgName: z.string(),
						assignees: z.array(z.object({ id: z.string(), name: z.string() })),
						customer: z.object({ id: z.string(), name: z.string() }).nullable(),
						messageCount: z.number(),
						lastActivityAt: z.string().nullable(),
						updatedAt: z.string(),
						createdAt: z.string()
					})
				)
			}),
			annotations: READ_ONLY
		},
		guarded(async ({ segment, status, orgKey, limit }) => {
			const uid = ctx.locals.user.id;
			let rows: TicketRow[];
			if (segment === 'watched') rows = await loadAccessibleTickets(ctx, { pinnedByUserId: uid });
			else if (segment === 'all') rows = await loadAccessibleTickets(ctx);
			else rows = await loadAccessibleTickets(ctx, { ownerUserId: uid });

			if (status) rows = rows.filter((t) => t.status === status);
			if (orgKey) {
				const org = await resolveOrgByKey(orgKey);
				if (!org) fail(404, `Organization ${orgKey.toUpperCase()} not found.`);
				rows = rows.filter((t) => t.orgId === org.id);
			}
			rows.sort((a, b) =>
				(b.lastMessageAt ?? b.updatedAt).localeCompare(a.lastMessageAt ?? a.updatedAt)
			);
			const total = rows.length;
			const page = rows.slice(0, limit);
			const users = await userDirectory(page.flatMap((t) => [t.customerId, ...t.assignees]));
			const lines = page.map((t) => ticketLine(t, users));
			return text(listMd(`Tickets (${segment})`, lines, total), {
				total,
				tickets: page.map((t) => ticketSummary(t, users))
			});
		})
	);

	server.registerTool(
		'get_ticket',
		{
			title: 'Get ticket',
			description:
				'Full view of one ticket by display id (e.g. `TRACK-108`): fields, description (markdown), checklist with item ids, attachments with ids and download URLs, the message timeline (internal notes only if you are staff), and linked tasks. Attachment ids can be passed to `get_attachment`.',
			inputSchema: z.object({ key: ticketKeySchema }),
			annotations: READ_ONLY
		},
		guarded(async ({ key }) => {
			const d = await loadTicketDetail(ctx, key);
			return text(d.markdown, {
				ticket: {
					...d.ticket,
					messages: d.messages.map((m) => ({
						id: m.id,
						authorId: m.authorId,
						kind: m.kind,
						internal: m.isInternalNote,
						body: m.body,
						createdAt: m.createdAt,
						attachmentIds: m.attachments.map((a) => a.id)
					})),
					attachmentIds: d.attachments.map((a) => a.id),
					linkedTasks: d.linkedTasks
				}
			});
		})
	);

	server.registerTool(
		'create_ticket',
		{
			title: 'Create ticket',
			description:
				'Create a support ticket in an organization (`orgKey`, see `list_orgs`). `description` is markdown. Agents (org.tickets.edit.any) may set `assignees`; for everyone else the ticket is filed with you as the customer and assignees are ignored. Optional `checklist`, `tags`, and `attachmentUrls` (fetched server-side). Returns the new ticket key. Notifies and audits exactly like the app.',
			inputSchema: z.object({
				orgKey: z.string().describe('Organization key the ticket belongs to (e.g. `TRACK`).'),
				subject: z.string().min(1).max(300).describe('Short subject line.'),
				description: z.string().optional().describe('Body in markdown.'),
				priority: priorityEnum.default('medium').describe('Priority (default `medium`).'),
				category: categoryEnum.default('general').describe('Category (default `general`).'),
				tags: z.array(z.string()).optional().describe('Free-form tags.'),
				assignees: z
					.array(z.string())
					.optional()
					.describe('Assignee user ids or emails (agents only; see `list_users` with `orgKey`).'),
				checklist: checklistSchema.optional(),
				attachmentUrls: attachmentUrlsSchema
			}),
			annotations: WRITE
		},
		guarded(async (args) => {
			const { locals, origin } = ctx;
			const org = await resolveOrgByKey(args.orgKey);
			if (!org) fail(404, `Organization ${args.orgKey.toUpperCase()} not found.`);
			if (!(await can(locals, 'org.tickets.create', { orgId: org.id }))) {
				fail(403, `You cannot create tickets in ${org.key}.`);
			}
			const isAgent = await can(locals, 'org.tickets.edit.any', { orgId: org.id });
			const assigneeIds = isAgent ? await resolveTicketAssignees(org.id, args.assignees ?? []) : [];
			const tags = [...new Set((args.tags ?? []).map((t) => t.trim()).filter(Boolean))];
			const checklist = args.checklist
				? (sanitizeTicketChecklist(args.checklist) ?? [])
				: undefined;
			const uid = locals.user.id;

			const created = await createTicketWithEffects(
				locals,
				{
					orgId: org.id,
					subject: args.subject.trim(),
					description: args.description?.trim() || null,
					priority: args.priority as TicketPriority,
					category: args.category as TicketCategory,
					channel: 'api',
					customerId: isAgent ? null : uid,
					assigneeIds,
					tags,
					createdBy: uid,
					checklist
				},
				{ origin, via: 'mcp' }
			);
			const notes = await attachUrls(ctx, 'ticket', created.id, args.attachmentUrls);
			const md = [
				`Created ticket **${created.displayId}** — ${args.subject.trim()}`,
				`- Org: ${org.name} (${org.key}) · Priority: ${args.priority} · Category: ${args.category}`,
				isAgent
					? `- Assignees: ${assigneeIds.length ? assigneeIds.join(', ') : 'unassigned'}`
					: '- Filed with you as the customer.',
				...(notes.length ? ['', 'Attachments:', ...notes] : [])
			].join('\n');
			return text(md, { key: created.displayId, id: created.id, attachments: notes });
		})
	);

	server.registerTool(
		'update_ticket',
		{
			title: 'Update ticket',
			description:
				'Change ticket fields (requires org.tickets.edit.any on the ticket’s org). Pass only the fields to change: `subject`, `description` (markdown, replaces), `status`, `priority`, `category`, `tags` (full list, [] clears), `assignees` (full list of ids/emails, [] unassigns), `checklist` (full replace — see `checklist_toggle` for one item). Status/priority/category/assignee changes appear in the ticket timeline and notify like the app.',
			inputSchema: z.object({
				key: ticketKeySchema,
				subject: z.string().min(1).max(300).optional().describe('New subject.'),
				description: z.string().optional().describe('New description in markdown (replaces).'),
				status: statusEnum.optional().describe(`New status (${TICKET_STATUSES.join(' | ')}).`),
				priority: priorityEnum.optional().describe('New priority.'),
				category: categoryEnum.optional().describe('New category.'),
				tags: z.array(z.string()).optional().describe('Full tag list; [] clears.'),
				assignees: z.array(z.string()).optional().describe('Full assignee list; [] unassigns.'),
				checklist: checklistSchema.optional()
			}),
			annotations: WRITE_IDEMPOTENT
		},
		guarded(async (args) => {
			const ticket = await loadVisibleTicket(ctx, args.key);
			if (!(await can(ctx.locals, 'org.tickets.edit.any', { orgId: ticket.orgId }))) {
				fail(403, `You cannot edit ${ticket.displayId}.`);
			}
			const patch: Parameters<typeof applyTicketUpdate>[2] = {};
			if (args.subject !== undefined) patch.subject = args.subject.trim();
			if (args.description !== undefined) patch.description = args.description;
			if (args.status !== undefined) patch.status = args.status as TicketStatus;
			if (args.priority !== undefined) patch.priority = args.priority as TicketPriority;
			if (args.category !== undefined) patch.category = args.category as TicketCategory;
			if (args.tags !== undefined) patch.tags = args.tags;
			if (args.assignees !== undefined) {
				patch.assigneeIds = await resolveTicketAssignees(ticket.orgId, args.assignees);
			}
			if (args.checklist !== undefined) patch.checklist = args.checklist;
			if (Object.keys(patch).length === 0)
				fail(400, 'Nothing to update — pass at least one field.');

			const result = await applyTicketUpdate(ctx.locals, ticket.id, patch, {
				origin: ctx.origin,
				via: 'mcp'
			});
			const users = await userDirectory([result.ticket.customerId, ...result.ticket.assignees]);
			const head = result.changed
				? `Updated **${ticket.displayId}** (${Object.keys(patch).join(', ')}).`
				: `No changes for **${ticket.displayId}** — values already matched.`;
			return text(`${head}\n${ticketLine(result.ticket, users)}`, {
				key: ticket.displayId,
				changed: result.changed,
				ticket: ticketSummary(result.ticket, users)
			});
		})
	);

	server.registerTool(
		'delete_ticket',
		{
			title: 'Delete ticket',
			description:
				'Soft-delete a ticket (requires org.tickets.delete.any — internal admin roles). The ticket disappears from every list and its attachments are removed. Idempotent: deleting an already-deleted ticket answers 404.',
			inputSchema: z.object({ key: ticketKeySchema }),
			annotations: DESTRUCTIVE
		},
		guarded(async ({ key }) => {
			const ticket = await loadVisibleTicket(ctx, key);
			if (!(await can(ctx.locals, 'org.tickets.delete.any', { orgId: ticket.orgId }))) {
				fail(403, `You cannot delete ${ticket.displayId}.`);
			}
			await deleteTicketFully(ctx.locals, ticket.id, { origin: ctx.origin, via: 'mcp' });
			return text(`Deleted ticket **${ticket.displayId}** (${ticket.subject}).`, {
				key: ticket.displayId,
				deleted: true
			});
		})
	);
}
