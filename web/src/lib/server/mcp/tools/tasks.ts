// Task tools. Scoping mirrors /api/v1/tasks: `accessibleProjectIds` for lists,
// `project.tasks.read` (404 on miss, never 403 — uuids must not leak) for
// detail, and the W2 `applyTaskUpdate` / `deleteTaskFully` / `logTaskTime` /
// `createTaskWithEffects` helpers for writes so activity, webhooks,
// notifications and audit rows match the app's.

import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import { accessibleProjectIds, assertCan, can } from '$lib/server/permissions';
import {
	ALLOWED_TASK_PRIORITY,
	ALLOWED_TASK_STATUS,
	ALLOWED_TASK_TYPE,
	applyTaskUpdate,
	createTaskWithEffects,
	deleteTaskFully,
	loadTasks,
	logTaskTime,
	resolveProjectByKey,
	resolveTaskByDisplayId,
	sanitizeTaskChecklist
} from '$lib/server/tasks'; // W2: applyTaskUpdate, createTaskWithEffects, deleteTaskFully, logTaskTime, resolveProjectByKey, resolveTaskByDisplayId, sanitizeTaskChecklist
import { loadAssignableUsers } from '$lib/server/tickets';
import { db } from '$lib/server/db';
import { project } from '$lib/server/db/app.schema';
import { inArray } from 'drizzle-orm';
import { attachFromUrl } from '$lib/server/attachments-fetch'; // W2
import { DETAIL_UI_URI, uiToolMeta } from '../ui';
import { normalizeTag } from '$lib/utils/label-meta';
import type { Task } from '$lib/types';
import { describeCandidates, normalizeDisplayId, normalizeKey, resolveUserRefs } from '../ids';
import {
	type UserDirectory,
	listMd,
	taskDetailDto,
	taskDetailMd,
	taskLine,
	taskSummary,
	taskUrl
} from '../format';
import {
	attachmentUrlsSchema,
	checklistSchema,
	DESTRUCTIVE,
	fail,
	guarded,
	isoDateSchema,
	limitSchema,
	parseDateInput,
	READ_ONLY,
	text,
	todayIso,
	userDirectory,
	WRITE,
	WRITE_IDEMPOTENT,
	type McpContext
} from './shared';

const TASK_STATUSES = [...ALLOWED_TASK_STATUS] as [string, ...string[]];
const TASK_PRIORITIES = [...ALLOWED_TASK_PRIORITY] as [string, ...string[]];
const TASK_TYPES = [...ALLOWED_TASK_TYPE] as [string, ...string[]];

const statusEnum = z.enum(TASK_STATUSES);
const priorityEnum = z.enum(TASK_PRIORITIES);
const typeEnum = z.enum(TASK_TYPES);

const taskKeySchema = z
	.string()
	.describe('Task display id, e.g. `WEB-12` (project key + number). Case-insensitive.');

// ─── Lookups ────────────────────────────────────────────────────────────────

export async function loadAccessibleProject(ctx: McpContext, projectKey: string) {
	const key = normalizeKey(projectKey);
	const project = await resolveProjectByKey(key);
	if (!project) fail(404, `Project ${key} not found.`);
	if (!(await can(ctx.locals, 'project.tasks.read', { projectId: project.id }))) {
		fail(404, `Project ${key} not found.`);
	}
	return project;
}

/** Name + accent colour of projects by key (only the keys that exist). */
export async function projectMetaByKey(
	keys: readonly string[]
): Promise<Map<string, { name: string; color: string }>> {
	const distinct = [...new Set(keys)];
	if (distinct.length === 0) return new Map();
	const rows = await db
		.select({ key: project.key, name: project.name, color: project.color })
		.from(project)
		.where(inArray(project.key, distinct));
	return new Map(rows.map((r) => [r.key, { name: r.name, color: r.color }]));
}

/** Task ref the caller may read, or 404 (unknown and no-access look the same). */
export async function loadVisibleTaskRef(
	ctx: McpContext,
	key: string
): Promise<{ id: string; projectId: string; display: string }> {
	const display = normalizeDisplayId(key);
	const ref = await resolveTaskByDisplayId(display);
	if (!ref) fail(404, `Task ${display} not found.`);
	if (!(await can(ctx.locals, 'project.tasks.read', { projectId: ref.projectId }))) {
		fail(404, `Task ${display} not found.`);
	}
	return { id: ref.id, projectId: ref.projectId, display };
}

