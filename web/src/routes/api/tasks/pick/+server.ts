// Lean task picker for the dependency popover: tasks of one project by ref
// number or title. `project` is the project key; `q` filters (title ILIKE, or
// the number when the query looks like a ref such as "12" / "WEB-12"). Read
// gated like every task read (404 on miss so keys don't leak). Deleted tasks
// are excluded; archived ones stay (they can still be prerequisites). Open
// tasks come first, done ones last — the list should lead with what can
// still block.
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { task } from '$lib/server/db/app.schema';
import { can } from '$lib/server/permissions';
import { resolveProjectByKey } from '$lib/server/tasks';
import type { TaskLink } from '$lib/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Not authenticated.');
	const key = (url.searchParams.get('project') ?? '').trim().toUpperCase();
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	if (!key) error(400, 'project is required.');

	const proj = await resolveProjectByKey(key);
	if (!proj || !(await can(locals, 'project.tasks.read', { projectId: proj.id }))) {
		error(404, 'Project not found.');
	}

	const conditions = [eq(task.projectId, proj.id), isNull(task.deletedAt)];
	if (q) {
		const escaped = q.replace(/[\\%_]/g, '\\$&');
		const byTitle = ilike(task.title, `%${escaped}%`);
		// "12", "WEB-12" or "WEB-1" → tasks whose number starts with those digits.
		const digits = q.replace(/^[A-Za-z]+-?/, '');
		const byNumber = /^\d+$/.test(digits)
			? sql`${task.number}::text like ${digits + '%'}`
			: undefined;
		conditions.push(byNumber ? (or(byTitle, byNumber) ?? byTitle) : byTitle);
	}

	const rows = await db
		.select({ id: task.id, number: task.number, title: task.title, status: task.status })
		.from(task)
		.where(and(...conditions))
		.orderBy(sql`case when ${task.status} = 'done' then 1 else 0 end`, desc(task.createdAt))
		.limit(50);

	const tasks: TaskLink[] = rows.map((r) => ({
		uuid: r.id,
		id: `${proj.key}-${r.number}`,
		title: r.title,
		status: r.status as TaskLink['status']
	}));
	return json({ tasks });
};
