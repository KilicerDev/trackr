// Task status change (checkbox = status:'done'). `id` is the task UUID.
// Permission mirrors the web update action: project.tasks.edit.any, or
// creator + edit.own.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { project, task, taskAssignee } from '$lib/server/db/app.schema';
import { can } from '$lib/server/permissions';
import { ALLOWED_TASK_STATUS } from '$lib/server/tasks';
import { taskRecipients } from '$lib/server/notify/recipients';
import { notify } from '$lib/server/notify';
import { logActivityFF } from '$lib/server/activity';
import { recordAudit } from '$lib/server/audit';
import { statusLabel } from '$lib/utils/labels';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	const user = requireUser(locals);
	const body = await readJson<{ status?: string }>(request);
	const status = body.status;
	if (!status || !ALLOWED_TASK_STATUS.has(status)) {
		apiError(400, m.tasks_err_invalid_status({ value: String(status) }));
	}

	const [target] = await db
		.select({
			id: task.id,
			number: task.number,
			title: task.title,
			status: task.status,
			createdBy: task.createdBy,
			projectId: project.id,
			projectKey: project.key,
			projectOrgId: project.orgId
		})
		.from(task)
		.innerJoin(project, eq(project.id, task.projectId))
		.where(and(eq(task.id, params.id), isNull(task.deletedAt)))
		.limit(1);
	if (!target) apiError(404, m.tasks_err_task_not_found());

	const isCreator = target.createdBy === user.id;
	const allowed =
		(await can(locals, 'project.tasks.edit.any', { projectId: target.projectId })) ||
		(isCreator && (await can(locals, 'project.tasks.edit.own', { projectId: target.projectId })));
	if (!allowed) apiError(403, m.tasks_err_cannot_edit());

	if (status === target.status) return json({ ok: true, unchanged: true });
	await db.update(task).set({ status }).where(eq(task.id, target.id));

	const displayId = `${target.projectKey}-${target.number}`;
	const assigneeRows = await db
		.select({ userId: taskAssignee.userId })
		.from(taskAssignee)
		.where(eq(taskAssignee.taskId, target.id));
	const recipients = taskRecipients({
		creatorId: target.createdBy,
		assigneeIds: assigneeRows.map((r) => r.userId)
	});
	void notify({
		kind: 'taskStatusChanged',
		recipients,
		actorId: user.id,
		orgId: target.projectOrgId,
		render: (locale) => ({
			title: m.notify_task_status(
				{ ref: displayId, status: statusLabel(status, locale), title: target.title },
				{ locale }
			)
		}),
		url: `/tasks?task=${displayId}`,
		entity: { type: 'task', id: target.id },
		baseUrl: url.origin
	}).catch((err) => console.error('task status notify failed', err));
	logActivityFF({
		projectId: target.projectId,
		taskId: target.id,
		actorId: user.id,
		type: 'task.status',
		meta: { taskRef: displayId, taskTitle: target.title, from: target.status, to: status }
	});
	void recordAudit({
		type: 'task.status',
		actorId: user.id,
		targetType: 'task',
		targetId: target.id,
		targetLabel: `${displayId} · ${target.title}`,
		orgId: target.projectOrgId,
		meta: { projectId: target.projectId, from: target.status, to: status, via: 'api.v1' }
	});

	return json({ ok: true });
};
