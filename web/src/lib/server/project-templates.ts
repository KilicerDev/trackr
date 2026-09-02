// Project templates: named sets of starter tasks that get copied into a new
// project at creation time. Authored by superadmins under
// /admin/system/templates; only `published` templates show up in the
// create-project picker.

import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import {
	projectTemplate,
	projectTemplateTask,
	type ProjectTemplate,
	type ProjectTemplateStatus,
	type ProjectTemplateTask
} from './db/app.schema';
import {
	ALLOWED_TASK_PRIORITY,
	ALLOWED_TASK_STATUS,
	ALLOWED_TASK_TYPE,
	createTasks,
	type Tx
} from './tasks';

export const TEMPLATE_STATUSES: ProjectTemplateStatus[] = ['draft', 'published'];

export type TemplateSummary = {
	id: string;
	name: string;
	description: string | null;
	color: string;
	icon: string;
	status: ProjectTemplateStatus;
	taskCount: number;
	updatedAt: Date;
};

function summarize(t: ProjectTemplate & { taskCount?: number | string | null }): TemplateSummary {
	return {
		id: t.id,
		name: t.name,
		description: t.description,
		color: t.color,
		icon: t.icon,
		status: t.status as ProjectTemplateStatus,
		taskCount: Number(t.taskCount ?? 0),
		updatedAt: t.updatedAt
	};
}

/** Every template with its task count, newest first. Admin list view. */
export async function listTemplates(): Promise<TemplateSummary[]> {
	const rows = await db
		.select({
			id: projectTemplate.id,
			name: projectTemplate.name,
			description: projectTemplate.description,
			color: projectTemplate.color,
			icon: projectTemplate.icon,
			status: projectTemplate.status,
			createdBy: projectTemplate.createdBy,
			createdAt: projectTemplate.createdAt,
			updatedAt: projectTemplate.updatedAt,
			taskCount: count(projectTemplateTask.id)
		})
		.from(projectTemplate)
		.leftJoin(projectTemplateTask, eq(projectTemplateTask.templateId, projectTemplate.id))
		.groupBy(projectTemplate.id)
		.orderBy(desc(projectTemplate.updatedAt));
	return rows.map(summarize);
}

/** Published templates only — what the create-project modal offers. */
export async function listPublishedTemplates(): Promise<TemplateSummary[]> {
	const rows = await db
		.select({
			id: projectTemplate.id,
			name: projectTemplate.name,
			description: projectTemplate.description,
			color: projectTemplate.color,
			icon: projectTemplate.icon,
			status: projectTemplate.status,
			createdBy: projectTemplate.createdBy,
			createdAt: projectTemplate.createdAt,
			updatedAt: projectTemplate.updatedAt,
			taskCount: count(projectTemplateTask.id)
		})
		.from(projectTemplate)
		.leftJoin(projectTemplateTask, eq(projectTemplateTask.templateId, projectTemplate.id))
		.where(eq(projectTemplate.status, 'published'))
		.groupBy(projectTemplate.id)
		.orderBy(asc(projectTemplate.name));
	return rows.map(summarize);
}

export async function getTemplate(
	id: string
): Promise<{ template: ProjectTemplate; tasks: ProjectTemplateTask[] } | null> {
	const [template] = await db
		.select()
		.from(projectTemplate)
		.where(eq(projectTemplate.id, id))
		.limit(1);
	if (!template) return null;
	const tasks = await db
		.select()
		.from(projectTemplateTask)
		.where(eq(projectTemplateTask.templateId, id))
		.orderBy(asc(projectTemplateTask.sortOrder), asc(projectTemplateTask.createdAt));
	return { template, tasks };
}

export async function createTemplate(input: {
	name: string;
	createdBy: string;
	color?: string;
}): Promise<string> {
	const id = crypto.randomUUID();
	await db.insert(projectTemplate).values({
		id,
		name: input.name,
		icon: deriveIcon(input.name),
		color: input.color ?? '#7a9cf0',
		status: 'draft',
		createdBy: input.createdBy
	});
	return id;
}

export type TemplatePatch = Partial<{
	name: string;
	description: string | null;
	color: string;
	icon: string;
	status: ProjectTemplateStatus;
}>;

