// Shared task-only comment writer for REST and MCP. Parent ids are resolved
// against tasks, and threads are always scoped to subjectType = task.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { message, project, task, taskAssignee, thread } from '$lib/server/db/app.schema';
import { assertCan } from '$lib/server/permissions';
import { attachFormFiles } from '$lib/server/attachments';
import { notifyTaskComment } from '$lib/server/notify/events/task';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
import { error } from '@sveltejs/kit';

export async function addTaskComment(
	locals: App.Locals,
	taskId: string,
	input: { body: string; files?: FormDataEntryValue[] },
	opts: { origin: string; via: 'api.v1' | 'mcp' }
): Promise<{ id: string }> {
	const user = locals.user;
	if (!user) error(401, m.tasks_err_not_authenticated());
	const body = input.body.trim();
	if (!body) error(400, m.tasks_err_comment_empty());
	const files = input.files ?? [];

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
		.where(and(eq(task.id, taskId), isNull(task.deletedAt)))
		.limit(1);
	if (!target) error(404, m.tasks_err_task_not_found());
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
	await attachFormFiles({
		files,
		entityType: 'message',
		entityId: commentId,
		orgId: null,
		projectId: target.projectId,
		uploadedBy: user.id
	});

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
		origin: opts.origin
	}).catch((err) => console.error('task comment notify failed', err));

	void recordAudit({
		type: 'task.comment',
		actorId: user.id,
		targetType: 'task',
		targetId: target.id,
		targetLabel: `${displayId} · ${target.title}`,
		orgId: target.projectOrgId,
		meta: { projectId: target.projectId, taskRef: displayId, body, via: opts.via }
	});

	return { id: commentId };
}
