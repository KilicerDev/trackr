import { error, json } from '@sveltejs/kit';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	organization,
	organizationMember,
	project,
	task,
	taskAssignee,
	taskPlanning
} from '$lib/server/db/app.schema';
import { user } from '$lib/server/db/auth.schema';
import {
	ALLOWED_TASK_PRIORITY,
	ALLOWED_TASK_STATUS,
	ALLOWED_TASK_TYPE,
	createTasks,
	type BulkTaskInput
} from '$lib/server/tasks';
import { syncTicketChecklistFromTask } from '$lib/server/tickets';
import { logActivity } from '$lib/server/activity';
import { normalizeTag } from '$lib/utils/label-meta';
import { assertCan, can } from '$lib/server/permissions';
import { recordAudit } from '$lib/server/audit';
import { notify } from '$lib/server/notify';
import { m } from '$lib/paraglide/messages';
import type { RequestHandler } from './$types';

// Upsert semantics: an item WITHOUT an `id` creates a task (the original
// import), an item WITH an `id` updates that task — only the fields present in
// the item are touched, so a trimmed file is safe. Unknown ids are rejected
// per-row instead of silently creating, which catches a file uploaded to the
// wrong project. The project is fixed by the URL — a `project`/`projectId` key
// inside an item is deliberately ignored so exported or hand-written files
// stay portable across projects.
const MAX_TASKS = 500;
const MAX_CHECKLIST = 100;
const MAX_TAGS = 20;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

type RawItem = Record<string, unknown>;

// Field values parsed out of one JSON item. `undefined` means "not present in
// the file": creates fill defaults, updates leave the stored value untouched.
type ParsedFields = {
	title?: string;
	description?: string | null;
	status?: string;
	priority?: string;
	type?: string;
	dueDate?: Date | null;
	estimateMinutes?: number | null;
	tags?: string[];
	checklist?: { text: string; done: boolean }[];
	/** Plan into the importer's week (YYYY-MM-DD); null removes the plan. */
	plannedFor?: string | null;
};

