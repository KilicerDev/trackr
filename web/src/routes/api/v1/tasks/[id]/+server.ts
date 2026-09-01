// Task detail + edits. `id` is the task UUID.
//   GET   — full task view model + display directory + canEdit; editors also
//           get the assignee picker candidates (internal users only).
//   PATCH { status?, priority?, type?, title?, description?, due?, estimate?,
//           tags?, checklist?, assigneeIds?, plannedFor? } — permission mirrors
//   the web update action: project.tasks.edit.any, or creator + edit.own.
//   plannedFor plans the task into the *caller's* week (web planSet parity)
//   and only needs read access, like the web action.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	message,
	organization,
	organizationMember,
	project,
	task,
	taskAssignee,
	taskPlanning,
	thread
} from '$lib/server/db/app.schema';
import { deleteAttachmentsFor } from '$lib/server/attachments';
import { user as userTable } from '$lib/server/db/auth.schema';
import { can } from '$lib/server/permissions';
import {
	ALLOWED_TASK_PRIORITY,
	ALLOWED_TASK_STATUS,
	ALLOWED_TASK_TYPE,
	loadTasks
} from '$lib/server/tasks';
import {
	loadAssignableUsers,
	loadTicketDisplayUsers,
	syncTicketChecklistFromTask
} from '$lib/server/tickets';
import { notifyTaskAssigned, notifyTaskStatusChanged } from '$lib/server/notify/events/task';
import { logActivityFF } from '$lib/server/activity';
import { normalizeTag } from '$lib/utils/label-meta';
import { recordAudit } from '$lib/server/audit';
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
// only, deletedAt stamp, attachment cleanup, activity + audit entries.
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const user = requireUser(locals);
	const [target] = await db
		.select({
			id: task.id,
			number: task.number,
			title: task.title,
			projectId: project.id,
			projectKey: project.key,
			projectOrgId: project.orgId
		})
		.from(task)
		.innerJoin(project, eq(project.id, task.projectId))
		.where(and(eq(task.id, params.id), isNull(task.deletedAt)))
		.limit(1);
	if (!target) apiError(404, m.tasks_err_task_not_found());
	// Unknown ids and no-read both answer 404 so the endpoint doesn't leak
	// which task uuids exist; a reader without the grant gets the 403.
	if (!(await can(locals, 'project.tasks.read', { projectId: target.projectId }))) {
		apiError(404, m.tasks_err_task_not_found());
	}
	if (!(await can(locals, 'project.tasks.delete.any', { projectId: target.projectId }))) {
		apiError(403, m.tasks_err_cannot_edit());
	}

	const displayId = `${target.projectKey}-${target.number}`;
	await db.update(task).set({ deletedAt: new Date() }).where(eq(task.id, target.id));
	// The task's read paths are now closed, so its attachments are already
	// unreachable; remove their files (task-level + per-comment) to reclaim
	// disk — same cleanup as the web action.
	await deleteAttachmentsFor('task', target.id);
	const comments = await db
		.select({ id: message.id })
		.from(message)
		.innerJoin(thread, eq(thread.id, message.threadId))
		.where(and(eq(thread.subjectType, 'task'), eq(thread.subjectId, target.id)));
	for (const c of comments) await deleteAttachmentsFor('message', c.id);

	logActivityFF({
		projectId: target.projectId,
		taskId: target.id,
		actorId: user.id,
		type: 'task.deleted',
		meta: { taskRef: displayId, taskTitle: target.title }
	});
	void recordAudit({
		type: 'task.delete',
		actorId: user.id,
		targetType: 'task',
		targetId: target.id,
		targetLabel: `${displayId} · ${target.title}`,
		orgId: target.projectOrgId,
		meta: { projectId: target.projectId, via: 'api.v1' }
	});

	return json({ ok: true });
};

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	const user = requireUser(locals);
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
		plannedFor?: string | null;
	}>(request);

	const [target] = await db
		.select({
			id: task.id,
			number: task.number,
			title: task.title,
			status: task.status,
			createdBy: task.createdBy,
			sourceTicketId: task.sourceTicketId,
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

	const patch: Record<string, unknown> = {};
	if (body.status !== undefined) {
		if (!ALLOWED_TASK_STATUS.has(body.status)) {
			apiError(400, m.tasks_err_invalid_status({ value: String(body.status) }));
		}
		patch.status = body.status;
	}
	if (body.priority !== undefined) {
		if (!ALLOWED_TASK_PRIORITY.has(body.priority)) {
			apiError(400, m.tasks_err_invalid_priority({ value: String(body.priority) }));
		}
		patch.priority = body.priority;
	}
	if (body.type !== undefined) {
		if (!ALLOWED_TASK_TYPE.has(body.type)) {
			apiError(400, m.tasks_err_invalid_type({ type: String(body.type) }));
		}
		patch.type = body.type;
	}
	if (body.title !== undefined) {
		const v = String(body.title).trim();
		if (!v) apiError(400, m.tasks_err_title_empty());
		patch.title = v;
	}
	if (body.description !== undefined) {
		patch.description = String(body.description ?? '').trim() || null;
	}
	if (body.estimate !== undefined) {
		if (body.estimate === null) {
			patch.estimateMinutes = null;
		} else {
			if (typeof body.estimate !== 'number' || !Number.isFinite(body.estimate)) {
				apiError(400, 'estimate must be a number of minutes or null.');
			}
			patch.estimateMinutes = body.estimate > 0 ? Math.round(body.estimate) : null;
		}
	}
	// Tags: full array, normalized + deduped like the web action ([] clears).
	if (body.tags !== undefined) {
		if (!Array.isArray(body.tags) || body.tags.some((x) => typeof x !== 'string')) {
			apiError(400, 'tags must be a string array.');
		}
		patch.tags = [...new Set(body.tags.map((v) => normalizeTag(v)).filter(Boolean))];
	}
	if (body.due !== undefined) {
		if (body.due) {
			const d = new Date(body.due);
			if (Number.isNaN(d.getTime())) apiError(400, m.tasks_err_invalid_date());
			patch.dueDate = d;
		} else {
			patch.dueDate = null;
		}
	}
	// Checklist: full array, sanitized like the web action — {id,text,done},
	// empty text dropped, capped so a runaway payload can't bloat the row.
	if (body.checklist !== undefined) {
		if (!Array.isArray(body.checklist)) apiError(400, m.tasks_err_invalid_checklist());
		patch.checklist = body.checklist
			.slice(0, 100)
			.map((it) => ({
				id: typeof it?.id === 'string' && it.id ? it.id : crypto.randomUUID(),
				text: String(it?.text ?? '')
					.trim()
					.slice(0, 500),
				done: !!it?.done
			}))
			.filter((it) => it.text.length > 0);
	}
	let assigneesUpdate: string[] | null = null;
	if (body.assigneeIds !== undefined) {
		if (!Array.isArray(body.assigneeIds) || body.assigneeIds.some((x) => typeof x !== 'string')) {
			apiError(400, 'assigneeIds must be a string array.');
		}
		assigneesUpdate = [...new Set(body.assigneeIds)];
	}
	// plannedFor plans the task into the caller's own week (a date string) or
	// removes it (null). Web planSet parity: per-user planning row, read access
	// is enough — it never touches the task row itself.
	let plannedUpdate: { date: string | null } | null = null;
	if (body.plannedFor !== undefined) {
		if (body.plannedFor === null || body.plannedFor === '') {
			plannedUpdate = { date: null };
		} else {
			if (typeof body.plannedFor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.plannedFor)) {
				apiError(400, m.tasks_err_invalid_date());
			}
			plannedUpdate = { date: body.plannedFor };
		}
	}

	const hasEdits = Object.keys(patch).length > 0 || assigneesUpdate !== null;
	if (hasEdits && !allowed) apiError(403, m.tasks_err_cannot_edit());
	if (!hasEdits && plannedUpdate !== null) {
		// Planning-only calls need read access; answer 404 (not 403) so the
		// endpoint doesn't leak which task uuids exist — same as GET.
		if (!(await can(locals, 'project.tasks.read', { projectId: target.projectId }))) {
			apiError(404, m.tasks_err_task_not_found());
		}
	}

	if (!hasEdits && plannedUpdate === null) {
		return json({ ok: true, unchanged: true });
	}

	if (plannedUpdate !== null) {
		if (plannedUpdate.date) {
			await db
				.insert(taskPlanning)
				.values({ taskId: target.id, userId: user.id, plannedFor: plannedUpdate.date })
				.onConflictDoUpdate({
					target: [taskPlanning.taskId, taskPlanning.userId],
					set: { plannedFor: plannedUpdate.date, updatedAt: new Date() }
				});
		} else {
			await db
				.delete(taskPlanning)
				.where(and(eq(taskPlanning.taskId, target.id), eq(taskPlanning.userId, user.id)));
		}
		if (!hasEdits) return json({ ok: true });
	}

	const priorAssigneeRows = await db
		.select({ userId: taskAssignee.userId })
		.from(taskAssignee)
		.where(eq(taskAssignee.taskId, target.id));
	const priorAssignees = new Set(priorAssigneeRows.map((r) => r.userId));

	const assigneeOut: { next: string[] | null } = { next: null };
	await db.transaction(async (tx) => {
		if (Object.keys(patch).length > 0) {
			await tx.update(task).set(patch).where(eq(task.id, target.id));
		}
		if (assigneesUpdate !== null) {
			await tx.delete(taskAssignee).where(eq(taskAssignee.taskId, target.id));
			if (assigneesUpdate.length > 0) {
				// Tasks are internal work: only platform (internal-org) users may be
				// assigned — mirror the web action's guard, never trust posted ids.
				const valid = await tx
					.selectDistinct({ id: userTable.id })
					.from(userTable)
					.innerJoin(organizationMember, eq(organizationMember.userId, userTable.id))
					.innerJoin(organization, eq(organization.id, organizationMember.orgId))
					.where(and(inArray(userTable.id, assigneesUpdate), eq(organization.isInternal, true)));
				if (valid.length > 0) {
					await tx
						.insert(taskAssignee)
						.values(valid.map((u) => ({ taskId: target.id, userId: u.id })));
				}
				assigneeOut.next = valid.map((u) => u.id);
			} else {
				assigneeOut.next = [];
			}
		}
	});

	// Mirror checklist completion back to the source ticket (items copied on
	// conversion share their id). Fire-and-forget — never undoes the save.
	if (target.sourceTicketId && Array.isArray(patch.checklist)) {
		void syncTicketChecklistFromTask(
			target.sourceTicketId,
			patch.checklist as { id: string; done: boolean }[]
		).catch((err) => console.error('ticket checklist sync failed', err));
	}

	const displayId = `${target.projectKey}-${target.number}`;
	const currentAssignees = assigneeOut.next ?? [...priorAssignees];

	const taskCtx = {
		id: target.id,
		displayId,
		title: target.title,
		orgId: target.projectOrgId
	};
	const statusChanged = patch.status !== undefined && patch.status !== target.status;
	if (statusChanged) {
		void notifyTaskStatusChanged({
			task: taskCtx,
			creatorId: target.createdBy,
			assigneeIds: currentAssignees,
			newStatus: String(patch.status),
			actor: { id: user.id, name: user.name },
			origin: url.origin
		}).catch((err) => console.error('task status notify failed', err));
		logActivityFF({
			projectId: target.projectId,
			taskId: target.id,
			actorId: user.id,
			type: 'task.status',
			meta: {
				taskRef: displayId,
				taskTitle: target.title,
				from: target.status,
				to: patch.status
			}
		});
	}

	// Notify users newly added to the task (never the actor themselves).
	const newlyAssigned = (assigneeOut.next ?? []).filter(
		(id) => !priorAssignees.has(id) && id !== user.id
	);
	if (newlyAssigned.length) {
		void notifyTaskAssigned({
			task: taskCtx,
			assigneeIds: newlyAssigned,
			actor: { id: user.id, name: user.name },
			origin: url.origin
		}).catch((err) => console.error('task assigned notify failed', err));
	}

	void recordAudit({
		type: 'task.update',
		actorId: user.id,
		targetType: 'task',
		targetId: target.id,
		targetLabel: `${displayId} · ${target.title}`,
		orgId: target.projectOrgId,
		meta: {
			projectId: target.projectId,
			fields: [...Object.keys(patch), ...(assigneesUpdate !== null ? ['assignees'] : [])],
			via: 'api.v1'
		}
	});

	return json({ ok: true });
};
