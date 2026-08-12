// Tasks for the app — the reactive slice only: see my tasks, tick them off
// (via PATCH on [id]), quick-add with a single field. Structuring work
// (boards, planning, bulk edits) stays on the desktop.
//   GET  ?scope=mine|all — `mine` (default) = tasks I'm assigned to or created.
//   POST { title, projectKey, description? } — quick-create with defaults.
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { project } from '$lib/server/db/app.schema';
import { accessibleProjectIds, assertCan } from '$lib/server/permissions';
import { createTask, loadTasks } from '$lib/server/tasks';
import { logActivityFF } from '$lib/server/activity';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireUser(locals);
	const scope = url.searchParams.get('scope') ?? 'mine';

	const access = accessibleProjectIds(locals);
	const tasks = await loadTasks(access.all ? {} : { projectIds: [...access.ids] });
	const mine =
		scope === 'mine'
			? tasks.filter(
					(t) => (t.assignees ?? []).includes(user.id) || t.createdBy === user.id
				)
			: tasks;
	return json({ tasks: mine });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = await readJson<{ title?: string; projectKey?: string; description?: string }>(
		request
	);
	const title = body.title?.trim();
	const projectKey = body.projectKey?.trim().toUpperCase();
	if (!title) apiError(400, m.tasks_err_title_empty());
	if (!projectKey) apiError(400, 'projectKey is required.');

	const [proj] = await db
		.select({ id: project.id, key: project.key, orgId: project.orgId })
		.from(project)
		.where(eq(project.key, projectKey))
		.limit(1);
	if (!proj) apiError(404, m.tasks_err_task_not_found());
	await assertCan(locals, 'project.tasks.create', { projectId: proj.id });

	const created = await createTask({
		projectId: proj.id,
		projectKey: proj.key,
		title,
		description: body.description?.trim() || null,
		status: 'todo',
		priority: 'none',
		type: 'task',
		createdBy: user.id
	});
	logActivityFF({
		projectId: proj.id,
		taskId: created.id,
		actorId: user.id,
		type: 'task.created',
		meta: { taskRef: created.displayId, taskTitle: title, via: 'api.v1' }
	});
	return json({ id: created.id, displayId: created.displayId }, { status: 201 });
};