export async function updateTemplate(id: string, patch: TemplatePatch): Promise<boolean> {
	const set: TemplatePatch = {};
	if (patch.name !== undefined) set.name = patch.name;
	if (patch.description !== undefined) set.description = patch.description;
	if (patch.color !== undefined) set.color = patch.color;
	if (patch.icon !== undefined) set.icon = patch.icon;
	if (patch.status !== undefined && TEMPLATE_STATUSES.includes(patch.status)) {
		set.status = patch.status;
	}
	if (Object.keys(set).length === 0) return true;
	const rows = await db
		.update(projectTemplate)
		.set(set)
		.where(eq(projectTemplate.id, id))
		.returning({ id: projectTemplate.id });
	return rows.length > 0;
}

export async function deleteTemplate(id: string): Promise<boolean> {
	const rows = await db
		.delete(projectTemplate)
		.where(eq(projectTemplate.id, id))
		.returning({ id: projectTemplate.id });
	return rows.length > 0;
}

/** Copy a template (and its tasks) into a new draft. */
export async function duplicateTemplate(
	id: string,
	input: { name: string; createdBy: string }
): Promise<string | null> {
	const source = await getTemplate(id);
	if (!source) return null;
	const newId = crypto.randomUUID();
	await db.transaction(async (tx) => {
		await tx.insert(projectTemplate).values({
			id: newId,
			name: input.name,
			description: source.template.description,
			color: source.template.color,
			icon: source.template.icon,
			status: 'draft',
			createdBy: input.createdBy
		});
		if (source.tasks.length) {
			await tx.insert(projectTemplateTask).values(
				source.tasks.map((t, i) => ({
					id: crypto.randomUUID(),
					templateId: newId,
					title: t.title,
					description: t.description,
					status: t.status,
					priority: t.priority,
					type: t.type,
					estimateMinutes: t.estimateMinutes,
					tags: t.tags,
					checklist: t.checklist,
					sortOrder: i
				}))
			);
		}
	});
	return newId;
}

// ─── Template tasks ────────────────────────────────────────────────────────

export type ChecklistItem = { id: string; text: string; done: boolean };

export type TemplateTaskInput = {
	title: string;
	description?: string | null;
	status?: string;
	priority?: string;
	type?: string;
	estimateMinutes?: number | null;
	tags?: string[];
	checklist?: ChecklistItem[];
};

/** Keep only well-formed items; ids are regenerated when missing. */
export function sanitizeChecklist(raw: unknown): ChecklistItem[] {
	if (!Array.isArray(raw)) return [];
	const out: ChecklistItem[] = [];
	for (const it of raw) {
		if (!it || typeof it !== 'object') continue;
		const text = String((it as { text?: unknown }).text ?? '').trim();
		if (!text) continue;
		const id = String((it as { id?: unknown }).id ?? '') || crypto.randomUUID();
		out.push({ id, text, done: Boolean((it as { done?: unknown }).done) });
	}
	return out;
}

function sanitizeTask(input: TemplateTaskInput) {
	return {
		title: input.title.trim(),
		description: input.description?.trim() || null,
		status: input.status && ALLOWED_TASK_STATUS.has(input.status) ? input.status : 'todo',
		priority: input.priority && ALLOWED_TASK_PRIORITY.has(input.priority) ? input.priority : 'none',
		type: input.type && ALLOWED_TASK_TYPE.has(input.type) ? input.type : 'task',
		estimateMinutes:
			input.estimateMinutes != null && Number.isFinite(input.estimateMinutes)
				? Math.max(0, Math.round(input.estimateMinutes))
				: null,
		tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
		checklist: sanitizeChecklist(input.checklist)
	};
}

/** Append a task at the end of the template's list. */
export async function addTemplateTask(
	templateId: string,
	input: TemplateTaskInput
): Promise<ProjectTemplateTask | null> {
	const clean = sanitizeTask(input);
	if (!clean.title) return null;
	const [{ max }] = await db
		.select({ max: sql<number>`coalesce(max(${projectTemplateTask.sortOrder}), -1)` })
		.from(projectTemplateTask)
		.where(eq(projectTemplateTask.templateId, templateId));
	const [row] = await db
		.insert(projectTemplateTask)
		.values({ id: crypto.randomUUID(), templateId, ...clean, sortOrder: Number(max) + 1 })
		.returning();
	// Touch the parent so "updated" on the list reflects task edits too.
	await touch(templateId);
	return row ?? null;
}

