import { error, json } from '@sveltejs/kit';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization, organizationMember, project } from '$lib/server/db/app.schema';
import { user } from '$lib/server/db/auth.schema';
import {
	ALLOWED_TASK_PRIORITY,
	ALLOWED_TASK_STATUS,
	ALLOWED_TASK_TYPE,
	createTasks,
	type BulkTaskInput
} from '$lib/server/tasks';
import { normalizeTag } from '$lib/utils/label-meta';
import { assertCan } from '$lib/server/permissions';
import { recordAudit } from '$lib/server/audit';
import { notify } from '$lib/server/notify';
import { m } from '$lib/paraglide/messages';
import type { RequestHandler } from './$types';

// The project is fixed by the URL — a `project`/`projectId` key inside an
// item is deliberately ignored so exported or hand-written files stay
// portable across projects.
const MAX_TASKS = 500;
const MAX_CHECKLIST = 100;
const MAX_TAGS = 20;

type RawItem = Record<string, unknown>;

// Validate one JSON item into a BulkTaskInput, or explain why it can't be.
// `assignees` stays raw here (email or user id); ids are resolved by the
// caller with one query over the whole batch.
function parseItem(
	raw: unknown
):
	| { ok: true; task: Omit<BulkTaskInput, 'assigneeIds'>; assignees: string[] }
	| { ok: false; message: string } {
	if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
		return { ok: false, message: m.import_err_item_not_object() };
	}
	const it = raw as RawItem;

	const title = typeof it.title === 'string' ? it.title.trim() : '';
	if (!title) return { ok: false, message: m.tasks_err_title_required() };

	const type = typeof it.type === 'string' ? it.type : 'task';
	if (!ALLOWED_TASK_TYPE.has(type))
		return { ok: false, message: m.tasks_err_invalid_type({ type }) };
	const status = typeof it.status === 'string' ? it.status : 'todo';
	if (!ALLOWED_TASK_STATUS.has(status))
		return { ok: false, message: m.tasks_err_invalid_status({ value: status }) };
	// Default matches the single-task create action ('medium'), not the DB
	// column default ('none').
	const priority = typeof it.priority === 'string' ? it.priority : 'medium';
	if (!ALLOWED_TASK_PRIORITY.has(priority))
		return { ok: false, message: m.tasks_err_invalid_priority({ value: priority }) };

	let dueDate: Date | null = null;
	if (it.dueDate != null && it.dueDate !== '') {
		if (typeof it.dueDate !== 'string') return { ok: false, message: m.tasks_err_invalid_date() };
		dueDate = new Date(it.dueDate);
		if (Number.isNaN(dueDate.getTime())) return { ok: false, message: m.tasks_err_invalid_date() };
	}

	let estimateMinutes: number | null = null;
	if (it.estimateMinutes != null && it.estimateMinutes !== '') {
		const n = Number(it.estimateMinutes);
		if (!Number.isFinite(n) || n <= 0)
			return { ok: false, message: m.import_err_invalid_estimate() };
		estimateMinutes = Math.round(n);
	}

	let tags: string[] = [];
	if (it.tags != null) {
		if (!Array.isArray(it.tags)) return { ok: false, message: m.import_err_invalid_tags() };
		tags = [...new Set(it.tags.map((t) => normalizeTag(String(t))).filter(Boolean))].slice(
			0,
			MAX_TAGS
		);
	}

	let checklist: { id: string; text: string; done: boolean }[] = [];
	if (it.checklist != null) {
		if (!Array.isArray(it.checklist))
			return { ok: false, message: m.tasks_err_invalid_checklist() };
		checklist = it.checklist
			.slice(0, MAX_CHECKLIST)
			.map((c) => {
				const item = (c ?? {}) as RawItem;
				return {
					id: crypto.randomUUID(),
					text: String(item.text ?? '')
						.trim()
						.slice(0, 500),
					done: !!item.done
				};
			})
			.filter((c) => c.text.length > 0);
	}

	let assignees: string[] = [];
	if (it.assignees != null) {
		if (!Array.isArray(it.assignees))
			return { ok: false, message: m.import_err_invalid_assignees() };
		assignees = it.assignees.map((a) => String(a).trim()).filter(Boolean);
	}

	const description =
		typeof it.description === 'string' && it.description.trim() ? it.description.trim() : null;

	return {
		ok: true,
		task: { title, description, status, priority, type, dueDate, estimateMinutes, tags, checklist },
		assignees
	};
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

	await assertCan(locals, 'project.tasks.create', { projectId: p.id });

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
	const valid: { index: number; task: Omit<BulkTaskInput, 'assigneeIds'>; assignees: string[] }[] =
		[];
	tasksRaw.forEach((raw, index) => {
		const parsed = parseItem(raw);
		if (parsed.ok) valid.push({ index, task: parsed.task, assignees: parsed.assignees });
		else failed.push({ index, message: parsed.message });
	});

	if (valid.length === 0) return json({ created: [], failed });

	// Assignees may be given as user ids or emails; resolve both in one query,
	// restricted to assignable (internal-org) users — the same rule the assign
	// dropdown applies.
	const refs = [...new Set(valid.flatMap((v) => v.assignees))];
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

	// The importer is only the default assignee when an item lists nobody.
	// An item that names assignees but matches none of them is rejected —
	// silently assigning the importer instead would misattribute the work.
	const toCreate: { index: number; task: BulkTaskInput }[] = [];
	for (const v of valid) {
		const resolved = [
			...new Set(v.assignees.map((a) => idByRef.get(a)).filter((id): id is string => Boolean(id)))
		];
		if (v.assignees.length > 0 && resolved.length === 0) {
			failed.push({
				index: v.index,
				message: m.import_err_no_valid_assignees({ list: v.assignees.join(', ') })
			});
			continue;
		}
		toCreate.push({ index: v.index, task: { ...v.task, assigneeIds: resolved } });
	}
	failed.sort((a, b) => a.index - b.index);

	if (toCreate.length === 0) return json({ created: [], failed });

	let created: Awaited<ReturnType<typeof createTasks>>;
	try {
		created = await createTasks({
			projectId: p.id,
			projectKey: p.key,
			createdBy: me.id,
			tasks: toCreate.map((t) => t.task)
		});
	} catch (err) {
		console.error('task import failed', err);
		return json({ message: m.import_err_failed() }, { status: 500 });
	}

	// One audit entry for the whole import — not one per task.
	void recordAudit({
		type: 'task.import',
		actorId: me.id,
		targetType: 'project',
		targetId: p.id,
		targetLabel: `${p.key} · ${p.name}`,
		orgId: p.orgId,
		meta: { count: created.length, failed: failed.length }
	});

	// Likewise a single notification per distinct assignee, instead of one per
	// imported task. notify() drops the importer from the list itself.
	const assignedIds = [...new Set(created.flatMap((c) => c.assignedIds))];
	void notify({
		kind: 'taskAssigned',
		recipients: assignedIds,
		actorId: me.id,
		orgId: p.orgId,
		render: (locale) => ({
			title: m.notify_tasks_imported({ n: created.length, project: p.name }, { locale })
		}),
		url: `/projects/${p.id}`,
		entity: { type: 'project', id: p.id },
		baseUrl: url.origin
	}).catch((err) => console.error('task import notify failed', err));

	return json({
		created: created.map((c, i) => ({
			index: toCreate[i].index,
			id: c.id,
			displayId: c.displayId
		})),
		failed
	});
};
