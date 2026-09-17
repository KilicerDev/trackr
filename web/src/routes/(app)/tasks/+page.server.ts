import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	project,
	message,
	thread,
	task,
	taskAssignee,
	taskPlanning,
	taskTimeLog,
	organization,
	organizationMember
} from '$lib/server/db/app.schema';
import { user } from '$lib/server/db/auth.schema';
import {
	ALLOWED_TASK_PRIORITY,
	ALLOWED_TASK_STATUS,
	ALLOWED_TASK_TYPE,
	createTask,
	loadTaskDependencyIds,
	loadTasks,
	resolveTaskByDisplayId,
	TaskDependencyError,
	taskRefsFor,
	validateTaskDependencies,
	writeTaskDependencies
} from '$lib/server/tasks';
import { normalizeTag } from '$lib/utils/label-meta';
import { logActivity, logActivityFF } from '$lib/server/activity';
import { attachmentSnapshots, emitWebhookEvent, taskSnapshot } from '$lib/server/webhooks';
import { recordAudit } from '$lib/server/audit';
import { syncTicketChecklistFromTask } from '$lib/server/tickets';
import {
	notifyTaskAssigned,
	notifyTaskComment,
	notifyTaskStatusChanged
} from '$lib/server/notify/events/task';
import { accessibleProjectIds, assertCan, can } from '$lib/server/permissions';
import { attachFormFiles, deleteAttachmentsFor } from '$lib/server/attachments';
import { getPreferences } from '$lib/server/preferences';
import { m } from '$lib/paraglide/messages';

export const load: ServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/sign-in');
	const access = accessibleProjectIds(locals);
	const [tasks, preferences] = await Promise.all([
		loadTasks({
			plannerUserId: locals.user.id,
			projectIds: access.all ? undefined : [...access.ids]
		}),
		locals.preferences ?? getPreferences(locals.user.id)
	]);
	// Returned at the page level (not the layout) so SvelteKit re-runs this
	// load on every revisit to /tasks — keeping savedView fresh without a
	// hard reload.
	const savedView = (preferences.viewState?.tasks ?? {}) as Record<string, unknown>;
	return { tasks, savedView };
};

const ALLOWED_STATUS = ALLOWED_TASK_STATUS;
const ALLOWED_PRIORITY = ALLOWED_TASK_PRIORITY;
const ALLOWED_TYPE = ALLOWED_TASK_TYPE;