export async function updateTemplateTask(
	templateId: string,
	taskId: string,
	patch: Partial<TemplateTaskInput>
): Promise<boolean> {
	const set: Partial<ReturnType<typeof sanitizeTask>> = {};
	if (patch.title !== undefined) {
		const title = patch.title.trim();
		if (!title) return false;
		set.title = title;
	}
	if (patch.description !== undefined) set.description = patch.description?.trim() || null;
	if (patch.status !== undefined && ALLOWED_TASK_STATUS.has(patch.status))
		set.status = patch.status;
	if (patch.priority !== undefined && ALLOWED_TASK_PRIORITY.has(patch.priority)) {
		set.priority = patch.priority;
	}
	if (patch.type !== undefined && ALLOWED_TASK_TYPE.has(patch.type)) set.type = patch.type;
	if (patch.estimateMinutes !== undefined) {
		set.estimateMinutes =
			patch.estimateMinutes != null && Number.isFinite(patch.estimateMinutes)
				? Math.max(0, Math.round(patch.estimateMinutes))
				: null;
	}
	if (patch.tags !== undefined) set.tags = patch.tags.map((t) => t.trim()).filter(Boolean);
	if (patch.checklist !== undefined) set.checklist = sanitizeChecklist(patch.checklist);
	if (Object.keys(set).length === 0) return true;
	const rows = await db
		.update(projectTemplateTask)
		.set(set)
		.where(and(eq(projectTemplateTask.id, taskId), eq(projectTemplateTask.templateId, templateId)))
		.returning({ id: projectTemplateTask.id });
	if (rows.length) await touch(templateId);
	return rows.length > 0;
}

export async function deleteTemplateTask(templateId: string, taskId: string): Promise<boolean> {
	const rows = await db
		.delete(projectTemplateTask)
		.where(and(eq(projectTemplateTask.id, taskId), eq(projectTemplateTask.templateId, templateId)))
		.returning({ id: projectTemplateTask.id });
	if (rows.length) await touch(templateId);
	return rows.length > 0;
}

/** Persist a full new order. Ids not in the template are ignored. */
export async function reorderTemplateTasks(
	templateId: string,
	orderedIds: string[]
): Promise<void> {
	await db.transaction(async (tx) => {
		for (let i = 0; i < orderedIds.length; i++) {
			await tx
				.update(projectTemplateTask)
				.set({ sortOrder: i })
				.where(
					and(
						eq(projectTemplateTask.id, orderedIds[i]),
						eq(projectTemplateTask.templateId, templateId)
					)
				);
		}
	});
	await touch(templateId);
}

async function touch(templateId: string): Promise<void> {
	await db
		.update(projectTemplate)
		.set({ updatedAt: new Date() })
		.where(eq(projectTemplate.id, templateId));
}

// ─── Applying a template ───────────────────────────────────────────────────

/**
 * Copy a published template's tasks into a freshly created project. Runs on
 * the caller's transaction so a failure rolls the project back too. Returns
 * the number of tasks created (0 when the template has none or is a draft).
 */
export async function applyTemplate(
	tx: Tx,
	input: { templateId: string; projectId: string; projectKey: string; createdBy: string }
): Promise<{ name: string; created: number } | null> {
	const [template] = await tx
		.select({ id: projectTemplate.id, name: projectTemplate.name, status: projectTemplate.status })
		.from(projectTemplate)
		.where(eq(projectTemplate.id, input.templateId))
		.limit(1);
	if (!template || template.status !== 'published') return null;

	const tasks = await tx
		.select()
		.from(projectTemplateTask)
		.where(eq(projectTemplateTask.templateId, template.id))
		.orderBy(asc(projectTemplateTask.sortOrder), asc(projectTemplateTask.createdAt));

	const created = await createTasks({
		tx,
		projectId: input.projectId,
		projectKey: input.projectKey,
		createdBy: input.createdBy,
		tasks: tasks.map((t) => ({
			title: t.title,
			description: t.description,
			status: t.status,
			priority: t.priority,
			type: t.type,
			estimateMinutes: t.estimateMinutes,
			tags: t.tags,
			// Fresh ids per project; every item starts unticked.
			checklist: t.checklist.map((c) => ({ id: crypto.randomUUID(), text: c.text, done: false }))
		}))
	});
	return { name: template.name, created: created.length };
}

export function deriveIcon(name: string): string {
	const trimmed = name.trim();
	return trimmed ? trimmed[0].toUpperCase() : 'T';
}