// Validate one JSON item, or explain why it can't be. `assignees` stays raw
// here (email or user id, null when the key is absent); ids are resolved by
// the caller with one query over the whole batch.
function parseItem(
	raw: unknown
):
	| { ok: true; id: string | null; fields: ParsedFields; assignees: string[] | null }
	| { ok: false; message: string } {
	if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
		return { ok: false, message: m.import_err_item_not_object() };
	}
	const it = raw as RawItem;
	const fields: ParsedFields = {};

	// Accept numbers too — a hand-edited id may lose its quotes; a value that
	// matches no task in this project still fails that row later.
	const id = it.id != null && String(it.id).trim() ? String(it.id).trim() : null;

	if (it.title !== undefined) {
		const title = typeof it.title === 'string' ? it.title.trim() : '';
		if (!title) return { ok: false, message: m.tasks_err_title_required() };
		fields.title = title;
	} else if (!id) {
		return { ok: false, message: m.tasks_err_title_required() };
	}

	if (it.type !== undefined) {
		if (typeof it.type !== 'string' || !ALLOWED_TASK_TYPE.has(it.type))
			return { ok: false, message: m.tasks_err_invalid_type({ type: String(it.type) }) };
		fields.type = it.type;
	}
	if (it.status !== undefined) {
		if (typeof it.status !== 'string' || !ALLOWED_TASK_STATUS.has(it.status))
			return { ok: false, message: m.tasks_err_invalid_status({ value: String(it.status) }) };
		fields.status = it.status;
	}
	if (it.priority !== undefined) {
		if (typeof it.priority !== 'string' || !ALLOWED_TASK_PRIORITY.has(it.priority))
			return { ok: false, message: m.tasks_err_invalid_priority({ value: String(it.priority) }) };
		fields.priority = it.priority;
	}

	if (it.dueDate !== undefined) {
		if (it.dueDate == null || it.dueDate === '') {
			fields.dueDate = null;
		} else {
			if (typeof it.dueDate !== 'string') return { ok: false, message: m.tasks_err_invalid_date() };
			const d = new Date(it.dueDate);
			if (Number.isNaN(d.getTime())) return { ok: false, message: m.tasks_err_invalid_date() };
			fields.dueDate = d;
		}
	}

	// plannedFor is the importer's own week plan (per-user, not a task field):
	// "YYYY-MM-DD" plans it, null/"" removes the importer's plan for it.
	if (it.plannedFor !== undefined) {
		if (it.plannedFor == null || it.plannedFor === '') {
			fields.plannedFor = null;
		} else {
			if (typeof it.plannedFor !== 'string' || !DATE_ONLY.test(it.plannedFor))
				return { ok: false, message: m.import_err_invalid_planned_for() };
			const d = new Date(`${it.plannedFor}T00:00:00Z`);
			if (Number.isNaN(d.getTime()))
				return { ok: false, message: m.import_err_invalid_planned_for() };
			fields.plannedFor = it.plannedFor;
		}
	}

	if (it.estimateMinutes !== undefined) {
		if (it.estimateMinutes == null || it.estimateMinutes === '') {
			fields.estimateMinutes = null;
		} else {
			const n = Number(it.estimateMinutes);
			if (!Number.isFinite(n) || n <= 0)
				return { ok: false, message: m.import_err_invalid_estimate() };
			fields.estimateMinutes = Math.round(n);
		}
	}

	if (it.tags !== undefined) {
		if (!Array.isArray(it.tags)) return { ok: false, message: m.import_err_invalid_tags() };
		fields.tags = [...new Set(it.tags.map((t) => normalizeTag(String(t))).filter(Boolean))].slice(
			0,
			MAX_TAGS
		);
	}

	if (it.checklist !== undefined) {
		if (!Array.isArray(it.checklist))
			return { ok: false, message: m.tasks_err_invalid_checklist() };
		fields.checklist = it.checklist
			.slice(0, MAX_CHECKLIST)
			.map((c) => {
				const item = (c ?? {}) as RawItem;
				return {
					text: String(item.text ?? '')
						.trim()
						.slice(0, 500),
					done: !!item.done
				};
			})
			.filter((c) => c.text.length > 0);
	}

	let assignees: string[] | null = null;
	if (it.assignees !== undefined) {
		if (!Array.isArray(it.assignees))
			return { ok: false, message: m.import_err_invalid_assignees() };
		assignees = it.assignees.map((a) => String(a).trim()).filter(Boolean);
	}

	if (it.description !== undefined) {
		fields.description =
			typeof it.description === 'string' && it.description.trim() ? it.description.trim() : null;
	}

	return { ok: true, id, fields, assignees };
}

