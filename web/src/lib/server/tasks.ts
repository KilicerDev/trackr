import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from './db';
import {
	project,
	message,
	thread,
	task,
	taskAssignee,
	taskPlanning,
	taskTimeLog,
	ticket,
	organization,
	organizationMember
} from './db/app.schema';
import { user, user as userTable } from './db/auth.schema';
import { error } from '@sveltejs/kit';
import { logActivity, logActivityFF } from './activity';
import { syncTicketChecklistFromTask, ticketDisplayId } from './tickets';
import type { Task } from '$lib/types';
import { deleteAttachmentsFor, listAttachmentsForMany } from './attachments';
import { can } from './permissions';
import { notifyTaskAssigned, notifyTaskStatusChanged } from './notify/events/task';
import { emitWebhookEvent, taskSnapshot } from './webhooks';
import { recordAudit } from './audit';
import { normalizeTag } from '$lib/utils/label-meta';
import { m } from '$lib/paraglide/messages';

// Drizzle's transaction callback parameter — structurally a subset of `db`.
export type Tx = Parameters<Parameters<(typeof db)['transaction']>[0]>[0];

function fmtDate(d: Date | null): string {
	if (!d) return '';
	return d.toISOString().slice(0, 10);
}

// Task field allow-lists, shared by every write path (form actions, JSON
// import) so a new value only has to be added in one place.
export const ALLOWED_TASK_STATUS = new Set([
	'backlog',
	'todo',
	'in_progress',
	'paused',
	'in_review',
	'done'
]);
export const ALLOWED_TASK_PRIORITY = new Set(['none', 'low', 'medium', 'high', 'urgent']);
export const ALLOWED_TASK_TYPE = new Set(['task', 'bug', 'improvement', 'feature', 'chore']);

/**
 * Load tasks shaped to match the legacy `Task` interface so existing
 * components (ListView, BoardView, Inspector) consume them unchanged.
 * Optionally filtered by project id.
 */
/** Tasks converted from this ticket — the ticket detail's back-links. */
export async function listLinkedTasks(
	ticketId: string
): Promise<{ id: string; displayId: string; title: string; status: string }[]> {
	const rows = await db
		.select({
			id: task.id,
			number: task.number,
			title: task.title,
			status: task.status,
			projectKey: project.key
		})
		.from(task)
		.innerJoin(project, eq(project.id, task.projectId))
		.where(and(eq(task.sourceTicketId, ticketId), isNull(task.deletedAt)));
	return rows.map((r) => ({
		id: r.id,
		displayId: `${r.projectKey}-${r.number}`,
		title: r.title,
		status: r.status
	}));
}

