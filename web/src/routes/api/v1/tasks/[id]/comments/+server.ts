// Add a comment to a task's thread. `id` is the task UUID. Mirrors the web
// comment action (project.tasks.comment) minus attachments — those stay a
// desktop concern for now. Notification fan-out (incl. @-mentions) is shared
// with the web action via notifyTaskComment.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { message, project, task, taskAssignee, thread } from '$lib/server/db/app.schema';
import { assertCan } from '$lib/server/permissions';
import { notifyTaskComment } from '$lib/server/notify/events/task';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	const user = requireUser(locals);
	const body = (await readJson<{ body?: string }>(request)).body?.trim();
	if (!body) apiError(400, m.tasks_err_comment_empty());

	const [target] = await db
		.select({
			id: task.id,
			number: task.number,
			title: task.title,
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
	await assertCan(locals, 'project.tasks.comment', { projectId: target.projectId });

	const commentId = crypto.randomUUID();
	// Get-or-create the task's comment thread (backfill made one per task;
	// new tasks create theirs lazily on first comment).
	let [th] = await db
		.select({ id: thread.id })
		.from(thread)
		.where(and(eq(thread.subjectType, 'task'), eq(thread.subjectId, target.id)))
		.limit(1);
	if (!th) {
		const tid = crypto.randomUUID();
		await db.insert(thread).values({ id: tid, subjectType: 'task', subjectId: target.id });
		th = { id: tid };
	}
	await db.insert(message).values({
		id: commentId,
		threadId: th.id,
		authorId: user.id,
		body,
		kind: 'comment'
	});
	// Bump the task's updatedAt so the activity flag is accurate.
	await db.update(task).set({ updatedAt: new Date() }).where(eq(task.id, target.id));

	const displayId = `${target.projectKey}-${target.number}`;
	// Notify assignees + creator + prior commenters (the web action's audience).
	const [assigneeRows, priorCommenterRows] = await Promise.all([
		db
			.select({ userId: taskAssignee.userId })
			.from(taskAssignee)
			.where(eq(taskAssignee.taskId, target.id)),
		db
			.select({ authorId: message.authorId })
			.from(message)
			.innerJoin(thread, eq(thread.id, message.threadId))
			.where(
				and(
					eq(thread.subjectType, 'task'),
					eq(thread.subjectId, target.id),
					isNull(message.deletedAt)
				)
			)
	]);
	void notifyTaskComment({
		task: {
			id: target.id,
			displayId,
			title: target.title,
			orgId: target.projectOrgId
		},
		projectId: target.projectId,
		creatorId: target.createdBy,
		assigneeIds: assigneeRows.map((r) => r.userId),
		priorCommenterIds: priorCommenterRows
			.map((r) => r.authorId)
			.filter((id): id is string => id !== null),
		body,
		actor: { id: user.id, name: user.name },
		origin: url.origin
	}).catch((err) => console.error('task comment notify failed', err));

	void recordAudit({
		type: 'task.comment',
		actorId: user.id,
		targetType: 'task',
		targetId: target.id,
		targetLabel: `${displayId} · ${target.title}`,
		orgId: target.projectOrgId,
		meta: { projectId: target.projectId, taskRef: displayId, body, via: 'api.v1' }
	});

	return json({ id: commentId }, { status: 201 });
};
