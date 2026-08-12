// Log time on a task. `id` is the task UUID. Mirrors the web timeLogAdd
// action: any user who can read the task may log time; entry = minutes +
// calendar date + optional note.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { project, task, taskTimeLog } from '$lib/server/db/app.schema';
import { can } from '$lib/server/permissions';
import { logActivityFF } from '$lib/server/activity';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const body = await readJson<{ minutes?: number; date?: string; note?: string }>(request);

	const total = Math.round(Number(body.minutes ?? 0));
	if (!Number.isFinite(total) || total <= 0) apiError(400, m.tasks_err_time_positive());
	const date = String(body.date ?? '').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) apiError(400, m.tasks_err_invalid_date());

	const [target] = await db
		.select({
			id: task.id,
			number: task.number,
			title: task.title,
			projectId: project.id,
			projectKey: project.key
		})
		.from(task)
		.innerJoin(project, eq(project.id, task.projectId))
		.where(and(eq(task.id, params.id), isNull(task.deletedAt)))
		.limit(1);
	if (!target) apiError(404, m.tasks_err_task_not_found());
	// Unknown ids and no-access both answer 404 (same as the detail GET).
	if (!(await can(locals, 'project.tasks.read', { projectId: target.projectId }))) {
		apiError(404, m.tasks_err_task_not_found());
	}

	const note = String(body.note ?? '').trim() || null;
	await db.insert(taskTimeLog).values({
		id: crypto.randomUUID(),
		taskId: target.id,
		userId: user.id,
		minutes: total,
		note,
		loggedAt: date
	});
	await db.update(task).set({ updatedAt: new Date() }).where(eq(task.id, target.id));

	logActivityFF({
		projectId: target.projectId,
		taskId: target.id,
		actorId: user.id,
		type: 'time.logged',
		meta: {
			taskRef: `${target.projectKey}-${target.number}`,
			taskTitle: target.title,
			minutes: total,
			note,
			loggedAt: date
		}
	});

	return json({ ok: true }, { status: 201 });
};
