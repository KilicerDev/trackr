// Read side of the project activity feed: loads activity rows for a project,
// joins the actor's display fields, and shapes them for the history sidebar.
// Newest-first with a simple limit/offset for "load more".

import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { message, projectActivity, task, thread, type ProjectActivityType } from '../db/app.schema';
import { user } from '../db/auth.schema';

export type ActivityActor = {
	id: string;
	name: string;
	initials: string;
	color: string;
} | null;

export type ActivityItem = {
	id: string;
	type: ProjectActivityType;
	taskId: string | null;
	body: string | null;
	meta: Record<string, unknown> | null;
	createdAt: string;
	actor: ActivityActor;
};

function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase();
}

function userColor(id: string): string {
	let h = 0;
	for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return `hsl(${h % 360} 55% 60%)`;
}

function shapeActor(actorId: string | null, actorName: string | null): ActivityActor {
	return actorId && actorName
		? { id: actorId, name: actorName, initials: initials(actorName), color: userColor(actorId) }
		: null;
}

export async function loadProjectActivity(
	projectId: string,
	opts: { limit?: number; offset?: number; taskId?: string | null } = {}
): Promise<ActivityItem[]> {
	const limit = Math.min(opts.limit ?? 50, 200);
	const offset = opts.offset ?? 0;
	// Task comments now live in `message`; events + project-level comments stay in
	// `project_activity`. Merge both sources. To page correctly across two ordered
	// streams, fetch the top (offset+limit) from each, merge, then window.
	const take = offset + limit;

	// Events + project-level comments.
	const paConditions = [eq(projectActivity.projectId, projectId)];
	// `taskId: null` → project-level only; an id → a single task; omitted → all.
	if (opts.taskId === null) paConditions.push(isNull(projectActivity.taskId));
	else if (opts.taskId) paConditions.push(eq(projectActivity.taskId, opts.taskId));

	const paRows = await db
		.select({
			id: projectActivity.id,
			type: projectActivity.type,
			taskId: projectActivity.taskId,
			body: projectActivity.body,
			meta: projectActivity.meta,
			createdAt: projectActivity.createdAt,
			actorId: projectActivity.actorId,
			actorName: user.name
		})
		.from(projectActivity)
		.leftJoin(user, eq(user.id, projectActivity.actorId))
		.where(and(...paConditions))
		.orderBy(desc(projectActivity.createdAt))
		.limit(take);

	// Task comments (message rows in this project's task threads). Project-level
	// views (`taskId === null`) have no task comments.
	const msgConditions = [
		eq(task.projectId, projectId),
		eq(thread.subjectType, 'task'),
		isNull(message.deletedAt)
	];
	if (opts.taskId) msgConditions.push(eq(thread.subjectId, opts.taskId));
	const msgRows =
		opts.taskId === null
			? []
			: await db
					.select({
						id: message.id,
						taskId: thread.subjectId,
						body: message.body,
						createdAt: message.createdAt,
						actorId: message.authorId,
						actorName: user.name
					})
					.from(message)
					.innerJoin(thread, eq(thread.id, message.threadId))
					.innerJoin(task, eq(task.id, thread.subjectId))
					.leftJoin(user, eq(user.id, message.authorId))
					.where(and(...msgConditions))
					.orderBy(desc(message.createdAt))
					.limit(take);

	const items: ActivityItem[] = [
		...paRows.map((r) => ({
			id: r.id,
			type: r.type,
			taskId: r.taskId,
			body: r.body,
			meta: r.meta,
			createdAt: r.createdAt.toISOString(),
			actor: shapeActor(r.actorId, r.actorName)
		})),
		...msgRows.map((r) => ({
			id: r.id,
			type: 'comment' as ProjectActivityType,
			taskId: r.taskId,
			body: r.body,
			meta: null,
			createdAt: r.createdAt.toISOString(),
			actor: shapeActor(r.actorId, r.actorName)
		}))
	];
	// ISO strings sort lexicographically; newest first.
	items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
	return items.slice(offset, offset + limit);
}
