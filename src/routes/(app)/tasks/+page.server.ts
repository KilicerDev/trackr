import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	project,
	task,
	taskAssignee,
	taskComment,
	taskPlanning,
	taskTimeLog
} from '$lib/server/db/app.schema';
import { user } from '$lib/server/db/auth.schema';
import { loadTasks } from '$lib/server/tasks';
import { notify } from '$lib/server/notify';
import { taskRecipients } from '$lib/server/notify-recipients';
import { accessibleProjectIds, assertCan, can } from '$lib/server/permissions';
import { getPreferences } from '$lib/server/preferences';

export const load: ServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/sign-in');
	const access = accessibleProjectIds(locals);
	const [tasks, preferences] = await Promise.all([
		loadTasks({
			plannerUserId: locals.user.id,
			projectIds: access.all ? undefined : [...access.ids]
		}),
		getPreferences(locals.user.id)
	]);
	// Returned at the page level (not the layout) so SvelteKit re-runs this
	// load on every revisit to /tasks — keeping savedView fresh without a
	// hard reload.
	const savedView = (preferences.viewState?.tasks ?? {}) as Record<string, unknown>;
	return { tasks, savedView };
};

async function resolveTaskByDisplayId(displayId: string) {
	const dash = displayId.lastIndexOf('-');
	if (dash < 0) return null;
	const key = displayId.slice(0, dash);
	const number = Number(displayId.slice(dash + 1));
	if (!Number.isFinite(number)) return null;

	const [row] = await db
		.select({
			id: task.id,
			title: task.title,
			status: task.status,
			projectId: project.id,
			projectKey: project.key,
			projectOrgId: project.orgId,
			createdBy: task.createdBy
		})
		.from(task)
		.innerJoin(project, eq(project.id, task.projectId))
		.where(
			and(eq(project.key, key), eq(task.number, number), isNull(task.deletedAt))
		)
		.limit(1);
	return row ?? null;
}

const ALLOWED_STATUS = new Set(['backlog', 'todo', 'in_progress', 'paused', 'in_review', 'done']);
const ALLOWED_PRIORITY = new Set(['none', 'low', 'medium', 'high', 'urgent']);