export async function loadTasks(opts?: {
	projectId?: string;
	projectIds?: string[];
	plannerUserId?: string;
}): Promise<Task[]> {
	// If an explicit list is passed and it's empty, short-circuit — the
	// caller is signalling "this user can see zero projects".
	if (opts?.projectIds && opts.projectIds.length === 0) return [];

	const conditions = [isNull(task.archivedAt), isNull(task.deletedAt)];
	if (opts?.projectId) {
		// Detail page can still see tasks of an archived project so the user
		// can review history before unarchiving / deleting.
		conditions.push(eq(task.projectId, opts.projectId));
	} else {
		// Global view excludes tasks whose parent project is archived.
		conditions.push(ne(project.status, 'archived'));
	}
	if (opts?.projectIds) {
		conditions.push(inArray(task.projectId, opts.projectIds));
	}

	const baseQuery = db
		.select({
			id: task.id,
			projectId: task.projectId,
			number: task.number,
			title: task.title,
			description: task.description,
			status: task.status,
			priority: task.priority,
			type: task.type,
			parentId: task.parentId,
			dueDate: task.dueDate,
			startDate: task.startDate,
			endDate: task.endDate,
			estimateMinutes: task.estimateMinutes,
			tags: task.tags,
			checklist: task.checklist,
			createdBy: task.createdBy,
			createdAt: task.createdAt,
			updatedAt: task.updatedAt,
			sourceTicketId: task.sourceTicketId,
			channel: task.channel,
			projectKey: project.key
		})
		.from(task)
		.innerJoin(project, eq(project.id, task.projectId))
		.where(and(...conditions));

	// Stable order: newest first, and never re-order on edit (status change,
	// comment, etc. bump updatedAt but must not make a row jump in the list).
	const taskRows = await baseQuery.orderBy(desc(task.createdAt));
	const taskIds = taskRows.map((t) => t.id);

	const attachmentsByTask = await listAttachmentsForMany('task', taskIds);

	const assigneeRows = taskIds.length
		? await db
				.select({ taskId: taskAssignee.taskId, userId: taskAssignee.userId })
				.from(taskAssignee)
				.where(inArray(taskAssignee.taskId, taskIds))
		: [];
	const assigneesByTask = new Map<string, string[]>();
	for (const r of assigneeRows) {
		const list = assigneesByTask.get(r.taskId) ?? [];
		list.push(r.userId);
		assigneesByTask.set(r.taskId, list);
	}

	// Comments live in `message`, under each task's thread (subjectType='task').
	// Same output shape as before so the Inspector is unchanged.
	const commentRows = taskIds.length
		? await db
				.select({
					id: message.id,
					taskId: thread.subjectId,
					authorId: message.authorId,
					body: message.body,
					createdAt: message.createdAt
				})
				.from(message)
				.innerJoin(thread, eq(thread.id, message.threadId))
				.where(
					and(
						eq(thread.subjectType, 'task'),
						inArray(thread.subjectId, taskIds),
						isNull(message.deletedAt)
					)
				)
		: [];
	// Attachments on comments, keyed by the comment's (now message) id.
	const commentAttachments = await listAttachmentsForMany(
		'message',
		commentRows.map((c) => c.id)
	);
	const commentsByTask = new Map<string, NonNullable<Task['comments']>>();
	for (const c of commentRows) {
		if (!c.taskId) continue;
		const list = commentsByTask.get(c.taskId) ?? [];
		const iso = c.createdAt.toISOString();
		list.push({
			id: c.id,
			user: c.authorId ?? '',
			date: iso.slice(0, 10),
			text: c.body ?? '',
			createdAt: iso,
			files: commentAttachments.get(c.id) ?? []
		});
		commentsByTask.set(c.taskId, list);
	}

	const timeLogRows = taskIds.length
		? await db
				.select({
					taskId: taskTimeLog.taskId,
					userId: taskTimeLog.userId,
					minutes: taskTimeLog.minutes,
					note: taskTimeLog.note,
					loggedAt: taskTimeLog.loggedAt,
					createdAt: taskTimeLog.createdAt
				})
				.from(taskTimeLog)
				.where(inArray(taskTimeLog.taskId, taskIds))
		: [];
	const logsByTask = new Map<
		string,
		{ user: string; date: string; minutes: number; note: string; createdAt: string }[]
	>();
	for (const l of timeLogRows) {
		const list = logsByTask.get(l.taskId) ?? [];
		list.push({
			user: l.userId ?? '',
			date: typeof l.loggedAt === 'string' ? l.loggedAt : String(l.loggedAt),
			minutes: l.minutes,
			note: l.note ?? '',
			createdAt: l.createdAt.toISOString()
		});
		logsByTask.set(l.taskId, list);
	}

	// Map of taskId → planned date string (or '' when in plan but undated).
	const planByTask = new Map<string, string>();
	if (opts?.plannerUserId && taskIds.length) {
		const planRows = await db
			.select({ taskId: taskPlanning.taskId, plannedFor: taskPlanning.plannedFor })
			.from(taskPlanning)
			.where(
				and(eq(taskPlanning.userId, opts.plannerUserId), inArray(taskPlanning.taskId, taskIds))
			);
		for (const p of planRows) {
			const d = p.plannedFor
				? typeof p.plannedFor === 'string'
					? p.plannedFor
					: String(p.plannedFor)
				: '';
			planByTask.set(p.taskId, d);
		}
	}

	// Resolve display info for any linked source tickets so the Inspector can
	// render a "Source ticket" chip. One small query keyed by the distinct set.
	const sourceTicketIds = [
		...new Set(taskRows.map((t) => t.sourceTicketId).filter((v): v is string => !!v))
	];
	const sourceTicketById = new Map<string, { id: string; displayId: string }>();
	if (sourceTicketIds.length) {
		const ticketRows = await db
			.select({
				id: ticket.id,
				number: ticket.number,
				key: organization.key
			})
			.from(ticket)
			.innerJoin(organization, eq(organization.id, ticket.orgId))
			.where(inArray(ticket.id, sourceTicketIds));
		for (const r of ticketRows) {
			sourceTicketById.set(r.id, {
				id: r.id,
				displayId: ticketDisplayId(r.key, r.number)
			});
		}
	}

	const displayById = new Map<string, string>();
	for (const t of taskRows) displayById.set(t.id, `${t.projectKey}-${t.number}`);

	return taskRows.map<Task>((t) => {
		const assigneeIds = assigneesByTask.get(t.id) ?? [];
		return {
			id: `${t.projectKey}-${t.number}`,
			uuid: t.id,
			title: t.title,
			status: t.status as Task['status'],
			priority: t.priority as Task['priority'],
			assignee: assigneeIds[0] ?? '',
			project: t.projectKey as Task['project'],
			labels: t.tags,
			due: fmtDate(t.dueDate) || null,
			updated: fmtDate(t.updatedAt) || t.updatedAt.toISOString().slice(0, 10),
			type: t.type as Task['type'],
			parent: t.parentId ? (displayById.get(t.parentId) ?? null) : null,
			startDate: fmtDate(t.startDate) || undefined,
			endDate: fmtDate(t.endDate) || undefined,
			estimate: t.estimateMinutes ?? undefined,
			assignees: assigneeIds.length ? assigneeIds : undefined,
			tags: t.tags,
			createdBy: t.createdBy ?? undefined,
			createdAt: fmtDate(t.createdAt),
			channel: t.channel,
			description: t.description ?? undefined,
			checklist: t.checklist ?? [],
			comments: commentsByTask.get(t.id) ?? [],
			files: attachmentsByTask.get(t.id) ?? [],
			timeLogs: logsByTask.get(t.id) ?? [],
			plannedFor: planByTask.has(t.id) ? planByTask.get(t.id) || null : null,
			inMyPlan: planByTask.has(t.id),
			sourceTicket: t.sourceTicketId ? (sourceTicketById.get(t.sourceTicketId) ?? null) : null
		};
	});
}

export const TASK_CHANNELS = ['web', 'mcp', 'api', 'import', 'template'] as const;
export type TaskChannel = (typeof TASK_CHANNELS)[number];

export type CreateTaskInput = {
	projectId: string;
	projectKey: string;
	title: string;
	description: string | null;
	status: string;
	priority: string;
	type: string;
	dueDate?: Date | null;
	estimateMinutes?: number | null;
	tags?: string[];
	/** Initial checklist items (e.g. carried over from a converted ticket). */
	checklist?: { id: string; text: string; done: boolean }[];
	assigneeIds?: string[];
	createdBy: string;
	/** When set, plan the task into this user's week. */
	plannedForUserId?: string;
	plannedFor?: string | null;
	/** Set when the task is spun up from a support ticket. */
	sourceTicketId?: string | null;
	/** Creating surface (default `web`). */
	channel?: TaskChannel;
};