export const POST: RequestHandler = async ({ request, params, locals, url }) => {
	if (!locals.user) throw error(401, m.tasks_err_not_authenticated());
	const me = locals.user;

	const [p] = await db
		.select({ id: project.id, key: project.key, name: project.name, orgId: project.orgId })
		.from(project)
		.where(eq(project.id, params.id))
		.limit(1);
	if (!p) throw error(404, m.projects_not_found());

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: m.import_err_invalid_json() }, { status: 400 });
	}
	const tasksRaw = (body as { tasks?: unknown } | null)?.tasks;
	if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
		return json({ message: m.import_err_tasks_required() }, { status: 400 });
	}
	if (tasksRaw.length > MAX_TASKS) {
		return json({ message: m.import_err_too_many({ max: MAX_TASKS }) }, { status: 400 });
	}

	// Validate everything first; invalid items are reported per-index and never
	// block the valid ones (partial success, mirroring the notes bulk-create UX).
	const failed: { index: number; message: string }[] = [];
	type ValidItem = {
		index: number;
		id: string | null;
		fields: ParsedFields;
		assignees: string[] | null;
	};
	const valid: ValidItem[] = [];
	const seenIds = new Set<string>();
	tasksRaw.forEach((raw, index) => {
		const parsed = parseItem(raw);
		if (!parsed.ok) {
			failed.push({ index, message: parsed.message });
			return;
		}
		if (parsed.id) {
			if (seenIds.has(parsed.id)) {
				failed.push({ index, message: m.import_err_duplicate_id({ id: parsed.id }) });
				return;
			}
			seenIds.add(parsed.id);
		}
		valid.push({ index, id: parsed.id, fields: parsed.fields, assignees: parsed.assignees });
	});

	const createItems = valid.filter((v) => v.id === null);
	let updateItems = valid.filter((v) => v.id !== null);

	// Creates keep the original grant; a purely-updating file only needs edit
	// rights, so someone without create access can still apply updates.
	if (createItems.length > 0) {
		await assertCan(locals, 'project.tasks.create', { projectId: p.id });
	} else if (!(await can(locals, 'project.tasks.read', { projectId: p.id }))) {
		// No-access answers 404 (not 403) so the endpoint doesn't leak project ids.
		throw error(404, m.projects_not_found());
	}

	// Resolve update targets in one project-scoped query; ids from another
	// project (or deleted/archived tasks) fail their row.
	type Target = {
		id: string;
		number: number;
		title: string;
		status: string;
		createdBy: string | null;
		sourceTicketId: string | null;
		checklist: { id: string; text: string; done: boolean }[];
	};
	const targetById = new Map<string, Target>();
	if (updateItems.length > 0) {
		const rows = await db
			.select({
				id: task.id,
				number: task.number,
				title: task.title,
				status: task.status,
				createdBy: task.createdBy,
				sourceTicketId: task.sourceTicketId,
				checklist: task.checklist
			})
			.from(task)
			.where(
				and(
					eq(task.projectId, p.id),
					inArray(
						task.id,
						updateItems.map((v) => v.id as string)
					),
					isNull(task.archivedAt),
					isNull(task.deletedAt)
				)
			);
		for (const r of rows) targetById.set(r.id, r);

		const canEditAny = await can(locals, 'project.tasks.edit.any', { projectId: p.id });
		const canEditOwn = canEditAny
			? true
			: await can(locals, 'project.tasks.edit.own', { projectId: p.id });
		updateItems = updateItems.filter((v) => {
			const target = targetById.get(v.id as string);
			if (!target) {
				failed.push({ index: v.index, message: m.import_err_unknown_id({ id: v.id as string }) });
				return false;
			}
			if (!(canEditAny || (canEditOwn && target.createdBy === me.id))) {
				failed.push({ index: v.index, message: m.tasks_err_cannot_edit() });
				return false;
			}
			return true;
		});
	}

	// Assignees may be given as user ids or emails; resolve both in one query,
	// restricted to assignable (internal-org) users — the same rule the assign
	// dropdown applies.
	const refs = [...new Set([...createItems, ...updateItems].flatMap((v) => v.assignees ?? []))];
	const idByRef = new Map<string, string>();
	if (refs.length > 0) {
		const users = await db
			.selectDistinct({ id: user.id, email: user.email })
			.from(user)
			.innerJoin(organizationMember, eq(organizationMember.userId, user.id))
			.innerJoin(organization, eq(organization.id, organizationMember.orgId))
			.where(
				and(
					or(inArray(user.id, refs), inArray(user.email, refs)),
					eq(organization.isInternal, true)
				)
			);
		for (const u of users) {
			idByRef.set(u.id, u.id);
			if (u.email) idByRef.set(u.email, u.id);
		}
	}

	// An item that names assignees but matches none of them is rejected —
	// silently assigning someone else instead would misattribute the work.
	// (For creates, the importer is the default assignee only when an item
	// lists nobody at all.)
	function resolveAssignees(v: ValidItem): string[] | null | undefined {
		if (v.assignees === null) return null;
		if (v.assignees.length === 0) return [];
		const resolved = [
			...new Set(v.assignees.map((a) => idByRef.get(a)).filter((id): id is string => Boolean(id)))
		];
		if (resolved.length === 0) {
			failed.push({
				index: v.index,
				message: m.import_err_no_valid_assignees({ list: v.assignees.join(', ') })
			});
			return undefined;
		}
		return resolved;
	}

	// ---- creates -------------------------------------------------------------
	const toCreate: { index: number; task: BulkTaskInput }[] = [];
	for (const v of createItems) {
		const resolved = resolveAssignees(v);
		if (resolved === undefined) continue;
		const f = v.fields;
		toCreate.push({
			index: v.index,
			task: {
				title: f.title as string,
				description: f.description ?? null,
				status: f.status ?? 'todo',
				// Default matches the single-task create action ('medium'), not the
				// DB column default ('none').
				priority: f.priority ?? 'medium',
				type: f.type ?? 'task',
				dueDate: f.dueDate ?? null,
				estimateMinutes: f.estimateMinutes ?? null,
				tags: f.tags ?? [],
				checklist: (f.checklist ?? []).map((c) => ({ ...c, id: crypto.randomUUID() })),
				assigneeIds: resolved ?? [],
				plannedFor: f.plannedFor ?? null
			}
		});
	}

	// ---- updates -------------------------------------------------------------
	type UpdatePlan = {
		index: number;
		target: Target;
		patch: Record<string, unknown>;
		assigneeIds: string[] | null;
		/** undefined = key absent (leave the plan alone); null = remove. */
		plannedFor: string | null | undefined;
	};
	const toUpdate: UpdatePlan[] = [];
	for (const v of updateItems) {
		const resolved = resolveAssignees(v);
		if (resolved === undefined) continue;
		const target = targetById.get(v.id as string) as Target;
		const f = v.fields;
		const patch: Record<string, unknown> = {};
		if (f.title !== undefined) patch.title = f.title;
		if (f.description !== undefined) patch.description = f.description;
		if (f.status !== undefined) patch.status = f.status;
		if (f.priority !== undefined) patch.priority = f.priority;
		if (f.type !== undefined) patch.type = f.type;
		if (f.dueDate !== undefined) patch.dueDate = f.dueDate;
		if (f.estimateMinutes !== undefined) patch.estimateMinutes = f.estimateMinutes;
		if (f.tags !== undefined) patch.tags = f.tags;
		if (f.checklist !== undefined) {
			// The upload replaces the checklist, but existing item ids are kept for
			// unchanged texts so done-state links (e.g. source-ticket sync) survive.
			const remaining = [...target.checklist];
			patch.checklist = f.checklist.map((c) => {
				const at = remaining.findIndex((prior) => prior.text === c.text);
				const id = at >= 0 ? remaining.splice(at, 1)[0].id : crypto.randomUUID();
				return { id, text: c.text, done: c.done };
			});
		}
		toUpdate.push({
			index: v.index,
			target,
			patch,
			assigneeIds: resolved,
			plannedFor: f.plannedFor
		});
	}
	failed.sort((a, b) => a.index - b.index);

	if (toCreate.length === 0 && toUpdate.length === 0) {
		return json({ created: [], updated: [], failed });
	}

	// Prior assignees of every updated task, in one query — needed to notify
	// only the newly added users afterwards.
	const priorAssigneesByTask = new Map<string, Set<string>>();
	if (toUpdate.length > 0) {
		const rows = await db
			.select({ taskId: taskAssignee.taskId, userId: taskAssignee.userId })
			.from(taskAssignee)
			.where(
				inArray(
					taskAssignee.taskId,
					toUpdate.map((u) => u.target.id)
				)
			);
		for (const r of rows) {
			const set = priorAssigneesByTask.get(r.taskId) ?? new Set<string>();
			set.add(r.userId);
			priorAssigneesByTask.set(r.taskId, set);
		}
	}

	let created: Awaited<ReturnType<typeof createTasks>> = [];
	try {
		if (toCreate.length > 0) {
			created = await createTasks({
				projectId: p.id,
				projectKey: p.key,
				createdBy: me.id,
				plannedForUserId: me.id,
				channel: 'import',
				tasks: toCreate.map((t) => t.task)
			});
		}

		// All updates in one transaction: validation already happened, so a
		// failure here is unexpected — rolling back everything keeps the file
		// and the project consistent for a clean re-upload.
		if (toUpdate.length > 0) {
			await db.transaction(async (tx) => {
				for (const u of toUpdate) {
					if (Object.keys(u.patch).length > 0) {
						await tx.update(task).set(u.patch).where(eq(task.id, u.target.id));
					}
					if (u.plannedFor !== undefined) {
						if (u.plannedFor) {
							await tx
								.insert(taskPlanning)
								.values({ taskId: u.target.id, userId: me.id, plannedFor: u.plannedFor })
								.onConflictDoUpdate({
									target: [taskPlanning.taskId, taskPlanning.userId],
									set: { plannedFor: u.plannedFor, updatedAt: new Date() }
								});
						} else {
							await tx
								.delete(taskPlanning)
								.where(and(eq(taskPlanning.taskId, u.target.id), eq(taskPlanning.userId, me.id)));
						}
					}
					if (u.assigneeIds !== null) {
						await tx.delete(taskAssignee).where(eq(taskAssignee.taskId, u.target.id));
						if (u.assigneeIds.length > 0) {
							await tx
								.insert(taskAssignee)
								.values(u.assigneeIds.map((userId) => ({ taskId: u.target.id, userId })));
						}
					}
					if (u.patch.status !== undefined && u.patch.status !== u.target.status) {
						await logActivity(tx, {
							projectId: p.id,
							taskId: u.target.id,
							actorId: me.id,
							type: 'task.status',
							meta: {
								taskRef: `${p.key}-${u.target.number}`,
								taskTitle: (u.patch.title as string) ?? u.target.title,
								from: u.target.status,
								to: u.patch.status
							}
						});
					}
				}
			});
		}
	} catch (err) {
		console.error('task import failed', err);
		return json({ message: m.import_err_failed() }, { status: 500 });
	}

	// Mirror checklist completion back to source tickets (items copied on
	// conversion share their id). Fire-and-forget — never undoes the save.
	for (const u of toUpdate) {
		if (u.target.sourceTicketId && Array.isArray(u.patch.checklist)) {
			void syncTicketChecklistFromTask(
				u.target.sourceTicketId,
				u.patch.checklist as { id: string; done: boolean }[]
			).catch((err) => console.error('ticket checklist sync failed', err));
		}
	}

	// One audit entry for the whole upload — not one per task.
	void recordAudit({
		type: 'task.import',
		actorId: me.id,
		targetType: 'project',
		targetId: p.id,
		targetLabel: `${p.key} · ${p.name}`,
		orgId: p.orgId,
		meta: { count: created.length, updated: toUpdate.length, failed: failed.length }
	});

	// Likewise a single notification per distinct assignee, instead of one per
	// task — and no per-task status-change notifications for a bulk upload.
	// notify() drops the importer from the list itself.
	const createdAssignees = [...new Set(created.flatMap((c) => c.assignedIds))];
	if (createdAssignees.length > 0) {
		void notify({
			kind: 'taskAssigned',
			recipients: createdAssignees,
			actorId: me.id,
			orgId: p.orgId,
			render: (locale) => ({
				title: m.notify_tasks_imported({ n: created.length, project: p.name }, { locale })
			}),
			url: `/projects/${p.id}`,
			entity: { type: 'project', id: p.id },
			baseUrl: url.origin
		}).catch((err) => console.error('task import notify failed', err));
	}
	const newlyAssigned = [
		...new Set(
			toUpdate.flatMap((u) => {
				if (u.assigneeIds === null) return [];
				const prior = priorAssigneesByTask.get(u.target.id) ?? new Set<string>();
				return u.assigneeIds.filter((id) => !prior.has(id));
			})
		)
	];
	if (newlyAssigned.length > 0) {
		void notify({
			kind: 'taskAssigned',
			recipients: newlyAssigned,
			actorId: me.id,
			orgId: p.orgId,
			render: (locale) => ({
				title: m.notify_tasks_import_updated({ n: toUpdate.length, project: p.name }, { locale })
			}),
			url: `/projects/${p.id}`,
			entity: { type: 'project', id: p.id },
			baseUrl: url.origin
		}).catch((err) => console.error('task import notify failed', err));
	}

	return json({
		created: created.map((c, i) => ({
			index: toCreate[i].index,
			id: c.id,
			displayId: c.displayId
		})),
		updated: toUpdate.map((u) => ({
			index: u.index,
			id: u.target.id,
			displayId: `${p.key}-${u.target.number}`
		})),
		failed
	});
};
