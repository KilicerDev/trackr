// Read side of the project activity feed: loads activity rows for a project,
// joins the actor's display fields, and shapes them for the history sidebar.
// Newest-first with a simple limit/offset for "load more".

import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { projectActivity, type ProjectActivityType } from './db/app.schema';
import { user } from './db/auth.schema';

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

export async function loadProjectActivity(
	projectId: string,
	opts: { limit?: number; offset?: number; taskId?: string | null } = {}
): Promise<ActivityItem[]> {
	const limit = Math.min(opts.limit ?? 50, 200);
	const offset = opts.offset ?? 0;

	const conditions = [eq(projectActivity.projectId, projectId)];
	// `taskId: null` filters to project-level activity only; an id filters to a
	// single task; omitted returns the whole project feed.
	if (opts.taskId === null) conditions.push(isNull(projectActivity.taskId));
	else if (opts.taskId) conditions.push(eq(projectActivity.taskId, opts.taskId));

	const rows = await db
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
		.where(and(...conditions))
		.orderBy(desc(projectActivity.createdAt))
		.limit(limit)
		.offset(offset);

	return rows.map((r) => ({
		id: r.id,
		type: r.type,
		taskId: r.taskId,
		body: r.body,
		meta: r.meta,
		createdAt: r.createdAt.toISOString(),
		actor:
			r.actorId && r.actorName
				? {
						id: r.actorId,
						name: r.actorName,
						initials: initials(r.actorName),
						color: userColor(r.actorId)
					}
				: null
	}));
}
