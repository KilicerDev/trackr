// Task detail + edits. `id` is the task UUID.
//   GET   — full task view model + display directory + canEdit; editors also
//           get the assignee picker candidates (internal users only).
//   PATCH { status?, priority?, type?, description?, due?, checklist?,
//           assigneeIds? } — permission mirrors the web update action:
//   project.tasks.edit.any, or creator + edit.own. Estimate/tags/title stay
//   desktop-only.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	organization,
	organizationMember,
	project,
	task,
	taskAssignee
} from '$lib/server/db/app.schema';
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
import { taskRecipients } from '$lib/server/notify/recipients';
import { notify } from '$lib/server/notify';
import { logActivityFF } from '$lib/server/activity';
import { recordAudit } from '$lib/server/audit';
import { statusLabel } from '$lib/utils/labels';
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

	const tasks = await loadTasks({ projectId: row.projectId });
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

	return json({ task: detail, authors, assignableUsers, canEdit, canComment });
};

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	const user = requireUser(locals);
	const body = await readJson<{
		status?: string;
		priority?: string;
		type?: string;
		description?: string | null;
		due?: string | null;
		checklist?: { id?: string; text?: string; done?: boolean }[];
		assigneeIds?: string[];
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
	if (!allowed) apiError(403, m.tasks_err_cannot_edit());

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
	if (body.description !== undefined) {
		patch.description = String(body.description ?? '').trim() || null;
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

	if (Object.keys(patch).length === 0 && assigneesUpdate === null) {
		return json({ ok: true, unchanged: true });
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

	const statusChanged = patch.status !== undefined && patch.status !== target.status;
	if (statusChanged) {
		const recipients = taskRecipients({
			creatorId: target.createdBy,
			assigneeIds: currentAssignees
		});
		void notify({
			kind: 'taskStatusChanged',
			recipients,
			actorId: user.id,
			orgId: target.projectOrgId,
			render: (locale) => ({
				title: m.notify_task_status(
					{ ref: displayId, status: statusLabel(String(patch.status), locale), title: target.title },
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
		void notify({
			kind: 'taskAssigned',
			recipients: newlyAssigned,
			actorId: user.id,
			orgId: target.projectOrgId,
			render: (locale) => ({
				title: m.notify_task_assigned({ ref: displayId, title: target.title }, { locale })
			}),
			url: `/tasks?task=${displayId}`,
			entity: { type: 'task', id: target.id },
			baseUrl: url.origin
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
