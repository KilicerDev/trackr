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
	organization
} from './db/app.schema';
import { user } from './db/auth.schema';
import { logActivity } from './activity';
import { ticketDisplayId } from './tickets';
import type { Task } from '$lib/types';
import { listAttachmentsForMany } from './attachments';

function fmtDate(d: Date | null): string {
	if (!d) return '';
	return d.toISOString().slice(0, 10);
}

/**
 * Load tasks shaped to match the legacy `Task` interface so existing
 * components (ListView, BoardView, Inspector) consume them unchanged.
 * Optionally filtered by project id.
 */
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
				slug: organization.slug,
				isInternal: organization.isInternal
			})
			.from(ticket)
			.innerJoin(organization, eq(organization.id, ticket.orgId))
			.where(inArray(ticket.id, sourceTicketIds));
		for (const r of ticketRows) {
			sourceTicketById.set(r.id, {
				id: r.id,
				displayId: ticketDisplayId(r.slug, r.isInternal, r.number)
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
			sourceTicketId: input.sourceTicketId ?? null
		});

		const validAssignees: string[] = [];
		const usersFound = await tx
			.select({ id: user.id })
			.from(user)
			.where(inArray(user.id, requested));
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
