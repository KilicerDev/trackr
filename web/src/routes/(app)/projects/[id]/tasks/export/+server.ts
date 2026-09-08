import { error } from '@sveltejs/kit';
import { asc, and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	project,
	task,
	taskAssignee,
	taskDependency,
	taskPlanning
} from '$lib/server/db/app.schema';
import { user } from '$lib/server/db/auth.schema';
import { can } from '$lib/server/permissions';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
import type { RequestHandler } from './$types';

// Download the project's live tasks as a commented .jsonc file in the exact
// shape the import endpoint accepts, with each task's `id` included so the
// file can be edited (e.g. by an LLM) and re-uploaded to update the tasks in
// place. The header comment carries the round-trip rules, so the instructions
// travel with the file.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, m.tasks_err_not_authenticated());

	const [p] = await db
		.select({ id: project.id, key: project.key, name: project.name, orgId: project.orgId })
		.from(project)
		.where(eq(project.id, params.id))
		.limit(1);
	if (!p) throw error(404, m.projects_not_found());
	// Unknown ids and no-access both answer 404 so the endpoint doesn't leak
	// which project ids exist — same pattern as the task detail API.
	if (!(await can(locals, 'project.tasks.read', { projectId: p.id }))) {
		throw error(404, m.projects_not_found());
	}

	const rows = await db
		.select({
			id: task.id,
			number: task.number,
			title: task.title,
			description: task.description,
			status: task.status,
			priority: task.priority,
			type: task.type,
			dueDate: task.dueDate,
			estimateMinutes: task.estimateMinutes,
			tags: task.tags,
			checklist: task.checklist
		})
		.from(task)
		.where(and(eq(task.projectId, p.id), isNull(task.archivedAt), isNull(task.deletedAt)))
		.orderBy(asc(task.number));

	// Assignees as emails (the import format's preferred reference); users
	// without an email fall back to their id, which the import also accepts.
	const taskIds = rows.map((t) => t.id);
	const assigneeRows = taskIds.length
		? await db
				.select({ taskId: taskAssignee.taskId, userId: taskAssignee.userId, email: user.email })
				.from(taskAssignee)
				.innerJoin(user, eq(user.id, taskAssignee.userId))
				.where(inArray(taskAssignee.taskId, taskIds))
		: [];
	const assigneesByTask = new Map<string, string[]>();
	for (const r of assigneeRows) {
		const list = assigneesByTask.get(r.taskId) ?? [];
		list.push(r.email || r.userId);
		assigneesByTask.set(r.taskId, list);
	}

	// The exporter's own week plan per task (planning is per user, so this is
	// what a re-upload by the same person would restore).
	const planRows = taskIds.length
		? await db
				.select({ taskId: taskPlanning.taskId, plannedFor: taskPlanning.plannedFor })
				.from(taskPlanning)
				.where(and(inArray(taskPlanning.taskId, taskIds), eq(taskPlanning.userId, locals.user.id)))
		: [];
	const plannedByTask = new Map<string, string>();
	for (const r of planRows) {
		if (r.plannedFor) plannedByTask.set(r.taskId, String(r.plannedFor).slice(0, 10));
	}

	// Prerequisites as task refs (KEY-n): readable, editable, and what the
	// import resolves. Edges to deleted tasks are gone via cascade; archived
	// prerequisites aren't in `rows`, so resolve refs from the edge set itself.
	const depRows = taskIds.length
		? await db
				.select({
					taskId: taskDependency.taskId,
					dependsOnId: taskDependency.dependsOnId,
					number: task.number
				})
				.from(taskDependency)
				.innerJoin(task, eq(task.id, taskDependency.dependsOnId))
				.where(and(inArray(taskDependency.taskId, taskIds), isNull(task.deletedAt)))
		: [];
	const dependsOnByTask = new Map<string, string[]>();
	for (const r of depRows) {
		const list = dependsOnByTask.get(r.taskId) ?? [];
		list.push(`${p.key}-${r.number}`);
		dependsOnByTask.set(r.taskId, list);
	}

	const exportedAt = new Date().toISOString().slice(0, 10);
	const header = `{
	// Trackr task export — ${p.key} · ${p.name} — exported ${exportedAt}.
	//
	// Edit this file and upload it via "Import tasks" on the same project:
	//   • an entry WITH an "id" updates that task — only the fields present
	//     in the entry are changed, omitted fields stay as they are
	//   • an entry WITHOUT an "id" creates a new task
	//   • removing an entry changes nothing (uploads never delete tasks)
	// An "id" that doesn't belong to this project is rejected as an error.
	// Comments are allowed and stripped on upload. Max 500 tasks per upload.
	//
	// Allowed values:
	//   type:      "task" | "bug" | "improvement" | "feature" | "chore"
	//   status:    "backlog" | "todo" | "in_progress" | "paused" | "in_review" | "done"
	//   priority:  "none" | "low" | "medium" | "high" | "urgent"
	//
	// Other fields:
	//   description:     string ("" clears it)
	//   dueDate:         ISO date, e.g. "2026-09-01" (null clears it)
	//   plannedFor:      ISO date, e.g. "2026-09-01" — plans the task into YOUR
	//                    week on that day (null removes it from your plan)
	//   estimateMinutes: positive number (null clears it)
	//   tags:            array of strings (lowercased, max 24 chars each)
	//   checklist:       array of { "text": string, "done": boolean }
	//   assignees:       array of user emails or user ids
	//   dependsOn:       array of task refs from this project, e.g. ["${p.key}-12"] —
	//                    prerequisites that should be done before the task starts
	//                    ([] clears them; refs must be existing tasks, not new
	//                    entries in this file; loops are rejected)
	"tasks": [`;

	const entries = rows.map((t) => {
		const item: Record<string, unknown> = { id: t.id, title: t.title };
		if (t.description) item.description = t.description;
		item.type = t.type;
		item.status = t.status;
		item.priority = t.priority;
		if (t.dueDate) item.dueDate = t.dueDate.toISOString().slice(0, 10);
		const planned = plannedByTask.get(t.id);
		if (planned) item.plannedFor = planned;
		if (t.estimateMinutes) item.estimateMinutes = t.estimateMinutes;
		if (t.tags.length > 0) item.tags = t.tags;
		if (t.checklist.length > 0) {
			item.checklist = t.checklist.map((c) => ({ text: c.text, done: c.done }));
		}
		item.assignees = assigneesByTask.get(t.id) ?? [];
		const deps = dependsOnByTask.get(t.id);
		if (deps?.length)
			item.dependsOn = deps.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
		const json = JSON.stringify(item, null, '\t')
			.split('\n')
			.map((line) => `\t\t${line}`)
			.join('\n');
		return `\t\t// ${p.key}-${t.number}\n${json}`;
	});

	const body = `${header}\n${entries.join(',\n')}\n\t]\n}\n`;

	void recordAudit({
		type: 'task.export',
		actorId: locals.user.id,
		targetType: 'project',
		targetId: p.id,
		targetLabel: `${p.key} · ${p.name}`,
		orgId: p.orgId,
		meta: { count: rows.length }
	});

	return new Response(body, {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="${p.key.toLowerCase()}-tasks-${exportedAt}.jsonc"`
		}
	});
};