/**
 * Single insert path for tasks: allocates the per-project number under row
 * lock, inserts the task + assignees (+ optional planning row), and logs the
 * `task.created` activity — all in one transaction. Shared by the /tasks create
 * action and the ticket → task conversion. Assignees are validated against the
 * user table; an empty/invalid set falls back to the creator.
 */
export async function createTask(
	input: CreateTaskInput
): Promise<{ id: string; number: number; displayId: string; assignedIds: string[] }> {
	const id = crypto.randomUUID();
	const requested = input.assigneeIds?.length ? input.assigneeIds : [input.createdBy];
	let number = 0;
	let displayId = '';
	let assignedIds: string[] = [];

	await db.transaction(async (tx) => {
		const [bumped] = await tx
			.update(project)
			.set({ nextTaskNumber: sql`${project.nextTaskNumber} + 1` })
			.where(eq(project.id, input.projectId))
			.returning({ next: project.nextTaskNumber });
		if (!bumped) throw new Error('Project not found');
		number = bumped.next - 1;

		await tx.insert(task).values({
			id,
			projectId: input.projectId,
			number,
			title: input.title,
			description: input.description,
			status: input.status,
			priority: input.priority,
			type: input.type,
			dueDate: input.dueDate ?? null,
			estimateMinutes: input.estimateMinutes ?? null,
			tags: input.tags ?? [],
			checklist: input.checklist ?? [],
			createdBy: input.createdBy,
			sourceTicketId: input.sourceTicketId ?? null,
			channel: input.channel ?? 'web'
		});

		// Tasks are internal work: only platform (internal-org) users may be
		// assigned. Filter out any external/portal users before persisting, then
		// fall back to the creator so a task always has at least one assignee.
		const validAssignees: string[] = [];
		const usersFound = await tx
			.selectDistinct({ id: user.id })
			.from(user)
			.innerJoin(organizationMember, eq(organizationMember.userId, user.id))
			.innerJoin(organization, eq(organization.id, organizationMember.orgId))
			.where(and(inArray(user.id, requested), eq(organization.isInternal, true)));
		for (const u of usersFound) validAssignees.push(u.id);
		if (validAssignees.length === 0) validAssignees.push(input.createdBy);

		await tx.insert(taskAssignee).values(validAssignees.map((userId) => ({ taskId: id, userId })));

		if (input.plannedForUserId && input.plannedFor) {
			await tx.insert(taskPlanning).values({
				taskId: id,
				userId: input.plannedForUserId,
				plannedFor: input.plannedFor
			});
		}

		displayId = `${input.projectKey}-${number}`;
		assignedIds = validAssignees;

		await logActivity(tx, {
			projectId: input.projectId,
			taskId: id,
			actorId: input.createdBy,
			type: 'task.created',
			meta: { taskRef: displayId, taskTitle: input.title }
		});
	});

	return { id, number, displayId, assignedIds };
}

export type BulkTaskInput = {
	title: string;
	description: string | null;
	status: string;
	priority: string;
	type: string;
	dueDate?: Date | null;
	estimateMinutes?: number | null;
	tags?: string[];
	checklist?: { id: string; text: string; done: boolean }[];
	assigneeIds?: string[];
	/** Plan the task into `plannedForUserId`'s week (YYYY-MM-DD). */
	plannedFor?: string | null;
};

/**
 * Bulk insert path for tasks (JSON import). Unlike calling `createTask` in a
 * loop, this allocates the whole block of per-project numbers with a single
 * `nextTaskNumber` bump, batch-inserts the rows, and resolves assignees with
 * one query — all inside one transaction, so a failure inserts nothing.
 * Assignee rules match `createTask`: internal-org users only, falling back to
 * the creator so every task has at least one assignee.
 */
export async function createTasks(input: {
	projectId: string;
	projectKey: string;
	createdBy: string;
	tasks: BulkTaskInput[];
	/** Owner of the planning rows written for tasks with `plannedFor` (defaults to `createdBy`). */
	plannedForUserId?: string;
	/** Creating surface for the whole batch (default `web`). */
	channel?: TaskChannel;
	/**
	 * Enlist in an outer transaction instead of opening one. Used when the
	 * project itself is created in the same transaction (template seeding), so
	 * a failure rolls back the project too.
	 */
	tx?: Tx;
}): Promise<{ id: string; number: number; displayId: string; assignedIds: string[] }[]> {
	if (input.tasks.length === 0) return [];

	// Every user id any task requests, plus the creator (the fallback assignee).
	const requestedIds = new Set<string>([input.createdBy]);
	for (const t of input.tasks) for (const a of t.assigneeIds ?? []) requestedIds.add(a);

	const results: { id: string; number: number; displayId: string; assignedIds: string[] }[] = [];

	const run = async (tx: Tx) => {
		const [bumped] = await tx
			.update(project)
			.set({ nextTaskNumber: sql`${project.nextTaskNumber} + ${input.tasks.length}` })
			.where(eq(project.id, input.projectId))
			.returning({ next: project.nextTaskNumber });
		if (!bumped) throw new Error('Project not found');
		const firstNumber = bumped.next - input.tasks.length;

		const internal = await tx
			.selectDistinct({ id: user.id })
			.from(user)
			.innerJoin(organizationMember, eq(organizationMember.userId, user.id))
			.innerJoin(organization, eq(organization.id, organizationMember.orgId))
			.where(and(inArray(user.id, [...requestedIds]), eq(organization.isInternal, true)));
		const internalIds = new Set(internal.map((u) => u.id));

		const rows = input.tasks.map((t, i) => ({
			id: crypto.randomUUID(),
			projectId: input.projectId,
			number: firstNumber + i,
			title: t.title,
			description: t.description,
			status: t.status,
			priority: t.priority,
			type: t.type,
			dueDate: t.dueDate ?? null,
			estimateMinutes: t.estimateMinutes ?? null,
			tags: t.tags ?? [],
			checklist: t.checklist ?? [],
			createdBy: input.createdBy,
			channel: input.channel ?? 'web'
		}));
		await tx.insert(task).values(rows);

		const assigneeRows: { taskId: string; userId: string }[] = [];
		for (let i = 0; i < rows.length; i++) {
			const valid = (input.tasks[i].assigneeIds ?? []).filter((id) => internalIds.has(id));
			const assignedIds = valid.length > 0 ? [...new Set(valid)] : [input.createdBy];
			for (const userId of assignedIds) assigneeRows.push({ taskId: rows[i].id, userId });
			results.push({
				id: rows[i].id,
				number: rows[i].number,
				displayId: `${input.projectKey}-${rows[i].number}`,
				assignedIds
			});
		}
		await tx.insert(taskAssignee).values(assigneeRows);

		const planningRows = rows.flatMap((r, i) => {
			const d = input.tasks[i].plannedFor;
			return d
				? [{ taskId: r.id, userId: input.plannedForUserId ?? input.createdBy, plannedFor: d }]
				: [];
		});
		if (planningRows.length > 0) await tx.insert(taskPlanning).values(planningRows);

		for (let i = 0; i < results.length; i++) {
			await logActivity(tx, {
				projectId: input.projectId,
				taskId: results[i].id,
				actorId: input.createdBy,
				type: 'task.created',
				meta: { taskRef: results[i].displayId, taskTitle: input.tasks[i].title }
			});
		}
	};
	if (input.tx) await run(input.tx);
	else await db.transaction(run);

	return results;
}