export const actions: Actions = {
	create: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.tasks_err_not_authenticated());
		const me = locals.user;

		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		const projectKey = String(form.get('project') ?? '').trim();
		const type = String(form.get('type') ?? 'task');
		const status = String(form.get('status') ?? 'todo');
		const priority = String(form.get('priority') ?? 'medium');
		const due = String(form.get('due') ?? '').trim();
		const estimateRaw = String(form.get('estimate') ?? '').trim();
		const tags = [
			...new Set(
				form
					.getAll('tags')
					.map((v) => normalizeTag(String(v)))
					.filter(Boolean)
			)
		];
		const assigneeIds = form
			.getAll('assignees')
			.map((v) => String(v))
			.filter(Boolean);
		const plannedFor = String(form.get('plannedFor') ?? '').trim();

		if (!title) return fail(400, { message: m.tasks_err_title_required() });
		if (!projectKey) return fail(400, { message: m.tasks_err_project_required() });
		if (!ALLOWED_TYPE.has(type)) return fail(400, { message: m.tasks_err_invalid_type({ type }) });
		if (!ALLOWED_STATUS.has(status))
			return fail(400, { message: m.tasks_err_invalid_status({ value: status }) });
		if (!ALLOWED_PRIORITY.has(priority))
			return fail(400, { message: m.tasks_err_invalid_priority({ value: priority }) });
		if (plannedFor && !/^\d{4}-\d{2}-\d{2}$/.test(plannedFor)) {
			return fail(400, { message: m.tasks_err_invalid_planned_date() });
		}

		const [p] = await db
			.select({ id: project.id, key: project.key, orgId: project.orgId })
			.from(project)
			.where(eq(project.key, projectKey))
			.limit(1);
		if (!p) return fail(400, { message: m.tasks_err_project_not_found({ key: projectKey }) });

		await assertCan(locals, 'project.tasks.create', { projectId: p.id });

		const dueDate = due ? new Date(due) : null;
		const estimate = estimateRaw ? Number(estimateRaw) : null;

		let created: Awaited<ReturnType<typeof createTask>>;
		try {
			created = await createTask({
				projectId: p.id,
				projectKey: p.key,
				title,
				description,
				status,
				priority,
				type,
				dueDate,
				estimateMinutes: estimate,
				tags,
				assigneeIds,
				createdBy: me.id,
				plannedForUserId: me.id,
				plannedFor: plannedFor || null
			});
		} catch (err) {
			console.error('task create failed', err);
			return fail(500, { message: m.tasks_err_failed_create() });
		}
		const { id: newId, displayId, assignedIds } = created;

		void recordAudit({
			type: 'task.create',
			actorId: me.id,
			targetType: 'task',
			targetId: newId,
			targetLabel: `${displayId} · ${title}`,
			orgId: p.orgId,
			meta: { projectId: p.id, taskRef: displayId }
		});

		// Attach any files dropped on the create modal. Best-effort: the task
		// already exists, so a failed attachment is warned, not fatal. Runs
		// before the webhook emit so `task.created` lists them.
		const { failed, attachments } = await attachFormFiles({
			files: form.getAll('attachments'),
			entityType: 'task',
			entityId: newId,
			orgId: null,
			projectId: p.id,
			uploadedBy: me.id
		});

		// Notify each newly-assigned user (notify() drops the actor itself, so
		// self-assignment is silent). Fire-and-forget: a failed notification
		// must never undo the create.
		const createdCtx = {
			id: newId,
			displayId,
			title,
			orgId: p.orgId,
			projectId: p.id,
			status,
			priority,
			type
		};
		emitWebhookEvent({
			type: 'task.created',
			orgId: p.orgId,
			projectId: p.id,
			actor: { id: me.id, name: me.name },
			assigneeIds: assignedIds,
			origin: url.origin,
			data: {
				task: taskSnapshot({ ...createdCtx, assigneeIds: assignedIds, dueDate }, url.origin),
				description,
				attachments: attachmentSnapshots(attachments, url.origin)
			}
		});
		void notifyTaskAssigned({
			task: createdCtx,
			assigneeIds: assignedIds,
			actor: { id: me.id, name: me.name },
			origin: url.origin
		}).catch((err) => console.error('task create notify failed', err));

		return { success: true, id: newId, displayId, attachmentsFailed: failed };
	},

	update: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.tasks_err_not_authenticated());

		const form = await request.formData();
		const displayId = String(form.get('id') ?? '').trim();
		if (!displayId) return fail(400, { message: m.tasks_err_missing_task_id() });

		const target = await resolveTaskByDisplayId(displayId);
		if (!target) return fail(404, { message: m.tasks_err_task_not_found() });

		// Editing is allowed if the user has project.tasks.edit.any on the
		// task's project, OR they're the creator and have edit.own.
		const projectId = target.projectId;
		const isCreator = target.createdBy === locals.user.id;
		const allowed =
			(await can(locals, 'project.tasks.edit.any', { projectId })) ||
			(isCreator && (await can(locals, 'project.tasks.edit.own', { projectId })));
		if (!allowed) error(403, m.tasks_err_cannot_edit());

		const patch: Record<string, unknown> = {};

		if (form.has('status')) {
			const v = String(form.get('status'));
			if (!ALLOWED_STATUS.has(v))
				return fail(400, { message: m.tasks_err_invalid_status({ value: v }) });
			patch.status = v;
		}
		if (form.has('priority')) {
			const v = String(form.get('priority'));
			if (!ALLOWED_PRIORITY.has(v))
				return fail(400, { message: m.tasks_err_invalid_priority({ value: v }) });
			patch.priority = v;
		}
		if (form.has('type')) {
			const v = String(form.get('type'));
			if (!ALLOWED_TYPE.has(v))
				return fail(400, { message: m.tasks_err_invalid_type({ type: v }) });
			patch.type = v;
		}
		if (form.has('title')) {
			const v = String(form.get('title')).trim();
			if (!v) return fail(400, { message: m.tasks_err_title_empty() });
			patch.title = v;
		}
		if (form.has('description')) {
			const v = String(form.get('description'));
			patch.description = v.trim() || null;
		}
		// Checklist: full array sent as JSON. Sanitized to {id,text,done}, empty
		// text dropped, capped so a runaway payload can't bloat the row.
		if (form.has('checklist')) {
			try {
				const raw = JSON.parse(String(form.get('checklist')));
				if (!Array.isArray(raw)) return fail(400, { message: m.tasks_err_invalid_checklist() });
				patch.checklist = raw
					.slice(0, 100)
					.map((it) => ({
						id: typeof it?.id === 'string' && it.id ? it.id : crypto.randomUUID(),
						text: String(it?.text ?? '')
							.trim()
							.slice(0, 500),
						done: !!it?.done
					}))
					.filter((it) => it.text.length > 0);
			} catch {
				return fail(400, { message: m.tasks_err_invalid_checklist() });
			}
		}
		if (form.has('due')) {
			const v = String(form.get('due')).trim();
			patch.dueDate = v ? new Date(v) : null;
		}
		if (form.has('estimate')) {
			const v = String(form.get('estimate')).trim();
			patch.estimateMinutes = v ? Number(v) : null;
		}
		// Tags: multi-value `tags`, or a single `__clear__` sentinel for empty.
		// Normalized + deduped server-side so free-form input stays consistent.
		if (form.has('tags')) {
			const all = form.getAll('tags').map((v) => String(v));
			if (all.length === 1 && all[0] === '__clear__') {
				patch.tags = [];
			} else {
				patch.tags = [...new Set(all.map(normalizeTag).filter(Boolean))];
			}
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

		// Prerequisites: multi-value `dependsOn` (task uuids), or `__clear__`.
		// Validated up front (same project, exists, no cycle) so a bad pick
		// fails with a readable 400 instead of a constraint error mid-transaction.
		let dependsUpdate: string[] | null = null;
		if (form.has('dependsOn')) {
			const all = form.getAll('dependsOn').map((v) => String(v));
			const wanted = all.length === 1 && all[0] === '__clear__' ? [] : all.filter(Boolean);
			try {
				dependsUpdate = await validateTaskDependencies(target, wanted);
			} catch (err) {
				if (err instanceof TaskDependencyError) return fail(400, { message: err.message });
				throw err;
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
		const priorDeps = await loadTaskDependencyIds(target.id);

		// Declared via a holder object so TypeScript's control-flow analysis
		// doesn't collapse the type to `null` based on the outer initializer
		// — mutations happen inside the transaction callback, which CFA
		// cannot follow.
		const assigneeOut: { next: string[] | null } = { next: null };
		const depsOut: { added: string[]; removed: string[] } | null = dependsUpdate
			? { added: [], removed: [] }
			: null;
		try {
			await db.transaction(async (tx) => {
				if (Object.keys(patch).length > 0) {
					await tx.update(task).set(patch).where(eq(task.id, target.id));
				}
				if (assigneesUpdate !== null) {
					await tx.delete(taskAssignee).where(eq(taskAssignee.taskId, target.id));
					if (assigneesUpdate.length > 0) {
						// Tasks are internal work: only platform (internal-org) users may
						// be assigned. Mirror the client-side `internalOnly` guard so a
						// crafted request can't persist an external/portal assignee.
						const valid = await tx
							.selectDistinct({ id: user.id })
							.from(user)
							.innerJoin(organizationMember, eq(organizationMember.userId, user.id))
							.innerJoin(organization, eq(organization.id, organizationMember.orgId))
							.where(and(inArray(user.id, assigneesUpdate), eq(organization.isInternal, true)));
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
				if (dependsUpdate !== null && depsOut) {
					const diff = await writeTaskDependencies(tx, target.id, dependsUpdate, priorDeps);
					depsOut.added = diff.added;
					depsOut.removed = diff.removed;
				}
			});
		} catch (err) {
			console.error('task update failed', err);
			return fail(500, { message: m.tasks_err_failed_save() });
		}

		// Mirror checklist completion back to the source ticket (items copied on
		// conversion share their id). Fire-and-forget — never undoes the task save.
		if (target.sourceTicketId && Array.isArray(patch.checklist)) {
			void syncTicketChecklistFromTask(
				target.sourceTicketId,
				patch.checklist as { id: string; done: boolean }[]
			).catch((err) => console.error('ticket checklist sync failed', err));
		}

		const me = locals.user;
		const taskCtx = {
			id: target.id,
			displayId,
			title: (patch.title as string | undefined) ?? target.title,
			orgId: target.projectOrgId,
			projectId,
			status: (patch.status as string | undefined) ?? target.status,
			priority: (patch.priority as string | undefined) ?? target.priority,
			type: (patch.type as string | undefined) ?? target.type
		};
		const currentAssignees = assigneeOut.next ?? [...priorAssignees];
		const currentDeps = dependsUpdate ?? priorDeps;
		const webhookActor = { id: me.id, name: me.name };

		// task.updated carries a from/to map of every changed scalar field.
		{
			const before: Record<string, unknown> = {
				status: target.status,
				priority: target.priority,
				type: target.type,
				title: target.title
			};
			const changes: Record<string, { from: unknown; to: unknown }> = {};
			for (const key of [
				'status',
				'priority',
				'type',
				'title',
				'description',
				'dueDate',
				'estimateMinutes',
				'tags'
			] as const) {
				if (!(key in patch)) continue;
				const to = patch[key];
				const from = key in before ? before[key] : undefined;
				if (from !== undefined && from === to) continue;
				changes[key] = {
					from: from ?? null,
					to: to instanceof Date ? to.toISOString() : (to ?? null)
				};
			}
			const nextAssignees = assigneeOut.next;
			if (nextAssignees !== null) {
				const added = nextAssignees.filter((id) => !priorAssignees.has(id));
				const removed = [...priorAssignees].filter((id) => !nextAssignees.includes(id));
				if (added.length || removed.length) {
					changes.assigneeIds = { from: [...priorAssignees], to: nextAssignees };
				}
				if (removed.length) {
					emitWebhookEvent({
						type: 'task.unassigned',
						orgId: target.projectOrgId,
						projectId,
						actor: webhookActor,
						assigneeIds: removed,
						origin: url.origin,
						data: {
							task: taskSnapshot(
								{ ...taskCtx, assigneeIds: currentAssignees, dependsOnIds: currentDeps },
								url.origin
							),
							removedAssigneeIds: removed
						}
					});
				}
			}
			if (depsOut && (depsOut.added.length || depsOut.removed.length)) {
				changes.dependsOnIds = { from: priorDeps, to: currentDeps };
			}
			if (Object.keys(changes).length > 0) {
				emitWebhookEvent({
					type: 'task.updated',
					orgId: target.projectOrgId,
					projectId,
					actor: webhookActor,
					assigneeIds: currentAssignees,
					origin: url.origin,
					data: {
						task: taskSnapshot(
							{ ...taskCtx, assigneeIds: currentAssignees, dependsOnIds: currentDeps },
							url.origin
						),
						changes
					}
				});
			}
		}

		// Notify users newly added to the task.
		const assigned = assigneeOut.next;
		if (assigned !== null) {
			const added = assigned.filter((id) => !priorAssignees.has(id));
			if (added.length > 0) {
				void notifyTaskAssigned({
					task: taskCtx,
					assigneeIds: added,
					actor: { id: me.id, name: me.name },
					origin: url.origin
				}).catch((err) => console.error('task assign notify failed', err));
			}
		}

		// Notify watchers on status change. "Watchers" = current assignees +
		// the creator. Use the post-update assignee set if it changed.
		if (typeof patch.status === 'string' && patch.status !== priorStatus) {
			void notifyTaskStatusChanged({
				task: taskCtx,
				creatorId: target.createdBy,
				assigneeIds: assigneeOut.next ?? [...priorAssignees],
				newStatus: patch.status,
				previousStatus: priorStatus,
				actor: { id: me.id, name: me.name },
				origin: url.origin
			}).catch((err) => console.error('task status notify failed', err));
		}

		// Activity feed: one row per meaningful change. Fire-and-forget — a
		// failed log must never undo the saved edit.
		const taskMeta = { taskRef: displayId, taskTitle: target.title };
		if (typeof patch.status === 'string' && patch.status !== priorStatus) {
			logActivityFF({
				projectId,
				taskId: target.id,
				actorId: me.id,
				type: 'task.status',
				meta: { ...taskMeta, from: priorStatus, to: patch.status }
			});
			void recordAudit({
				type: 'task.status',
				actorId: me.id,
				targetType: 'task',
				targetId: target.id,
				targetLabel: `${displayId} · ${target.title}`,
				orgId: target.projectOrgId,
				meta: { projectId, taskRef: displayId, from: priorStatus, to: patch.status }
			});
		}
		if (typeof patch.priority === 'string' && patch.priority !== target.priority) {
			logActivityFF({
				projectId,
				taskId: target.id,
				actorId: me.id,
				type: 'task.priority',
				meta: { ...taskMeta, from: target.priority, to: patch.priority }
			});
		}
		if (typeof patch.type === 'string' && patch.type !== target.type) {
			logActivityFF({
				projectId,
				taskId: target.id,
				actorId: me.id,
				type: 'task.type',
				meta: { ...taskMeta, from: target.type, to: patch.type }
			});
		}
		if (assigneeOut.next !== null) {
			const next = new Set(assigneeOut.next);
			const added = assigneeOut.next.filter((id) => !priorAssignees.has(id));
			const removed = [...priorAssignees].filter((id) => !next.has(id));
			if (added.length || removed.length) {
				logActivityFF({
					projectId,
					taskId: target.id,
					actorId: me.id,
					type: 'task.assignee',
					meta: { ...taskMeta, added, removed }
				});
			}
		}
		if (depsOut && (depsOut.added.length || depsOut.removed.length)) {
			const { added, removed } = depsOut;
			void taskRefsFor([...added, ...removed])
				.then((refs) =>
					logActivity(db, {
						projectId,
						taskId: target.id,
						actorId: me.id,
						type: 'task.dependency',
						meta: {
							...taskMeta,
							added: added.map((id) => refs[id] ?? id),
							removed: removed.map((id) => refs[id] ?? id)
						}
					})
				)
				.catch((err) => console.error('logActivity failed', err));
		}

		return { success: true };
	},

	commentAdd: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.tasks_err_not_authenticated());
		const me = locals.user;

		const form = await request.formData();
		const displayId = String(form.get('id') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const stagedFiles = form.getAll('attachments');
		if (!displayId) return fail(400, { message: m.tasks_err_missing_task_id() });
		// Allow a files-only comment (attachment with no text).
		if (!body && !stagedFiles.some((f) => f instanceof File && f.size > 0)) {
			return fail(400, { message: m.tasks_err_comment_empty() });
		}

		const target = await resolveTaskByDisplayId(displayId);
		if (!target) return fail(404, { message: m.tasks_err_task_not_found() });

		await assertCan(locals, 'project.tasks.comment', { projectId: target.projectId });

		const commentId = crypto.randomUUID();
		try {
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
				authorId: me.id,
				body: body || '(attachment)',
				kind: 'comment'
			});
			// Bump the task's updatedAt so the activity flag is accurate.
			await db.update(task).set({ updatedAt: new Date() }).where(eq(task.id, target.id));
			// Attach any files staged on the composer to the new comment.
			await attachFormFiles({
				files: stagedFiles,
				entityType: 'message',
				entityId: commentId,
				orgId: null,
				projectId: target.projectId,
				uploadedBy: me.id
			});
		} catch (err) {
			console.error('comment add failed', err);
			return fail(500, { message: m.tasks_err_failed_comment() });
		}

		// Notify assignees + creator + anyone else who commented on the task.
		// Prior commenters are read from the activity feed (the single comment
		// store) and let us avoid notifying drive-by readers.
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
			actor: { id: me.id, name: me.name },
			origin: url.origin
		}).catch((err) => console.error('task comment notify failed', err));

		void recordAudit({
			type: 'task.comment',
			actorId: me.id,
			targetType: 'task',
			targetId: target.id,
			targetLabel: `${displayId} · ${target.title}`,
			orgId: target.projectOrgId,
			meta: { projectId: target.projectId, taskRef: displayId, body }
		});

		return { success: true };
	},

	planSet: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.tasks_err_not_authenticated());
		const me = locals.user;

		const form = await request.formData();
		const displayId = String(form.get('id') ?? '').trim();
		const plannedFor = String(form.get('plannedFor') ?? '').trim();
		const mode = String(form.get('mode') ?? '').trim();
		if (!displayId) return fail(400, { message: m.tasks_err_missing_task_id() });

		const target = await resolveTaskByDisplayId(displayId);
		if (!target) return fail(404, { message: m.tasks_err_task_not_found() });

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
					return fail(400, { message: m.tasks_err_invalid_date() });
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
			return fail(500, { message: m.tasks_err_failed_plan() });
		}

		return { success: true };
	},

	timeLogAdd: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.tasks_err_not_authenticated());
		const me = locals.user;

		const form = await request.formData();
		const displayId = String(form.get('id') ?? '').trim();
		const hours = Number(form.get('hours') ?? 0);
		const minutes = Number(form.get('minutes') ?? 0);
		const date = String(form.get('date') ?? '').trim();
		const note = String(form.get('note') ?? '').trim() || null;

		if (!displayId) return fail(400, { message: m.tasks_err_missing_task_id() });
		if (!date) return fail(400, { message: m.tasks_err_missing_date() });

		const total = Math.round(hours * 60) + Math.round(minutes);
		if (!Number.isFinite(total) || total <= 0) {
			return fail(400, { message: m.tasks_err_time_positive() });
		}

		const target = await resolveTaskByDisplayId(displayId);
		if (!target) return fail(404, { message: m.tasks_err_task_not_found() });

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
			return fail(500, { message: m.tasks_err_failed_log_time() });
		}

		logActivityFF({
			projectId: target.projectId,
			taskId: target.id,
			actorId: me.id,
			type: 'time.logged',
			meta: { taskRef: displayId, taskTitle: target.title, minutes: total, note, loggedAt: date }
		});
		emitWebhookEvent({
			type: 'task.time_logged',
			orgId: target.projectOrgId,
			projectId: target.projectId,
			actor: { id: me.id, name: me.name },
			assigneeIds: [me.id],
			data: {
				task: taskSnapshot({ ...target, displayId }, null),
				timeLog: { minutes: total, note, loggedAt: date, userId: me.id }
			}
		});

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.tasks_err_not_authenticated());

		const form = await request.formData();
		const displayId = String(form.get('id') ?? '').trim();
		if (!displayId) return fail(400, { message: m.tasks_err_missing_task_id() });

		const target = await resolveTaskByDisplayId(displayId);
		if (!target) return fail(404, { message: m.tasks_err_task_not_found() });

		await assertCan(locals, 'project.tasks.delete.any', { projectId: target.projectId });

		try {
			await db.update(task).set({ deletedAt: new Date() }).where(eq(task.id, target.id));
			// The task's read paths are now closed, so its attachments are already
			// unreachable; remove their files (task-level + per-comment) to reclaim disk.
			await deleteAttachmentsFor('task', target.id);
			const comments = await db
				.select({ id: message.id })
				.from(message)
				.innerJoin(thread, eq(thread.id, message.threadId))
				.where(and(eq(thread.subjectType, 'task'), eq(thread.subjectId, target.id)));
			for (const c of comments) await deleteAttachmentsFor('message', c.id);
		} catch (err) {
			console.error('task delete failed', err);
			return fail(500, { message: m.tasks_err_failed_delete() });
		}

		logActivityFF({
			projectId: target.projectId,
			taskId: target.id,
			actorId: locals.user.id,
			type: 'task.deleted',
			meta: { taskRef: displayId, taskTitle: target.title }
		});
		void recordAudit({
			type: 'task.delete',
			actorId: locals.user.id,
			targetType: 'task',
			targetId: target.id,
			targetLabel: `${displayId} · ${target.title}`,
			orgId: target.projectOrgId,
			meta: { projectId: target.projectId, taskRef: displayId }
		});
		emitWebhookEvent({
			type: 'task.deleted',
			orgId: target.projectOrgId,
			projectId: target.projectId,
			actor: { id: locals.user.id, name: locals.user.name },
			data: { task: taskSnapshot({ ...target, displayId }, null) }
		});

		return { success: true };
	}
};
