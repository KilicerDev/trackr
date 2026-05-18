import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from './db';
import {
	project,
	task,
	taskAssignee,
	taskComment,
	taskPlanning,
	taskTimeLog
} from './db/app.schema';
import type { Task } from '$lib/types';

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
		conditions.push(isNull(project.archivedAt));
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
			createdBy: task.createdBy,
			createdAt: task.createdAt,
			updatedAt: task.updatedAt,
			projectKey: project.key
		})
		.from(task)
		.innerJoin(project, eq(project.id, task.projectId))
		.where(and(...conditions));

	const taskRows = await baseQuery.orderBy(desc(task.updatedAt));
	const taskIds = taskRows.map((t) => t.id);

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

	const commentRows = taskIds.length
		? await db
				.select({
					taskId: taskComment.taskId,
					authorId: taskComment.authorId,
					body: taskComment.body,
					createdAt: taskComment.createdAt
				})
				.from(taskComment)
				.where(inArray(taskComment.taskId, taskIds))
		: [];
	const commentsByTask = new Map<
		string,
		{ user: string; date: string; text: string; createdAt: string }[]
	>();
	for (const c of commentRows) {
		const list = commentsByTask.get(c.taskId) ?? [];
		const iso = c.createdAt.toISOString();
		list.push({
			user: c.authorId ?? '',
			date: iso.slice(0, 10),
			text: c.body,
			createdAt: iso
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
				and(
					eq(taskPlanning.userId, opts.plannerUserId),
					inArray(taskPlanning.taskId, taskIds)
				)
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

	const displayById = new Map<string, string>();
	for (const t of taskRows) displayById.set(t.id, `${t.projectKey}-${t.number}`);

	return taskRows.map<Task>((t) => {
		const assigneeIds = assigneesByTask.get(t.id) ?? [];
		return {
			id: `${t.projectKey}-${t.number}`,
			title: t.title,
			status: t.status as Task['status'],
			priority: t.priority as Task['priority'],
			assignee: assigneeIds[0] ?? '',
			project: t.projectKey as Task['project'],
			labels: t.tags,
			due: fmtDate(t.dueDate) || null,
			updated: fmtDate(t.updatedAt) || t.updatedAt.toISOString().slice(0, 10),
			type: t.type as Task['type'],
			parent: t.parentId ? displayById.get(t.parentId) ?? null : null,
			startDate: fmtDate(t.startDate) || undefined,
			endDate: fmtDate(t.endDate) || undefined,
			estimate: t.estimateMinutes ?? undefined,
			assignees: assigneeIds.length ? assigneeIds : undefined,
			tags: t.tags,
			createdBy: t.createdBy ?? undefined,
			createdAt: fmtDate(t.createdAt),
			description: t.description ?? undefined,
			comments: commentsByTask.get(t.id) ?? [],
			timeLogs: logsByTask.get(t.id) ?? [],
			plannedFor: planByTask.has(t.id) ? planByTask.get(t.id) || null : null,
			inMyPlan: planByTask.has(t.id)
		};
	});
}
