// Task detail + edits. `id` is the task UUID.
//   GET   — full task view model + display directory + canEdit; editors also
//           get the assignee picker candidates (internal users only).
//   PATCH { status?, priority?, type?, title?, description?, due?, estimate?,
//           tags?, checklist?, assigneeIds?, dependsOnIds?, plannedFor? } —
//   dependsOnIds is the full prerequisite set (same-project task uuids; a
//   blocked task stays editable, the app only warns). Permission mirrors
//   the web update action: project.tasks.edit.any, or creator + edit.own.
//   plannedFor plans the task into the *caller's* week (web planSet parity)
//   and only needs read access, like the web action.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { task } from '$lib/server/db/app.schema';
import { can } from '$lib/server/permissions';
import { applyTaskUpdate, deleteTaskFully, loadTasks } from '$lib/server/tasks';
import { loadAssignableUsers, loadTicketDisplayUsers } from '$lib/server/tickets';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const user = requireUser(locals);
	const [row] = await db
		.select({ id: task.id, projectId: task.projectId, createdBy: task.createdBy })
		.from(task)
		.where(and(eq(task.id, params.id), isNull(task.deletedAt)))
		.limit(1);
	if (!row) apiError(404, m.tasks_err_task_not_found());
	// Unknown ids and no-access both answer 404 so the endpoint doesn't leak
	// which task uuids exist.
	if (!(await can(locals, 'project.tasks.read', { projectId: row.projectId }))) {
		apiError(404, m.tasks_err_task_not_found());
	}

	// plannerUserId populates plannedFor/inMyPlan for the caller's own week —
	// without it the detail payload nulls out what the list already delivered.
	const tasks = await loadTasks({ projectId: row.projectId, plannerUserId: user.id });
	const detail = tasks.find((t) => t.uuid === params.id);
	if (!detail) apiError(404, m.tasks_err_task_not_found());

	// Same grant as PATCH below so the app only offers edit controls when the
	// change would actually be accepted.
	const isCreator = row.createdBy === user.id;
	const canEdit =
		(await can(locals, 'project.tasks.edit.any', { projectId: row.projectId })) ||
		(isCreator && (await can(locals, 'project.tasks.edit.own', { projectId: row.projectId })));
	const canComment = await can(locals, 'project.tasks.comment', { projectId: row.projectId });

	// Display directory (name + color only, emails stripped) — same contract
	// as the ticket detail's `authors` map.
	const users = await loadTicketDisplayUsers([
		row.createdBy,
		...(detail.assignees ?? []),
		...(detail.comments ?? []).map((c) => c.user),
		...(detail.timeLogs ?? []).map((l) => l.user)
	]);
	const authors = Object.fromEntries(users.map((u) => [u.id, { name: u.name, color: u.color }]));

	// Task assignees are internal platform users — loadAssignableUsers with no
	// extra orgs returns exactly the internal-org members.
	const assignableUsers = canEdit
		? (await loadAssignableUsers([])).map((u) => ({ id: u.id, name: u.name, color: u.color }))
		: [];

	// Task-level attachments, surfaced top-level so the app doesn't have to dig
	// them out of the task view model (loadTasks already batch-loads them; the
	// per-comment ones ride along as `comments[].files`).
	return json({
		task: detail,
		attachments: detail.files ?? [],
		authors,
		assignableUsers,
		canEdit,
		canComment
	});
};

// Soft delete, mirroring the web `delete` action: project.tasks.delete.any
// only, deletedAt stamp, attachment cleanup, activity + audit entries — all
// inside deleteTaskFully (shared with MCP).
export const DELETE: RequestHandler = async ({ locals, params, url }) => {
	requireUser(locals);
	await deleteTaskFully(locals, params.id, { origin: url.origin, via: 'api.v1' });
	return json({ ok: true });
};

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	requireUser(locals);
	const body = await readJson<{
		status?: string;
		priority?: string;
		type?: string;
		title?: string;
		description?: string | null;
		due?: string | null;
		estimate?: number | null;
		tags?: string[];
		checklist?: { id?: string; text?: string; done?: boolean }[];
		assigneeIds?: string[];
		dependsOnIds?: string[];
		plannedFor?: string | null;
	}>(request);
	// Validation, permission rules, persistence and every side effect live in
	// applyTaskUpdate (shared with MCP); it throws the same kit errors.
	const result = await applyTaskUpdate(locals, params.id, body, {
		origin: url.origin,
		via: 'api.v1'
	});
	if (!result.changed) return json({ ok: true, unchanged: true });
	return json({ ok: true });
};