export type TaskDetail = { task: Task; users: UserDirectory; markdown: string };

/** Full task view (detail tool + resource): fields, checklist, files, comments, time. */
export async function loadTaskDetail(ctx: McpContext, key: string): Promise<TaskDetail> {
	const ref = await loadVisibleTaskRef(ctx, key);
	const tasks = await loadTasks({ projectId: ref.projectId, plannerUserId: ctx.locals.user.id });
	const task = tasks.find((t) => t.uuid === ref.id);
	if (!task) fail(404, `Task ${ref.display} not found.`);
	const users = await userDirectory([
		task.createdBy,
		...(task.assignees ?? []),
		...(task.comments ?? []).map((c) => c.user),
		...(task.timeLogs ?? []).map((l) => l.user)
	]);
	return { task, users, markdown: taskDetailMd({ task, users, origin: ctx.origin }) };
}

/** Task assignees are internal users only — same directory the web picker uses. */
async function resolveTaskAssignees(refs: readonly string[]): Promise<string[]> {
	if (refs.length === 0) return [];
	const candidates = (await loadAssignableUsers([])).filter((u) => u.internal);
	const { ids, unknown } = resolveUserRefs(refs, candidates);
	if (unknown.length) {
		fail(
			400,
			`Unknown assignee(s): ${unknown.join(', ')}. Tasks can only be assigned to internal team members:\n${describeCandidates(candidates)}`
		);
	}
	return ids;
}