// ─── Resolvers ─────────────────────────────────────────────────────────────

/** Look up a project by its short key (trimmed, upper-cased). */
export async function resolveProjectByKey(
	key: string
): Promise<{ id: string; key: string; name: string; orgId: string | null } | null> {
	const k = key.trim().toUpperCase();
	if (!k) return null;
	const [row] = await db
		.select({ id: project.id, key: project.key, name: project.name, orgId: project.orgId })
		.from(project)
		.where(eq(project.key, k))
		.limit(1);
	return row ?? null;
}

export type ResolvedTask = {
	id: string;
	number: number;
	title: string;
	status: string;
	priority: string;
	type: string;
	projectId: string;
	projectKey: string;
	projectOrgId: string | null;
	createdBy: string | null;
	sourceTicketId: string | null;
};

/**
 * Resolve a display id (`<PROJECT_KEY>-<number>`, e.g. TRACK-42) to the task
 * row plus its project scope. Deleted tasks never resolve; null for malformed
 * input or no match. Shared by the web actions and the MCP tools.
 */
export async function resolveTaskByDisplayId(displayId: string): Promise<ResolvedTask | null> {
	const trimmed = displayId.trim();
	const dash = trimmed.lastIndexOf('-');
	if (dash <= 0) return null;
	const key = trimmed.slice(0, dash).toUpperCase();
	const number = Number(trimmed.slice(dash + 1));
	if (!Number.isInteger(number) || number <= 0) return null;

	const [row] = await db
		.select({
			id: task.id,
			number: task.number,
			title: task.title,
			status: task.status,
			priority: task.priority,
			type: task.type,
			projectId: project.id,
			projectKey: project.key,
			projectOrgId: project.orgId,
			createdBy: task.createdBy,
			sourceTicketId: task.sourceTicketId
		})
		.from(task)
		.innerJoin(project, eq(project.id, task.projectId))
		.where(and(eq(project.key, key), eq(task.number, number), isNull(task.deletedAt)))
		.limit(1);
	return row ?? null;
}

export type ChecklistItem = { id: string; text: string; done: boolean };

/**
 * Sanitize a client-posted checklist array (whole-array replace semantics):
 * cap at 100 items / 500 chars, drop empties, fill missing ids. Returns null
 * for a payload that isn't an array at all. Shared by the web `update` action,
 * PATCH /api/v1/tasks/[id] and the MCP tools.
 */
export function sanitizeTaskChecklist(raw: unknown): ChecklistItem[] | null {
	if (!Array.isArray(raw)) return null;
	return raw
		.slice(0, 100)
		.map((it) => ({
			id: typeof it?.id === 'string' && it.id ? it.id : crypto.randomUUID(),
			text: String(it?.text ?? '')
				.trim()
				.slice(0, 500),
			done: !!it?.done
		}))
		.filter((it) => it.text.length > 0);
}

// ─── Write paths with side effects ─────────────────────────────────────────
// The complete "edit / delete / log time / create" behaviour — validation,
// permission rules, persistence, ticket checklist mirroring, webhooks,
// notifications, activity and audit — shared by the /api/v1 handlers and the
// MCP tools. Failures throw SvelteKit `error(status, message)` so every caller
// answers identically.

export type WriteEffectOpts = {
	/** Request origin for absolute links in notifications/webhooks. */
	origin: string;
	/** Recorded in activity/audit meta so the trail says which surface wrote. */
	via: 'api.v1' | 'mcp';
};

