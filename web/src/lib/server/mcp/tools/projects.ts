// Project tools. Reads mirror /api/v1/projects (accessibleProjectIds +
// project.tasks.read); writes go through the W2 `createProject` /
// `updateProject` extractions of the web form actions (project.create /
// project.edit).

import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import { assertCan } from '$lib/server/permissions';
import type { ActivityItem } from '$lib/server/activity/feed';
import {
	createProject,
	getProjectDetail,
	listProjectsFor,
	updateProject
} from '$lib/server/projects'; // W2
import { resolveProjectByKey } from '$lib/server/tasks'; // W2
import { normalizeKey } from '../ids';
import {
	listMd,
	projectDetailMd,
	projectLine,
	projectSummary,
	type ProjectRowLike
} from '../format';
import {
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
import { resolveOrgByKey } from './tickets';

export const PROJECT_STATUSES = [
	'prospect',
	'planned',
	'active',
	'paused',
	'completed',
	'cancelled',
	'archived'
] as const;

const statusEnum = z.enum(PROJECT_STATUSES);

const projectKeySchema = z.string().describe('Project key, e.g. `WEB` (case-insensitive).');

/** One activity-feed row as a compact line: time · actor · what. */
function activityLine(a: ActivityItem): string {
	const meta = a.meta ?? {};
	const ref = typeof meta.taskRef === 'string' ? ` ${meta.taskRef}` : '';
	const title = typeof meta.taskTitle === 'string' ? ` ${meta.taskTitle}` : '';
	const change =
		meta.from !== undefined || meta.to !== undefined
			? ` (${String(meta.from ?? '—')} → ${String(meta.to ?? '—')})`
			: '';
	const body = a.body ? ` — ${a.body.slice(0, 120)}` : '';
	return `- ${a.createdAt} · ${a.actor?.name ?? 'system'} · ${a.type}${ref}${title}${change}${body}`;
}

export function registerProjectTools(server: McpServer, ctx: McpContext): void {
	server.registerTool(
		'list_projects',
		{
			title: 'List projects',
			description:
				'Projects you can see (internal staff: all; others: projects you are a member of). Archived projects are hidden unless `includeArchived` is true. Rows: key (use it for `list_tasks` / `create_task` / `get_project`), name, status, client org, open task count.',
			inputSchema: z.object({
				includeArchived: z.boolean().default(false).describe('Include archived projects.'),
				status: statusEnum.optional().describe('Only projects in this status.'),
				limit: limitSchema
			}),
			outputSchema: z.object({
				total: z.number(),
				projects: z.array(
					z.object({
						key: z.string(),
						name: z.string(),
						status: z.string(),
						orgKey: z.string().nullable(),
						orgName: z.string().nullable(),
						taskCount: z.number().nullable(),
						updatedAt: z.string().nullable()
					})
				)
			}),
			annotations: READ_ONLY
		},
		guarded(async ({ includeArchived, status, limit }) => {
			let rows: ProjectRowLike[] = await listProjectsFor(ctx.locals);
			if (!includeArchived) rows = rows.filter((p) => (p.status ?? 'active') !== 'archived');
			if (status) rows = rows.filter((p) => (p.status ?? 'active') === status);
			rows.sort((a, b) => a.key.localeCompare(b.key));
			const total = rows.length;
			const page = rows.slice(0, limit);
			return text(listMd('Projects', page.map(projectLine), total), {
				total,
				projects: page.map(projectSummary)
			});
		})
	);

	server.registerTool(
		'get_project',
		{
			title: 'Get project',
			description:
				'Project detail by key: name, status, client org, lead, members, open task count, description, and recent activity. Use `list_tasks` with `projectKey` for its tasks and `list_notes` with `projectKey` for meeting notes.',
			inputSchema: z.object({ key: projectKeySchema }),
			annotations: READ_ONLY
		},
		guarded(async ({ key }) => {
			const k = normalizeKey(key);
			const ref = await resolveProjectByKey(k);
			if (!ref) fail(404, `Project ${k} not found.`);
			await assertCan(ctx.locals, 'project.tasks.read', { projectId: ref.id });
			const detail = await getProjectDetail(ctx.locals, ref.id, { activityLimit: 20 });
			if (!detail) fail(404, `Project ${k} not found.`);
			const users = await userDirectory([detail.leadId]);
			const extra = detail.activity.length
				? `## Recent activity\n\n${detail.activity.map(activityLine).join('\n')}`
				: undefined;
			const { activity, ...project } = detail;
			return text(projectDetailMd(project, users, extra), {
				project,
				activity: activity.map((a) => ({
					id: a.id,
					type: a.type,
					createdAt: a.createdAt,
					actor: a.actor?.name ?? null,
					taskRef: a.meta?.taskRef ?? null,
					body: a.body
				}))
			});
		})
	);

	server.registerTool(
		'create_project',
		{
			title: 'Create project',
			description:
				'Create a project (requires project.create — internal staff). `key` is 1–5 letters/digits, upper-cased, must be unique (task ids become `KEY-n`). Optional `orgKey` links a client organization (omit for internal work), `description`, `status` (default `active`). You become a member. Templates and member lists are desktop-only.',
			inputSchema: z.object({
				name: z.string().min(1).max(200).describe('Project name.'),
				key: z
					.string()
					.min(1)
					.max(5)
					.regex(/^[A-Za-z0-9]+$/, 'Letters and digits only')
					.describe('Short unique key (1–5 letters/digits, e.g. `WEB`).'),
				orgKey: z.string().optional().describe('Client organization key (omit for internal).'),
				description: z.string().optional().describe('Description (markdown).'),
				status: statusEnum.default('active').describe('Initial status (default `active`).')
			}),
			annotations: WRITE
		},
		guarded(async ({ name, key, orgKey, description, status }) => {
			await assertCan(ctx.locals, 'project.create');
			let orgId: string | null = null;
			if (orgKey) {
				const org = await resolveOrgByKey(orgKey);
				if (!org) fail(404, `Organization ${normalizeKey(orgKey)} not found.`);
				orgId = org.id;
			}
			const k = normalizeKey(key);
			if (await resolveProjectByKey(k)) fail(409, `Project key ${k} is already in use.`);
			const created = await createProject(
				ctx.locals,
				{ name: name.trim(), key: k, description: description?.trim() || null, orgId, status },
				{ origin: ctx.origin, via: 'mcp' }
			);
			const id = typeof created === 'string' ? created : (created as { id: string }).id;
			return text(`Created project **${k}** — ${name.trim()} (status ${status}).`, {
				key: k,
				id,
				name: name.trim(),
				status
			});
		})
	);

	server.registerTool(
		'update_project',
		{
			title: 'Update project',
			description:
				'Change project `name`, `description` (markdown; empty string clears), `status` or `color` (hex). Requires project.edit on the project. Setting status `archived` hides it and its tasks from lists. Pass only the fields to change.',
			inputSchema: z.object({
				key: projectKeySchema,
				name: z.string().min(1).max(200).optional().describe('New name.'),
				description: z.string().optional().describe('New description (markdown).'),
				status: statusEnum.optional().describe(`New status (${PROJECT_STATUSES.join(' | ')}).`),
				color: z
					.string()
					.regex(/^#[0-9a-fA-F]{6}$/, 'Expected #rrggbb')
					.optional()
					.describe('Accent color as #rrggbb.')
			}),
			annotations: WRITE_IDEMPOTENT
		},
		guarded(async ({ key, name, description, status, color }) => {
			const k = normalizeKey(key);
			const ref = await resolveProjectByKey(k);
			if (!ref) fail(404, `Project ${k} not found.`);
			await assertCan(ctx.locals, 'project.edit', { projectId: ref.id });
			const patch: Parameters<typeof updateProject>[2] = {};
			if (name !== undefined) patch.name = name.trim();
			if (description !== undefined) patch.description = description.trim() || null;
			if (status !== undefined) patch.status = status;
			if (color !== undefined) patch.color = color;
			if (Object.keys(patch).length === 0)
				fail(400, 'Nothing to update — pass at least one field.');
			await updateProject(ctx.locals, ref.id, patch, { origin: ctx.origin, via: 'mcp' });
			return text(`Updated project **${k}** (${Object.keys(patch).join(', ')}).`, {
				key: k,
				fields: Object.keys(patch)
			});
		})
	);
}