async function attachUrls(
	ctx: McpContext,
	entityId: string,
	urls: readonly string[] | undefined
): Promise<string[]> {
	const notes: string[] = [];
	for (const url of urls ?? []) {
		try {
			const a = await attachFromUrl(ctx.locals, { entityType: 'task', entityId, url });
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

export function registerTaskTools(server: McpServer, ctx: McpContext): void {
	server.registerTool(
		'list_tasks',
		{
			title: 'List tasks',
			description: `List project tasks you can see. \`scope\`: \`mine\` (assigned to you or created by you — default) or \`all\`. Optional filters: \`projectKey\`; \`status\` (one value or an array, e.g. all non-done statuses for "still open": ${TASK_STATUSES.join(' | ')}); \`priority\` (${TASK_PRIORITIES.join(' | ')}); \`type\` (${TASK_TYPES.join(' | ')}); \`assignee\` (user id or email, or the literal \`unassigned\` for tasks with nobody assigned). Archived tasks and tasks of archived projects are excluded. Rows are compact (key, title, status, priority, type, assignees, due, updated); call \`get_task\` for description, checklist, comments and time logs. Text only — to show the user a visual list, call \`show_items\` with the keys once you know which tasks matter.`,
			inputSchema: z.object({
				scope: z.enum(['mine', 'all']).default('mine').describe('`mine` (default) or `all`.'),
				projectKey: z.string().optional().describe('Only tasks of this project (project key).'),
				status: z
					.union([statusEnum, z.array(statusEnum)])
					.optional()
					.describe(`Only these statuses — one value or an array (${TASK_STATUSES.join(' | ')}).`),
				priority: z
					.enum(TASK_PRIORITIES)
					.optional()
					.describe(`Only this priority (${TASK_PRIORITIES.join(' | ')}).`),
				type: z
					.enum(TASK_TYPES)
					.optional()
					.describe(`Only this type (${TASK_TYPES.join(' | ')}).`),
				assignee: z
					.string()
					.optional()
					.describe('Only tasks assigned to this user (id or email), or `unassigned`.'),
				limit: limitSchema
			}),
			outputSchema: z.object({
				total: z.number(),
				tasks: z.array(
					z.object({
						key: z.string(),
						title: z.string(),
						status: z.string(),
						priority: z.string(),
						type: z.string(),
						projectKey: z.string(),
						projectName: z.string(),
						projectColor: z.string(),
						assignees: z.array(z.object({ id: z.string(), name: z.string() })),
						due: z.string().nullable(),
						tags: z.array(z.string()),
						updated: z.string(),
						checklist: z.string(),
						url: z.string()
					})
				)
			}),
			annotations: READ_ONLY
		},
		guarded(async ({ scope, projectKey, status, priority, type, assignee, limit }) => {
			const uid = ctx.locals.user.id;
			let rows: Task[];
			if (projectKey) {
				const project = await loadAccessibleProject(ctx, projectKey);
				rows = await loadTasks({ projectId: project.id, plannerUserId: uid });
			} else {
				const access = accessibleProjectIds(ctx.locals);
				rows = await loadTasks(
					access.all ? { plannerUserId: uid } : { projectIds: [...access.ids], plannerUserId: uid }
				);
			}
			if (scope === 'mine') {
				rows = rows.filter((t) => (t.assignees ?? []).includes(uid) || t.createdBy === uid);
			}
			if (status) {
				const wanted = new Set<string>(Array.isArray(status) ? status : [status]);
				rows = rows.filter((t) => wanted.has(t.status));
			}
			if (priority) rows = rows.filter((t) => t.priority === priority);
			if (type) rows = rows.filter((t) => t.type === type);
			if (assignee) {
				if (/^(unassigned|none)$/i.test(assignee.trim())) {
					rows = rows.filter((t) => (t.assignees ?? []).length === 0);
				} else {
					const [id] = await resolveTaskAssignees([assignee]);
					rows = rows.filter((t) => (t.assignees ?? []).includes(id));
				}
			}
			const total = rows.length;
			const page = rows.slice(0, limit);
			const users = await userDirectory(page.flatMap((t) => t.assignees ?? []));
			// The list widget groups rows under a project header (name + colour
			// dot), like the tasks page does.
			const projects = await projectMetaByKey(page.map((t) => t.project));
			const lines = page.map((t) => taskLine(t, users));
			return text(
				listMd(
					`Tasks (${scope}${projectKey ? `, ${normalizeKey(projectKey)}` : ''})`,
					lines,
					total
				),
				{
					total,
					tasks: page.map((t) => {
						const meta = projects.get(t.project);
						return {
							...taskSummary(t, users),
							projectName: meta?.name ?? t.project,
							projectColor: meta?.color ?? '#7a9cf0',
							url: taskUrl(ctx.origin, t.id)
						};
					})
				}
			);
		})
	);

	server.registerTool(
		'get_task',
		{
			title: 'Get task',
			description:
				'Full view of one task by display id (e.g. `WEB-12`): fields, description (markdown), checklist with item ids, attachments with ids and download URLs, comments, time logs, and the source ticket if it was converted from one.',
			inputSchema: z.object({ key: taskKeySchema }),
			annotations: READ_ONLY,
			_meta: uiToolMeta(DETAIL_UI_URI)
		},
		guarded(async ({ key }) => {
			const d = await loadTaskDetail(ctx, key);
			return text(d.markdown, { task: taskDetailDto(d.task, d.users, ctx.origin) });
		})
	);

	server.registerTool(
		'create_task',
		{
			title: 'Create task',
			description:
				'Create a task in a project (`projectKey`, see `list_projects`; requires project.tasks.create). `description` is markdown. Defaults: status `todo`, priority `none`, type `task`. `assignees` are internal team members (ids or emails); when omitted or none valid, the task is assigned to you. Optional `due` (YYYY-MM-DD), `estimateMinutes`, `tags`, `checklist`, `attachmentUrls`. Keep it to what the user said: a title, and a description/checklist/tags only when they supplied that content. Returns the new task key.',
			inputSchema: z.object({
				projectKey: z.string().describe('Project key (e.g. `WEB`).'),
				title: z.string().min(1).max(300).describe('Task title, in the user’s own words.'),
				description: z
					.string()
					.optional()
					.describe(
						'Body in markdown. Only the details the user gave; omit when the title says it all.'
					),
				status: statusEnum
					.default('todo')
					.describe(`Status (default \`todo\`; ${TASK_STATUSES.join(' | ')}).`),
				priority: priorityEnum
					.default('none')
					.describe(`Priority (default \`none\`; ${TASK_PRIORITIES.join(' | ')}).`),
				type: typeEnum
					.default('task')
					.describe(`Type (default \`task\`; ${TASK_TYPES.join(' | ')}).`),
				due: z.string().optional().describe('Due date (YYYY-MM-DD or ISO 8601).'),
				estimateMinutes: z.number().int().positive().optional().describe('Estimate in minutes.'),
				tags: z
					.array(z.string())
					.optional()
					.describe(
						'Tags (normalized to lowercase, max 24 chars). Only when the user named them or the project already uses them.'
					),
				assignees: z
					.array(z.string())
					.optional()
					.describe('Assignee user ids or emails (internal users only).'),
				checklist: checklistSchema.optional(),
				attachmentUrls: attachmentUrlsSchema
			}),
			annotations: WRITE,
			_meta: uiToolMeta(DETAIL_UI_URI)
		},
		guarded(async (args) => {
			const { locals, origin } = ctx;
			const key = normalizeKey(args.projectKey);
			const project = await resolveProjectByKey(key);
			if (!project) fail(404, `Project ${key} not found.`);
			await assertCan(locals, 'project.tasks.create', { projectId: project.id });

			const dueDate = args.due ? parseDateInput(args.due, 'due date') : null;
			const tags = [...new Set((args.tags ?? []).map((t) => normalizeTag(t)).filter(Boolean))];
			const assigneeIds = await resolveTaskAssignees(args.assignees ?? []);
			const checklist = args.checklist ? (sanitizeTaskChecklist(args.checklist) ?? []) : undefined;

			const created = await createTaskWithEffects(
				locals,
				{
					projectId: project.id,
					projectKey: project.key,
					title: args.title.trim(),
					description: args.description?.trim() || null,
					status: args.status,
					priority: args.priority,
					type: args.type,
					dueDate,
					estimateMinutes: args.estimateMinutes ?? null,
					tags,
					checklist,
					assigneeIds,
					createdBy: locals.user.id
				},
				{ origin, via: 'mcp' }
			);
			const notes = await attachUrls(ctx, created.id, args.attachmentUrls);
			const md = [
				`Created task **${created.displayId}** — ${args.title.trim()}`,
				`- Project: ${project.name} (${project.key}) · Status: ${args.status} · Priority: ${args.priority} · Type: ${args.type}`,
				`- Assignees: ${created.assignedIds.join(', ')}${dueDate ? ` · Due: ${dueDate.toISOString().slice(0, 10)}` : ''}`,
				...(notes.length ? ['', 'Attachments:', ...notes] : [])
			].join('\n');
			const fresh = await loadTaskDetail(ctx, created.displayId);
			return text(md, {
				key: created.displayId,
				id: created.id,
				attachments: notes,
				task: taskDetailDto(fresh.task, fresh.users, origin)
			});
		})
	);

	server.registerTool(
		'update_task',
		{
			title: 'Update task',
			description:
				'Change task fields. Requires project.tasks.edit.any, or being the creator with project.tasks.edit.own. Pass only the fields the user asked to change (leave everything else untouched): `title`, `description` (markdown, replaces; empty string clears), `status`, `priority`, `type`, `due` (YYYY-MM-DD; null clears), `estimateMinutes` (null clears), `tags` (full list), `assignees` (full list of internal user ids/emails), `checklist` (full replace — see `checklist_toggle`), `plannedFor` (plan into YOUR week: YYYY-MM-DD, null removes; only needs read access). Status changes notify and log activity like the app.',
			inputSchema: z.object({
				key: taskKeySchema,
				title: z.string().min(1).max(300).optional().describe('New title.'),
				description: z
					.string()
					.optional()
					.describe(
						'New description (markdown, replaces the whole body — read the task first and keep what the user did not ask to change).'
					),
				status: statusEnum.optional().describe(`New status (${TASK_STATUSES.join(' | ')}).`),
				priority: priorityEnum.optional().describe('New priority.'),
				type: typeEnum.optional().describe('New type.'),
				due: z.string().nullable().optional().describe('Due date (YYYY-MM-DD) or null to clear.'),
				estimateMinutes: z
					.number()
					.int()
					.nullable()
					.optional()
					.describe('Estimate in minutes or null to clear.'),
				tags: z.array(z.string()).optional().describe('Full tag list; [] clears.'),
				assignees: z
					.array(z.string())
					.optional()
					.describe('Full assignee list; [] clears (internal users only).'),
				checklist: checklistSchema.optional(),
				plannedFor: isoDateSchema
					.nullable()
					.optional()
					.describe('Plan into your week (YYYY-MM-DD) or null to unplan.')
			}),
			annotations: WRITE_IDEMPOTENT,
			_meta: uiToolMeta(DETAIL_UI_URI)
		},
		guarded(async (args) => {
			const ref = await loadVisibleTaskRef(ctx, args.key);
			const patch: Parameters<typeof applyTaskUpdate>[2] = {};
			if (args.title !== undefined) patch.title = args.title;
			if (args.description !== undefined) patch.description = args.description;
			if (args.status !== undefined) patch.status = args.status;
			if (args.priority !== undefined) patch.priority = args.priority;
			if (args.type !== undefined) patch.type = args.type;
			if (args.due !== undefined) {
				patch.due = args.due ? parseDateInput(args.due, 'due date').toISOString() : null;
			}
			if (args.estimateMinutes !== undefined) patch.estimate = args.estimateMinutes;
			if (args.tags !== undefined) patch.tags = args.tags;
			if (args.checklist !== undefined) patch.checklist = args.checklist;
			if (args.assignees !== undefined) {
				patch.assigneeIds = await resolveTaskAssignees(args.assignees);
			}
			if (args.plannedFor !== undefined) patch.plannedFor = args.plannedFor;
			if (Object.keys(patch).length === 0)
				fail(400, 'Nothing to update — pass at least one field.');

			const result = await applyTaskUpdate(ctx.locals, ref.id, patch, {
				origin: ctx.origin,
				via: 'mcp'
			});
			const fresh = await loadTaskDetail(ctx, ref.display);
			const head = result.changed
				? `Updated **${ref.display}** (${Object.keys(patch).join(', ')}).`
				: `No changes for **${ref.display}**.`;
			return text(`${head}\n${taskLine(fresh.task, fresh.users)}`, {
				key: ref.display,
				changed: result.changed,
				task: taskDetailDto(fresh.task, fresh.users, ctx.origin)
			});
		})
	);

	server.registerTool(
		'delete_task',
		{
			title: 'Delete task',
			description:
				'Soft-delete a task (requires project.tasks.delete.any). Its attachments and comment files are removed. Idempotent: an already-deleted task answers 404.',
			inputSchema: z.object({ key: taskKeySchema }),
			annotations: DESTRUCTIVE
		},
		guarded(async ({ key }) => {
			const ref = await loadVisibleTaskRef(ctx, key);
			await deleteTaskFully(ctx.locals, ref.id, { origin: ctx.origin, via: 'mcp' });
			return text(`Deleted task **${ref.display}**.`, { key: ref.display, deleted: true });
		})
	);

	server.registerTool(
		'log_time',
		{
			title: 'Log time on task',
			description:
				'Add a time-log entry to a task (any user who can read the task). `minutes` > 0, `date` YYYY-MM-DD (default today), optional `note`. Logs activity and emits the task.time_logged webhook like the app.',
			inputSchema: z.object({
				taskKey: taskKeySchema,
				minutes: z.number().int().positive().describe('Minutes spent (positive integer).'),
				date: isoDateSchema.optional().describe('Work date YYYY-MM-DD (default: today, UTC).'),
				note: z.string().max(1000).optional().describe('What was done (plain text).')
			}),
			annotations: WRITE,
			_meta: uiToolMeta(DETAIL_UI_URI)
		},
		guarded(async ({ taskKey, minutes, date, note }) => {
			const ref = await loadVisibleTaskRef(ctx, taskKey);
			const day = date ?? todayIso();
			await logTaskTime(
				ctx.locals,
				ref.id,
				{ minutes, date: day, note: note?.trim() || undefined },
				{ origin: ctx.origin, via: 'mcp' }
			);
			const fresh = await loadTaskDetail(ctx, ref.display);
			return text(
				`Logged ${minutes} min on **${ref.display}** for ${day}${note ? ` — ${note}` : ''}.`,
				{
					key: ref.display,
					minutes,
					date: day,
					task: taskDetailDto(fresh.task, fresh.users, ctx.origin)
				}
			);
		})
	);
}