function requireActor(locals: App.Locals): NonNullable<App.Locals['user']> {
	if (!locals.user) error(401, 'Not authenticated.');
	return locals.user;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

async function loadTaskTarget(taskId: string) {
	const [target] = await db
		.select({
			id: task.id,
			number: task.number,
			title: task.title,
			status: task.status,
			priority: task.priority,
			type: task.type,
			createdBy: task.createdBy,
			sourceTicketId: task.sourceTicketId,
			projectId: project.id,
			projectKey: project.key,
			projectOrgId: project.orgId
		})
		.from(task)
		.innerJoin(project, eq(project.id, task.projectId))
		.where(and(eq(task.id, taskId), isNull(task.deletedAt)))
		.limit(1);
	return target ?? null;
}

export type TaskUpdatePatch = {
	title?: string;
	description?: string | null;
	status?: string;
	priority?: string;
	type?: string;
	/** ISO date / datetime string, or null/'' to clear. */
	due?: string | null;
	/** Minutes; null clears. */
	estimate?: number | null;
	tags?: string[];
	/** Whole-array replace; sanitized via `sanitizeTaskChecklist`. */
	checklist?: unknown;
	assigneeIds?: string[];
	/** YYYY-MM-DD plans the task into the caller's week; null/'' removes it. */
	plannedFor?: string | null;
};

/**
 * Apply an edit to a task. Permission mirrors the web update action:
 * `project.tasks.edit.any`, or creator + `project.tasks.edit.own`. A
 * plannedFor-only call needs just read access (per-user planning row; 404 on
 * no access so uuids don't leak). Assignees are filtered to internal-org users.
 * Side effects: ticket checklist mirroring, `task.updated`/`task.unassigned`
 * webhooks, status + assignment notifications, activity, audit.
 * Extracted from PATCH /api/v1/tasks/[id]; `changed: false` = nothing to do.
 */
export async function applyTaskUpdate(
	locals: App.Locals,
	taskId: string,
	body: TaskUpdatePatch,
	opts: WriteEffectOpts
): Promise<{ changed: boolean }> {
	const me = requireActor(locals);
	const target = await loadTaskTarget(taskId);
	if (!target) error(404, m.tasks_err_task_not_found());

	const isCreator = target.createdBy === me.id;
	const allowed =
		(await can(locals, 'project.tasks.edit.any', { projectId: target.projectId })) ||
		(isCreator && (await can(locals, 'project.tasks.edit.own', { projectId: target.projectId })));

	const patch: Record<string, unknown> = {};
	if (body.status !== undefined) {
		if (!ALLOWED_TASK_STATUS.has(body.status)) {
			error(400, m.tasks_err_invalid_status({ value: String(body.status) }));
		}
		patch.status = body.status;
	}
	if (body.priority !== undefined) {
		if (!ALLOWED_TASK_PRIORITY.has(body.priority)) {
			error(400, m.tasks_err_invalid_priority({ value: String(body.priority) }));
		}
		patch.priority = body.priority;
	}
	if (body.type !== undefined) {
		if (!ALLOWED_TASK_TYPE.has(body.type)) {
			error(400, m.tasks_err_invalid_type({ type: String(body.type) }));
		}
		patch.type = body.type;
	}
	if (body.title !== undefined) {
		const v = String(body.title).trim();
		if (!v) error(400, m.tasks_err_title_empty());
		patch.title = v;
	}
	if (body.description !== undefined) {
		patch.description = String(body.description ?? '').trim() || null;
	}
	if (body.estimate !== undefined) {
		if (body.estimate === null) {
			patch.estimateMinutes = null;
		} else {
			if (typeof body.estimate !== 'number' || !Number.isFinite(body.estimate)) {
				error(400, 'estimate must be a number of minutes or null.');
			}
			patch.estimateMinutes = body.estimate > 0 ? Math.round(body.estimate) : null;
		}
	}
	// Tags: full array, normalized + deduped like the web action ([] clears).
	if (body.tags !== undefined) {
		if (!Array.isArray(body.tags) || body.tags.some((x) => typeof x !== 'string')) {
			error(400, 'tags must be a string array.');
		}
		patch.tags = [...new Set(body.tags.map((v) => normalizeTag(v)).filter(Boolean))];
	}
	if (body.due !== undefined) {
		if (body.due) {
			const d = new Date(body.due);
			if (Number.isNaN(d.getTime())) error(400, m.tasks_err_invalid_date());
			patch.dueDate = d;
		} else {
			patch.dueDate = null;
		}
	}
	// Checklist: full array, sanitized like the web action — {id,text,done},
	// empty text dropped, capped so a runaway payload can't bloat the row.
	if (body.checklist !== undefined) {
		const list = sanitizeTaskChecklist(body.checklist);
		if (!list) error(400, m.tasks_err_invalid_checklist());
		patch.checklist = list;
	}
	let assigneesUpdate: string[] | null = null;
	if (body.assigneeIds !== undefined) {
		if (!Array.isArray(body.assigneeIds) || body.assigneeIds.some((x) => typeof x !== 'string')) {
			error(400, 'assigneeIds must be a string array.');
		}
		assigneesUpdate = [...new Set(body.assigneeIds)];
	}
	// plannedFor plans the task into the caller's own week (a date string) or
	// removes it (null). Web planSet parity: per-user planning row, read access
	// is enough — it never touches the task row itself.
	let plannedUpdate: { date: string | null } | null = null;
	if (body.plannedFor !== undefined) {
		if (body.plannedFor === null || body.plannedFor === '') {
			plannedUpdate = { date: null };
		} else {
			if (typeof body.plannedFor !== 'string' || !DATE_ONLY.test(body.plannedFor)) {
				error(400, m.tasks_err_invalid_date());
			}
			plannedUpdate = { date: body.plannedFor };
		}
	}

	const hasEdits = Object.keys(patch).length > 0 || assigneesUpdate !== null;
	if (hasEdits && !allowed) error(403, m.tasks_err_cannot_edit());
	if (!hasEdits && plannedUpdate !== null) {
		// Planning-only calls need read access; answer 404 (not 403) so the
		// endpoint doesn't leak which task uuids exist — same as GET.
		if (!(await can(locals, 'project.tasks.read', { projectId: target.projectId }))) {
			error(404, m.tasks_err_task_not_found());
		}
	}

	if (!hasEdits && plannedUpdate === null) return { changed: false };

	if (plannedUpdate !== null) {
		if (plannedUpdate.date) {
			await db
				.insert(taskPlanning)
				.values({ taskId: target.id, userId: me.id, plannedFor: plannedUpdate.date })
				.onConflictDoUpdate({
					target: [taskPlanning.taskId, taskPlanning.userId],
					set: { plannedFor: plannedUpdate.date, updatedAt: new Date() }
				});
		} else {
			await db
				.delete(taskPlanning)
				.where(and(eq(taskPlanning.taskId, target.id), eq(taskPlanning.userId, me.id)));
		}
		if (!hasEdits) return { changed: true };
	}

	const priorAssigneeRows = await db
		.select({ userId: taskAssignee.userId })
		.from(taskAssignee)
		.where(eq(taskAssignee.taskId, target.id));
	const priorAssignees = new Set(priorAssigneeRows.map((r) => r.userId));

	const assigneeOut: { next: string[] | null } = { next: null };
	await db.transaction(async (tx) => {
		if (Object.keys(patch).length > 0) {
			await tx.update(task).set(patch).where(eq(task.id, target.id));
		}
		if (assigneesUpdate !== null) {
			await tx.delete(taskAssignee).where(eq(taskAssignee.taskId, target.id));
			if (assigneesUpdate.length > 0) {
				// Tasks are internal work: only platform (internal-org) users may be
				// assigned — mirror the web action's guard, never trust posted ids.
				const valid = await tx
					.selectDistinct({ id: userTable.id })
					.from(userTable)
					.innerJoin(organizationMember, eq(organizationMember.userId, userTable.id))
					.innerJoin(organization, eq(organization.id, organizationMember.orgId))
					.where(and(inArray(userTable.id, assigneesUpdate), eq(organization.isInternal, true)));
				if (valid.length > 0) {
					await tx
						.insert(taskAssignee)
						.values(valid.map((u) => ({ taskId: target.id, userId: u.id })));
				}
				assigneeOut.next = valid.map((u) => u.id);
			} else {
				assigneeOut.next = [];
			}
		}
	});

	// Mirror checklist completion back to the source ticket (items copied on
	// conversion share their id). Fire-and-forget — never undoes the save.
	if (target.sourceTicketId && Array.isArray(patch.checklist)) {
		void syncTicketChecklistFromTask(
			target.sourceTicketId,
			patch.checklist as { id: string; done: boolean }[]
		).catch((err) => console.error('ticket checklist sync failed', err));
	}

	const displayId = `${target.projectKey}-${target.number}`;
	const currentAssignees = assigneeOut.next ?? [...priorAssignees];
	const actor = { id: me.id, name: me.name };

	const taskCtx = {
		id: target.id,
		displayId,
		title: (patch.title as string | undefined) ?? target.title,
		orgId: target.projectOrgId,
		projectId: target.projectId,
		status: (patch.status as string | undefined) ?? target.status,
		priority: (patch.priority as string | undefined) ?? target.priority,
		type: (patch.type as string | undefined) ?? target.type
	};
	const statusChanged = patch.status !== undefined && patch.status !== target.status;
	{
		const before: Record<string, unknown> = {
			status: target.status,
			priority: target.priority,
			type: target.type,
			title: target.title
		};
		const changes: Record<string, { from: unknown; to: unknown }> = {};
		for (const key of Object.keys(patch)) {
			if (key === 'checklist') continue;
			const to = patch[key];
			const from = key in before ? before[key] : undefined;
			if (from !== undefined && from === to) continue;
			changes[key] = {
				from: from ?? null,
				to: to instanceof Date ? to.toISOString() : (to ?? null)
			};
		}
		const nextAssignees = assigneeOut.next;
		if (nextAssignees !== null) {
			const added = nextAssignees.filter((id) => !priorAssignees.has(id));
			const removed = [...priorAssignees].filter((id) => !nextAssignees.includes(id));
			if (added.length || removed.length) {
				changes.assigneeIds = { from: [...priorAssignees], to: nextAssignees };
			}
			if (removed.length) {
				emitWebhookEvent({
					type: 'task.unassigned',
					orgId: target.projectOrgId,
					projectId: target.projectId,
					actor,
					assigneeIds: removed,
					origin: opts.origin,
					data: {
						task: taskSnapshot({ ...taskCtx, assigneeIds: currentAssignees }, opts.origin),
						removedAssigneeIds: removed
					}
				});
			}
		}
		if (Object.keys(changes).length > 0) {
			emitWebhookEvent({
				type: 'task.updated',
				orgId: target.projectOrgId,
				projectId: target.projectId,
				actor,
				assigneeIds: currentAssignees,
				origin: opts.origin,
				data: {
					task: taskSnapshot({ ...taskCtx, assigneeIds: currentAssignees }, opts.origin),
					changes
				}
			});
		}
	}
	if (statusChanged) {
		void notifyTaskStatusChanged({
			task: taskCtx,
			creatorId: target.createdBy,
			assigneeIds: currentAssignees,
			newStatus: String(patch.status),
			previousStatus: target.status,
			actor,
			origin: opts.origin
		}).catch((err) => console.error('task status notify failed', err));
		logActivityFF({
			projectId: target.projectId,
			taskId: target.id,
			actorId: me.id,
			type: 'task.status',
			meta: {
				taskRef: displayId,
				taskTitle: target.title,
				from: target.status,
				to: patch.status
			}
		});
	}

	// Notify users newly added to the task (never the actor themselves).
	const newlyAssigned = (assigneeOut.next ?? []).filter(
		(id) => !priorAssignees.has(id) && id !== me.id
	);
	if (newlyAssigned.length) {
		void notifyTaskAssigned({
			task: taskCtx,
			assigneeIds: newlyAssigned,
			actor,
			origin: opts.origin
		}).catch((err) => console.error('task assigned notify failed', err));
	}

	void recordAudit({
		type: 'task.update',
		actorId: me.id,
		targetType: 'task',
		targetId: target.id,
		targetLabel: `${displayId} · ${target.title}`,
		orgId: target.projectOrgId,
		meta: {
			projectId: target.projectId,
			fields: [...Object.keys(patch), ...(assigneesUpdate !== null ? ['assignees'] : [])],
			via: opts.via
		}
	});

	return { changed: true };
}

/**
 * Soft-delete a task: `project.tasks.delete.any` only (non-readers get the same
 * 404 as unknown ids), deletedAt stamp, attachment cleanup (task-level +
 * per-comment), activity + audit entries. Extracted from DELETE /api/v1/tasks/[id].
 */
export async function deleteTaskFully(
	locals: App.Locals,
	taskId: string,
	opts: WriteEffectOpts
): Promise<void> {
	const me = requireActor(locals);
	const target = await loadTaskTarget(taskId);
	if (!target) error(404, m.tasks_err_task_not_found());
	if (!(await can(locals, 'project.tasks.read', { projectId: target.projectId }))) {
		error(404, m.tasks_err_task_not_found());
	}
	if (!(await can(locals, 'project.tasks.delete.any', { projectId: target.projectId }))) {
		error(403, m.tasks_err_cannot_edit());
	}

	const displayId = `${target.projectKey}-${target.number}`;
	await db.update(task).set({ deletedAt: new Date() }).where(eq(task.id, target.id));
	// The task's read paths are now closed, so its attachments are already
	// unreachable; remove their files (task-level + per-comment) to reclaim
	// disk — same cleanup as the web action.
	await deleteAttachmentsFor('task', target.id);
	const comments = await db
		.select({ id: message.id })
		.from(message)
		.innerJoin(thread, eq(thread.id, message.threadId))
		.where(and(eq(thread.subjectType, 'task'), eq(thread.subjectId, target.id)));
	for (const c of comments) await deleteAttachmentsFor('message', c.id);

	logActivityFF({
		projectId: target.projectId,
		taskId: target.id,
		actorId: me.id,
		type: 'task.deleted',
		meta: { taskRef: displayId, taskTitle: target.title }
	});
	void recordAudit({
		type: 'task.delete',
		actorId: me.id,
		targetType: 'task',
		targetId: target.id,
		targetLabel: `${displayId} · ${target.title}`,
		orgId: target.projectOrgId,
		meta: { projectId: target.projectId, via: opts.via }
	});
}

/**
 * Log time on a task: any user who can read the task may log; entry = whole
 * minutes (> 0) + calendar date (YYYY-MM-DD) + optional note. Bumps the task's
 * updatedAt, writes the `time.logged` activity and the `task.time_logged`
 * webhook. Extracted from POST /api/v1/tasks/[id]/time.
 */
export async function logTaskTime(
	locals: App.Locals,
	taskId: string,
	entry: { minutes: number; date: string; note?: string | null },
	opts: WriteEffectOpts
): Promise<{ id: string }> {
	const me = requireActor(locals);
	const total = Math.round(Number(entry.minutes ?? 0));
	if (!Number.isFinite(total) || total <= 0) error(400, m.tasks_err_time_positive());
	const date = String(entry.date ?? '').trim();
	if (!DATE_ONLY.test(date)) error(400, m.tasks_err_invalid_date());

	const target = await loadTaskTarget(taskId);
	if (!target) error(404, m.tasks_err_task_not_found());
	// Unknown ids and no-access both answer 404 (same as the detail GET).
	if (!(await can(locals, 'project.tasks.read', { projectId: target.projectId }))) {
		error(404, m.tasks_err_task_not_found());
	}

	const note = String(entry.note ?? '').trim() || null;
	const id = crypto.randomUUID();
	await db.insert(taskTimeLog).values({
		id,
		taskId: target.id,
		userId: me.id,
		minutes: total,
		note,
		loggedAt: date
	});
	await db.update(task).set({ updatedAt: new Date() }).where(eq(task.id, target.id));

	const displayId = `${target.projectKey}-${target.number}`;
	logActivityFF({
		projectId: target.projectId,
		taskId: target.id,
		actorId: me.id,
		type: 'time.logged',
		meta: { taskRef: displayId, taskTitle: target.title, minutes: total, note, loggedAt: date }
	});

	emitWebhookEvent({
		type: 'task.time_logged',
		orgId: target.projectOrgId,
		projectId: target.projectId,
		actor: { id: me.id, name: me.name },
		assigneeIds: [me.id],
		origin: opts.origin,
		data: {
			task: taskSnapshot({ ...target, displayId }, opts.origin),
			timeLog: { minutes: total, note, loggedAt: date, userId: me.id }
		}
	});
	return { id };
}

export type CreateTaskWithEffectsInput = {
	/** Target project — either its uuid or its key (key is resolved first). */
	projectId?: string;
	projectKey?: string;
	title: string;
	description?: string | null;
	status?: string;
	priority?: string;
	type?: string;
	/** ISO date / datetime string (`dueDate` is the already-parsed alternative). */
	due?: string | null;
	dueDate?: Date | string | null;
	estimateMinutes?: number | null;
	tags?: string[];
	assigneeIds?: string[];
	/** Sanitized via `sanitizeTaskChecklist`. */
	checklist?: unknown;
	/** YYYY-MM-DD: plan the new task into the creator's week. */
	plannedFor?: string | null;
	/** Ignored — the creator is always `locals.user`. Accepted for call-site symmetry. */
	createdBy?: string;
};

/**
 * Create a task the way POST /api/v1/tasks does: validation, the
 * `project.tasks.create` gate, `createTask`, then the create-time side effects
 * (`task.created` webhook, assignment notifications, audit) — minus file
 * handling: the caller attaches afterwards.
 *
 * Activity: `createTask` already logs one `task.created` inside its transaction;
 * the v1 handler logs a SECOND one carrying `via` (so the feed shows the
 * surface). That double entry is the existing v1 behaviour and is kept
 * verbatim here — change both places together if it is ever consolidated.
 */
export async function createTaskWithEffects(
	locals: App.Locals,
	input: CreateTaskWithEffectsInput,
	opts: WriteEffectOpts
): Promise<{ id: string; number: number; displayId: string; assignedIds: string[] }> {
	const me = requireActor(locals);
	const title = input.title?.trim();
	if (!title) error(400, m.tasks_err_title_empty());

	const status = input.status ?? 'todo';
	const priority = input.priority ?? 'none';
	const type = input.type ?? 'task';
	if (!ALLOWED_TASK_STATUS.has(status)) {
		error(400, m.tasks_err_invalid_status({ value: String(status) }));
	}
	if (!ALLOWED_TASK_PRIORITY.has(priority)) {
		error(400, m.tasks_err_invalid_priority({ value: String(priority) }));
	}
	if (!ALLOWED_TASK_TYPE.has(type)) {
		error(400, m.tasks_err_invalid_type({ type: String(type) }));
	}
	let dueDate: Date | null = null;
	const dueRaw = input.due ?? input.dueDate ?? null;
	if (dueRaw) {
		dueDate = dueRaw instanceof Date ? dueRaw : new Date(dueRaw);
		if (Number.isNaN(dueDate.getTime())) error(400, m.tasks_err_invalid_date());
	}
	const estimate =
		typeof input.estimateMinutes === 'number' &&
		Number.isFinite(input.estimateMinutes) &&
		input.estimateMinutes > 0
			? Math.round(input.estimateMinutes)
			: null;
	const tags = Array.isArray(input.tags)
		? [...new Set(input.tags.map((v) => normalizeTag(String(v))).filter(Boolean))]
		: [];
	const assigneeIds = Array.isArray(input.assigneeIds)
		? input.assigneeIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
		: [];
	const plannedFor = input.plannedFor?.trim() || null;
	if (plannedFor && !DATE_ONLY.test(plannedFor)) error(400, m.tasks_err_invalid_planned_date());
	const checklist = input.checklist === undefined ? null : sanitizeTaskChecklist(input.checklist);
	if (input.checklist !== undefined && !checklist) error(400, m.tasks_err_invalid_checklist());

	let proj: { id: string; key: string; orgId: string | null } | null = null;
	if (input.projectKey) {
		proj = await resolveProjectByKey(input.projectKey);
	} else if (input.projectId) {
		const [row] = await db
			.select({ id: project.id, key: project.key, orgId: project.orgId })
			.from(project)
			.where(eq(project.id, input.projectId))
			.limit(1);
		proj = row ?? null;
	} else {
		error(400, 'projectKey is required.');
	}
	if (!proj) error(404, m.tasks_err_task_not_found());
	if (!(await can(locals, 'project.tasks.create', { projectId: proj.id }))) {
		error(403, 'You do not have permission to perform this action.');
	}

	const description = input.description?.trim() || null;
	const created = await createTask({
		projectId: proj.id,
		projectKey: proj.key,
		title,
		description,
		status,
		priority,
		type,
		dueDate,
		estimateMinutes: estimate,
		tags,
		checklist: checklist ?? undefined,
		assigneeIds,
		createdBy: me.id,
		plannedForUserId: me.id,
		plannedFor,
		channel: opts.via === 'mcp' ? 'mcp' : 'api'
	});
	logActivityFF({
		projectId: proj.id,
		taskId: created.id,
		actorId: me.id,
		type: 'task.created',
		meta: { taskRef: created.displayId, taskTitle: title, via: opts.via }
	});
	const createdCtx = {
		id: created.id,
		displayId: created.displayId,
		title,
		orgId: proj.orgId,
		projectId: proj.id,
		status,
		priority,
		type
	};
	emitWebhookEvent({
		type: 'task.created',
		orgId: proj.orgId,
		projectId: proj.id,
		actor: { id: me.id, name: me.name },
		assigneeIds: created.assignedIds,
		origin: opts.origin,
		data: {
			task: taskSnapshot({ ...createdCtx, assigneeIds: created.assignedIds, dueDate }, opts.origin),
			description,
			attachments: []
		}
	});
	// Same contract as the web create action: notify assigned users (notify()
	// drops the actor, so plain self-assignment stays silent).
	void notifyTaskAssigned({
		task: createdCtx,
		assigneeIds: created.assignedIds,
		actor: { id: me.id, name: me.name },
		origin: opts.origin
	}).catch((err) => console.error('task create notify failed', err));
	// The web create action audits; the v1 handler does not. Audit here so the
	// MCP surface leaves a trail (harmless superset for v1 callers).
	void recordAudit({
		type: 'task.create',
		actorId: me.id,
		targetType: 'task',
		targetId: created.id,
		targetLabel: `${created.displayId} · ${title}`,
		orgId: proj.orgId,
		meta: { projectId: proj.id, taskRef: created.displayId, via: opts.via }
	});
	return created;
}