export const actions: Actions = {
	create: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		const me = locals.user;

		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		const projectKey = String(form.get('project') ?? '').trim();
		const status = String(form.get('status') ?? 'todo');
		const priority = String(form.get('priority') ?? 'medium');
		const due = String(form.get('due') ?? '').trim();
		const estimateRaw = String(form.get('estimate') ?? '').trim();
		const tags = form.getAll('tags').map((v) => String(v)).filter(Boolean);
		const assigneeIds = form.getAll('assignees').map((v) => String(v)).filter(Boolean);
		const plannedFor = String(form.get('plannedFor') ?? '').trim();

		if (!title) return fail(400, { message: 'Title is required.' });
		if (!projectKey) return fail(400, { message: 'Project is required.' });
		if (plannedFor && !/^\d{4}-\d{2}-\d{2}$/.test(plannedFor)) {
			return fail(400, { message: 'Invalid planned date.' });
		}

		const [p] = await db
			.select({ id: project.id, key: project.key, orgId: project.orgId })
			.from(project)
			.where(eq(project.key, projectKey))
			.limit(1);
		if (!p) return fail(400, { message: `Project "${projectKey}" was not found.` });

		await assertCan(locals, 'project.tasks.create', { projectId: p.id });

		const dueDate = due ? new Date(due) : null;
		const estimate = estimateRaw ? Number(estimateRaw) : null;
		const finalAssignees = assigneeIds.length > 0 ? assigneeIds : [me.id];

		const newId = crypto.randomUUID();
		let displayId = '';
		let assignedIds: string[] = [];
		try {
			await db.transaction(async (tx) => {
				const [bumped] = await tx
					.update(project)
					.set({ nextTaskNumber: sql`${project.nextTaskNumber} + 1` })
					.where(eq(project.id, p.id))
					.returning({ next: project.nextTaskNumber });
				const number = bumped.next - 1;

				await tx.insert(task).values({
					id: newId,
					projectId: p.id,
					number,
					title,
					description,
					status,
					priority,
					type: 'task',
					dueDate,
					estimateMinutes: estimate,
					tags,
					createdBy: me.id
				});

				const validAssignees: string[] = [];
				if (finalAssignees.length) {
					const usersFound = await tx
						.select({ id: user.id })
						.from(user)
						.where(inArray(user.id, finalAssignees));
					for (const u of usersFound) validAssignees.push(u.id);
				}
				if (validAssignees.length === 0) validAssignees.push(me.id);

				await tx.insert(taskAssignee).values(
					validAssignees.map((userId) => ({ taskId: newId, userId }))
				);

				if (plannedFor) {
					await tx.insert(taskPlanning).values({
						taskId: newId,
						userId: me.id,
						plannedFor
					});
				}

				displayId = `${p.key}-${number}`;
				assignedIds = validAssignees;
			});
		} catch (err) {
			console.error('task create failed', err);
			return fail(500, { message: 'Failed to create task.' });
		}

		// Notify each newly-assigned user (notify() drops the actor itself, so
		// self-assignment is silent). Fire-and-forget: a failed notification
		// must never undo the create.
		void notify({
			kind: 'taskAssigned',
			recipients: assignedIds,
			actorId: me.id,
			orgId: p.orgId,
			title: `Assigned to you: ${displayId} — ${title}`,
			url: `/tasks?task=${displayId}`,
			entity: { type: 'task', id: newId },
			baseUrl: url.origin
		}).catch((err) => console.error('task create notify failed', err));

		return { success: true, id: newId, displayId };
	},

	update: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, 'Not authenticated');

		const form = await request.formData();
		const displayId = String(form.get('id') ?? '').trim();
		if (!displayId) return fail(400, { message: 'Missing task id.' });

		const target = await resolveTaskByDisplayId(displayId);
		if (!target) return fail(404, { message: 'Task not found.' });

		// Editing is allowed if the user has project.tasks.edit.any on the
		// task's project, OR they're the creator and have edit.own.
		const projectId = target.projectId;
		const isCreator = target.createdBy === locals.user.id;
		const allowed =
			(await can(locals, 'project.tasks.edit.any', { projectId })) ||
			(isCreator && (await can(locals, 'project.tasks.edit.own', { projectId })));
		if (!allowed) error(403, 'You cannot edit this task.');

		const patch: Record<string, unknown> = {};

		if (form.has('status')) {
			const v = String(form.get('status'));
			if (!ALLOWED_STATUS.has(v)) return fail(400, { message: `Invalid status "${v}".` });
			patch.status = v;
		}
		if (form.has('priority')) {
			const v = String(form.get('priority'));
			if (!ALLOWED_PRIORITY.has(v)) return fail(400, { message: `Invalid priority "${v}".` });
			patch.priority = v;
		}
		if (form.has('title')) {
			const v = String(form.get('title')).trim();
			if (!v) return fail(400, { message: 'Title cannot be empty.' });
			patch.title = v;
		}
		if (form.has('description')) {
			const v = String(form.get('description'));
			patch.description = v.trim() || null;
		}
		if (form.has('due')) {
			const v = String(form.get('due')).trim();
			patch.dueDate = v ? new Date(v) : null;
		}
		if (form.has('estimate')) {
			const v = String(form.get('estimate')).trim();
			patch.estimateMinutes = v ? Number(v) : null;
		}

		// Assignees come either as the multi-value `assignees` field, or as a
		// flag `assignees=__clear__` to indicate explicit empty.
		let assigneesUpdate: string[] | null = null;
		if (form.has('assignees')) {
			const all = form.getAll('assignees').map((v) => String(v));
			if (all.length === 1 && all[0] === '__clear__') {
				assigneesUpdate = [];
			} else {
				assigneesUpdate = all.filter(Boolean);
			}
		}

		// Snapshot prior assignees so we can compute the *added* set and only
		// notify newly-assigned users. Reads outside the transaction are fine
		// here — the resolve already pinned the task and we use the snapshot
		// purely for diffing, not for correctness of the write.
		const priorAssigneeRows = await db
			.select({ userId: taskAssignee.userId })
			.from(taskAssignee)
			.where(eq(taskAssignee.taskId, target.id));
		const priorAssignees = new Set(priorAssigneeRows.map((r) => r.userId));
		const priorStatus = target.status;

		// Declared via a holder object so TypeScript's control-flow analysis
		// doesn't collapse the type to `null` based on the outer initializer
		// — mutations happen inside the transaction callback, which CFA
		// cannot follow.
		const assigneeOut: { next: string[] | null } = { next: null };
		try {
			await db.transaction(async (tx) => {
				if (Object.keys(patch).length > 0) {
					await tx.update(task).set(patch).where(eq(task.id, target.id));
				}
				if (assigneesUpdate !== null) {
					await tx.delete(taskAssignee).where(eq(taskAssignee.taskId, target.id));
					if (assigneesUpdate.length > 0) {
						const valid = await tx
							.select({ id: user.id })
							.from(user)
							.where(inArray(user.id, assigneesUpdate));
						if (valid.length > 0) {
							await tx.insert(taskAssignee).values(
								valid.map((u) => ({ taskId: target.id, userId: u.id }))
							);
						}
						assigneeOut.next = valid.map((u) => u.id);
					} else {
						assigneeOut.next = [];
					}
				}
			});
		} catch (err) {
			console.error('task update failed', err);
			return fail(500, { message: 'Failed to save changes.' });
		}

		const me = locals.user;
		const taskUrl = `/tasks?task=${displayId}`;

		// Notify users newly added to the task.
		const assigned = assigneeOut.next;
		if (assigned !== null) {
			const added = assigned.filter((id) => !priorAssignees.has(id));
			if (added.length > 0) {
				void notify({
					kind: 'taskAssigned',
					recipients: added,
					actorId: me.id,
					orgId: target.projectOrgId,
					title: `Assigned to you: ${displayId} — ${target.title}`,
					url: taskUrl,
					entity: { type: 'task', id: target.id },
					baseUrl: url.origin
				}).catch((err) => console.error('task assign notify failed', err));
			}
		}

		// Notify watchers on status change. "Watchers" = current assignees +
		// the creator. Use the post-update assignee set if it changed.
		if (typeof patch.status === 'string' && patch.status !== priorStatus) {
			const finalAssignees = assigneeOut.next ?? [...priorAssignees];
			const recipients = taskRecipients({
				creatorId: target.createdBy,
				assigneeIds: finalAssignees
			});
			void notify({
				kind: 'taskStatusChanged',
				recipients,
				actorId: me.id,
				orgId: target.projectOrgId,
				title: `${displayId} → ${patch.status}: ${target.title}`,
				url: taskUrl,
				entity: { type: 'task', id: target.id },
				baseUrl: url.origin
			}).catch((err) => console.error('task status notify failed', err));
		}

		return { success: true };
	},

	commentAdd: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		const me = locals.user;

		const form = await request.formData();
		const displayId = String(form.get('id') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		if (!displayId) return fail(400, { message: 'Missing task id.' });
		if (!body) return fail(400, { message: 'Comment cannot be empty.' });

		const target = await resolveTaskByDisplayId(displayId);
		if (!target) return fail(404, { message: 'Task not found.' });

		await assertCan(locals, 'project.tasks.comment', { projectId: target.projectId });

		try {
			await db.insert(taskComment).values({
				id: crypto.randomUUID(),
				taskId: target.id,
				authorId: me.id,
				body
			});
			// Bump the task's updatedAt so the activity flag is accurate.
			await db.update(task).set({ updatedAt: new Date() }).where(eq(task.id, target.id));
		} catch (err) {
			console.error('comment add failed', err);
			return fail(500, { message: 'Failed to add comment.' });
		}

		// Notify assignees + creator + anyone else who commented on the task.
		// Looped previous-commenter query is cheap relative to the comment
		// insert itself and lets us avoid notifying drive-by readers.
		const [assigneeRows, priorCommenterRows] = await Promise.all([
			db
				.select({ userId: taskAssignee.userId })
				.from(taskAssignee)
				.where(eq(taskAssignee.taskId, target.id)),
			db
				.select({ authorId: taskComment.authorId })
				.from(taskComment)
				.where(eq(taskComment.taskId, target.id))
		]);
		const recipients = taskRecipients({
			creatorId: target.createdBy,
			assigneeIds: assigneeRows.map((r) => r.userId),
			extraIds: priorCommenterRows
				.map((r) => r.authorId)
				.filter((id): id is string => id !== null)
		});
		void notify({
			kind: 'taskCommented',
			recipients,
			actorId: me.id,
			orgId: target.projectOrgId,
			title: `New comment on ${displayId}: ${target.title}`,
			body,
			url: `/tasks?task=${displayId}`,
			entity: { type: 'task', id: target.id },
			baseUrl: url.origin
		}).catch((err) => console.error('task comment notify failed', err));

		return { success: true };
	},

	planSet: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		const me = locals.user;

		const form = await request.formData();
		const displayId = String(form.get('id') ?? '').trim();
		const plannedFor = String(form.get('plannedFor') ?? '').trim();
		const mode = String(form.get('mode') ?? '').trim();
		if (!displayId) return fail(400, { message: 'Missing task id.' });

		const target = await resolveTaskByDisplayId(displayId);
		if (!target) return fail(404, { message: 'Task not found.' });

		await assertCan(locals, 'project.tasks.read', { projectId: target.projectId });

		try {
			if (mode === 'undated') {
				// In my week, no specific day.
				await db
					.insert(taskPlanning)
					.values({ taskId: target.id, userId: me.id, plannedFor: null })
					.onConflictDoUpdate({
						target: [taskPlanning.taskId, taskPlanning.userId],
						set: { plannedFor: null, updatedAt: new Date() }
					});
			} else if (!plannedFor) {
				// Empty + no mode = remove from plan entirely.
				await db
					.delete(taskPlanning)
					.where(and(eq(taskPlanning.taskId, target.id), eq(taskPlanning.userId, me.id)));
			} else {
				if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedFor)) {
					return fail(400, { message: 'Invalid date.' });
				}
				await db
					.insert(taskPlanning)
					.values({ taskId: target.id, userId: me.id, plannedFor })
					.onConflictDoUpdate({
						target: [taskPlanning.taskId, taskPlanning.userId],
						set: { plannedFor, updatedAt: new Date() }
					});
			}
		} catch (err) {
			console.error('plan set failed', err);
			return fail(500, { message: 'Failed to update plan.' });
		}

		return { success: true };
	},

	timeLogAdd: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		const me = locals.user;

		const form = await request.formData();
		const displayId = String(form.get('id') ?? '').trim();
		const hours = Number(form.get('hours') ?? 0);
		const minutes = Number(form.get('minutes') ?? 0);
		const date = String(form.get('date') ?? '').trim();
		const note = String(form.get('note') ?? '').trim() || null;

		if (!displayId) return fail(400, { message: 'Missing task id.' });
		if (!date) return fail(400, { message: 'Missing date.' });

		const total = Math.round(hours * 60) + Math.round(minutes);
		if (!Number.isFinite(total) || total <= 0) {
			return fail(400, { message: 'Time must be greater than zero.' });
		}

		const target = await resolveTaskByDisplayId(displayId);
		if (!target) return fail(404, { message: 'Task not found.' });

		await assertCan(locals, 'project.tasks.read', { projectId: target.projectId });

		try {
			await db.insert(taskTimeLog).values({
				id: crypto.randomUUID(),
				taskId: target.id,
				userId: me.id,
				minutes: total,
				note,
				loggedAt: date
			});
			await db.update(task).set({ updatedAt: new Date() }).where(eq(task.id, target.id));
		} catch (err) {
			console.error('time log add failed', err);
			return fail(500, { message: 'Failed to log time.' });
		}

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');

		const form = await request.formData();
		const displayId = String(form.get('id') ?? '').trim();
		if (!displayId) return fail(400, { message: 'Missing task id.' });

		const target = await resolveTaskByDisplayId(displayId);
		if (!target) return fail(404, { message: 'Task not found.' });

		await assertCan(locals, 'project.tasks.delete.any', { projectId: target.projectId });

		try {
			await db
				.update(task)
				.set({ deletedAt: new Date() })
				.where(eq(task.id, target.id));
		} catch (err) {
			console.error('task delete failed', err);
			return fail(500, { message: 'Failed to delete task.' });
		}

		return { success: true };
	}
};
