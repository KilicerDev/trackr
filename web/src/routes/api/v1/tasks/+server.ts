// Tasks for the app — the reactive slice only: see my tasks, tick them off
// (via PATCH on [id]), quick-add with a single field. Structuring work
// (boards, bulk edits) stays on the desktop.
//   GET  ?scope=mine|all — `mine` (default) = tasks I'm assigned to or created.
//   POST { title, projectKey, description?, status?, priority?, type?, due?,
//          estimate?, tags?, assigneeIds?, plannedFor? } — full create, same
//          field semantics as the web create action. Send multipart/form-data
//          with the object in a `payload` field plus `attachments` file parts
//          to attach files on create (listed in the `task.created` webhook).
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { project } from '$lib/server/db/app.schema';
import { accessibleProjectIds, assertCan } from '$lib/server/permissions';
import {
	ALLOWED_TASK_PRIORITY,
	ALLOWED_TASK_STATUS,
	ALLOWED_TASK_TYPE,
	createTask,
	loadTasks
} from '$lib/server/tasks';
import { loadTicketDisplayUsers } from '$lib/server/tickets';
import { notifyTaskAssigned } from '$lib/server/notify/events/task';
import { logActivityFF } from '$lib/server/activity';
import { attachmentSnapshots, emitWebhookEvent, taskSnapshot } from '$lib/server/webhooks';
import { attachFormFiles } from '$lib/server/attachments';
import { normalizeTag } from '$lib/utils/label-meta';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readBody, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireUser(locals);
	const scope = url.searchParams.get('scope') ?? 'mine';

	const access = accessibleProjectIds(locals);
	// plannerUserId populates plannedFor/inMyPlan for the caller's own week —
	// without it the app's Plan tab has nothing to render.
	const tasks = await loadTasks(
		access.all
			? { plannerUserId: user.id }
			: { projectIds: [...access.ids], plannerUserId: user.id }
	);
	const mine =
		scope === 'mine'
			? tasks.filter((t) => (t.assignees ?? []).includes(user.id) || t.createdBy === user.id)
			: tasks;
	// Display directory for assignee names (name + color only) so the app can
	// render/filter by assignee without a users endpoint.
	const displayUsers = await loadTicketDisplayUsers(mine.flatMap((t) => t.assignees ?? []));
	const users = Object.fromEntries(
		displayUsers.map((u) => [u.id, { name: u.name, color: u.color }])
	);
	return json({ tasks: mine, users });
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
	const user = requireUser(locals);
	const { body, files } = await readBody<{
		title?: string;
		projectKey?: string;
		description?: string;
		status?: string;
		priority?: string;
		type?: string;
		due?: string | null;
		estimate?: number | null;
		tags?: string[];
		assigneeIds?: string[];
		plannedFor?: string | null;
	}>(request);
	const title = body.title?.trim();
	const projectKey = body.projectKey?.trim().toUpperCase();
	if (!title) apiError(400, m.tasks_err_title_empty());
	if (!projectKey) apiError(400, 'projectKey is required.');

	const status = body.status ?? 'todo';
	const priority = body.priority ?? 'none';
	const type = body.type ?? 'task';
	if (!ALLOWED_TASK_STATUS.has(status)) {
		apiError(400, m.tasks_err_invalid_status({ value: String(status) }));
	}
	if (!ALLOWED_TASK_PRIORITY.has(priority)) {
		apiError(400, m.tasks_err_invalid_priority({ value: String(priority) }));
	}
	if (!ALLOWED_TASK_TYPE.has(type)) {
		apiError(400, m.tasks_err_invalid_type({ type: String(type) }));
	}
	let dueDate: Date | null = null;
	if (body.due) {
		dueDate = new Date(body.due);
		if (Number.isNaN(dueDate.getTime())) apiError(400, m.tasks_err_invalid_date());
	}
	const estimate =
		typeof body.estimate === 'number' && Number.isFinite(body.estimate) && body.estimate > 0
			? Math.round(body.estimate)
			: null;
	const tags = Array.isArray(body.tags)
		? [...new Set(body.tags.map((v) => normalizeTag(String(v))).filter(Boolean))]
		: [];
	const assigneeIds = Array.isArray(body.assigneeIds)
		? body.assigneeIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
		: [];
	const plannedFor = body.plannedFor?.trim() || null;
	if (plannedFor && !/^\d{4}-\d{2}-\d{2}$/.test(plannedFor)) {
		apiError(400, m.tasks_err_invalid_planned_date());
	}

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
		status,
		priority,
		type,
		dueDate,
		estimateMinutes: estimate,
		tags,
		assigneeIds,
		createdBy: user.id,
		plannedForUserId: user.id,
		plannedFor
	});
	logActivityFF({
		projectId: proj.id,
		taskId: created.id,
		actorId: user.id,
		type: 'task.created',
		meta: { taskRef: created.displayId, taskTitle: title, via: 'api.v1' }
	});
	// Files first (best-effort, the task already exists), so the webhook
	// below can list them.
	const { attachments } = await attachFormFiles({
		files,
		entityType: 'task',
		entityId: created.id,
		orgId: null,
		projectId: proj.id,
		uploadedBy: user.id
	});
	// Same contract as the web create action: notify assigned users (notify()
	// drops the actor, so plain self-assignment stays silent).
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
		actor: { id: user.id, name: user.name },
		assigneeIds: created.assignedIds,
		origin: url.origin,
		data: {
			task: taskSnapshot({ ...createdCtx, assigneeIds: created.assignedIds, dueDate }, url.origin),
			description: body.description?.trim() || null,
			attachments: attachmentSnapshots(attachments, url.origin)
		}
	});
	void notifyTaskAssigned({
		task: createdCtx,
		assigneeIds: created.assignedIds,
		actor: { id: user.id, name: user.name },
		origin: url.origin
	}).catch((err) => console.error('task create notify failed', err));
	return json({ id: created.id, displayId: created.displayId }, { status: 201 });
};
