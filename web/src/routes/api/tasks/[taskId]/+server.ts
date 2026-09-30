// One task with everything the inspector shows, fetched when a task is
// opened from a list that only carries summaries. `taskId` is a display id
// (WEB-12) or the task uuid. Read gated like every task read; unknown ids
// and no-access both answer 404 so neither keys nor uuids leak. Archived
// tasks resolve (deep links and dependency chips can point at them).
import { error, json } from '@sveltejs/kit';
import { can } from '$lib/server/permissions';
import { loadTaskDetail, resolveTaskRef } from '$lib/server/tasks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Not authenticated.');
	const ref = await resolveTaskRef(params.taskId);
	if (!ref || !(await can(locals, 'project.tasks.read', { projectId: ref.projectId }))) {
		error(404, 'Task not found.');
	}
	const task = await loadTaskDetail(ref.id, { plannerUserId: locals.user.id });
	if (!task) error(404, 'Task not found.');
	return json({ task });
};
