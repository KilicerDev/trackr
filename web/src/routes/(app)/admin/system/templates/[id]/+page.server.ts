import { error, fail, redirect } from '@sveltejs/kit';
import {
	addTemplateTask,
	deleteTemplate,
	deleteTemplateTask,
	deriveIcon,
	getTemplate,
	reorderTemplateTasks,
	sanitizeChecklist,
	updateTemplate,
	updateTemplateTask,
	type TemplateTaskInput
} from '$lib/server/project-templates';
import { recordAudit } from '$lib/server/audit';
import { isSuperadmin } from '$lib/roles';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const found = await getTemplate(params.id);
	if (!found) error(404, m.templates_not_found());
	return {
		template: {
			id: found.template.id,
			name: found.template.name,
			description: found.template.description,
			color: found.template.color,
			icon: found.template.icon,
			status: found.template.status as 'draft' | 'published'
		},
		tasks: found.tasks.map((t) => ({
			id: t.id,
			title: t.title,
			description: t.description,
			status: t.status,
			priority: t.priority,
			type: t.type,
			estimateMinutes: t.estimateMinutes,
			tags: t.tags,
			checklist: t.checklist
		}))
	};
};

// Layout loads don't run for action POSTs — every action re-checks the caller
// (the hooks.server.ts admin guard covers it too; defense in depth).
function guard(locals: App.Locals) {
	if (!locals.user || !isSuperadmin(locals.user.role)) {
		return fail(403, { message: m.templates_action_error() });
	}
	return null;
}

function str(fd: FormData, key: string): string | undefined {
	const v = fd.get(key);
	return v == null ? undefined : String(v);
}

// Optional integer field: '' clears, absent leaves untouched.
function intOrNull(fd: FormData, key: string): number | null | undefined {
	const v = str(fd, key);
	if (v === undefined) return undefined;
	if (v.trim() === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function taskPatch(fd: FormData): Partial<TemplateTaskInput> {
	const patch: Partial<TemplateTaskInput> = {};
	const title = str(fd, 'title');
	if (title !== undefined) patch.title = title;
	const description = str(fd, 'description');
	if (description !== undefined) patch.description = description;
	const status = str(fd, 'status');
	if (status !== undefined) patch.status = status;
	const priority = str(fd, 'priority');
	if (priority !== undefined) patch.priority = priority;
	const type = str(fd, 'type');
	if (type !== undefined) patch.type = type;
	const estimate = intOrNull(fd, 'estimateMinutes');
	if (estimate !== undefined) patch.estimateMinutes = estimate;
	const tags = str(fd, 'tags');
	if (tags !== undefined) patch.tags = tags.split(',');
	const checklist = str(fd, 'checklist');
	if (checklist !== undefined) {
		try {
			patch.checklist = sanitizeChecklist(JSON.parse(checklist));
		} catch {
			patch.checklist = [];
		}
	}
	return patch;
}

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const denied = guard(locals);
		if (denied) return denied;
		const fd = await request.formData();
		const name = str(fd, 'name')?.trim();
		if (name !== undefined && !name) return fail(400, { message: m.templates_action_error() });
		const description = str(fd, 'description');
		const color = str(fd, 'color');
		const ok = await updateTemplate(params.id, {
			...(name !== undefined ? { name, icon: deriveIcon(name) } : {}),
			...(description !== undefined ? { description: description.trim() || null } : {}),
			...(color !== undefined && /^#[0-9a-f]{6}$/i.test(color) ? { color } : {})
		});
		if (!ok) return fail(404, { message: m.templates_not_found() });
		return { success: true };
	},

	status: async ({ request, locals, params }) => {
		const denied = guard(locals);
		if (denied) return denied;
		const fd = await request.formData();
		const status = str(fd, 'status');
		if (status !== 'draft' && status !== 'published') {
			return fail(400, { message: m.templates_action_error() });
		}
		const ok = await updateTemplate(params.id, { status });
		if (!ok) return fail(404, { message: m.templates_not_found() });
		void recordAudit({
			type: status === 'published' ? 'project_template.publish' : 'project_template.unpublish',
			actorId: locals.user!.id,
			targetType: 'project_template',
			targetId: params.id
		});
		return { success: true };
	},

	task_add: async ({ request, locals, params }) => {
		const denied = guard(locals);
		if (denied) return denied;
		const fd = await request.formData();
		const patch = taskPatch(fd);
		if (!patch.title?.trim()) return fail(400, { message: m.templates_action_error() });
		const row = await addTemplateTask(params.id, { ...patch, title: patch.title });
		if (!row) return fail(400, { message: m.templates_action_error() });
		return { success: true, id: row.id };
	},

	task_update: async ({ request, locals, params }) => {
		const denied = guard(locals);
		if (denied) return denied;
		const fd = await request.formData();
		const taskId = str(fd, 'taskId');
		if (!taskId) return fail(400, { message: m.templates_action_error() });
		const ok = await updateTemplateTask(params.id, taskId, taskPatch(fd));
		if (!ok) return fail(400, { message: m.templates_action_error() });
		return { success: true };
	},

	task_delete: async ({ request, locals, params }) => {
		const denied = guard(locals);
		if (denied) return denied;
		const fd = await request.formData();
		const taskId = str(fd, 'taskId');
		if (!taskId) return fail(400, { message: m.templates_action_error() });
		const ok = await deleteTemplateTask(params.id, taskId);
		if (!ok) return fail(404, { message: m.templates_action_error() });
		return { success: true };
	},

	reorder: async ({ request, locals, params }) => {
		const denied = guard(locals);
		if (denied) return denied;
		const fd = await request.formData();
		const ids = fd
			.getAll('ids')
			.map((v) => String(v))
			.filter(Boolean);
		await reorderTemplateTasks(params.id, ids);
		return { success: true };
	},

	delete: async ({ locals, params }) => {
		const denied = guard(locals);
		if (denied) return denied;
		const ok = await deleteTemplate(params.id);
		if (!ok) return fail(404, { message: m.templates_not_found() });
		void recordAudit({
			type: 'project_template.delete',
			actorId: locals.user!.id,
			targetType: 'project_template',
			targetId: params.id
		});
		redirect(303, '/admin/system/templates');
	}
};
