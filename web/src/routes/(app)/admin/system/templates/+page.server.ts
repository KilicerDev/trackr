import { fail } from '@sveltejs/kit';
import {
	createTemplate,
	deleteTemplate,
	duplicateTemplate,
	listTemplates,
	updateTemplate
} from '$lib/server/project-templates';
import { recordAudit } from '$lib/server/audit';
import { isSuperadmin } from '$lib/roles';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

function fmt(d: Date): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const load: PageServerLoad = async () => {
	const rows = await listTemplates();
	return {
		templates: rows.map((t) => ({ ...t, updatedAt: fmt(t.updatedAt) }))
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

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const denied = guard(locals);
		if (denied) return denied;
		const fd = await request.formData();
		const name = fd.get('name')?.toString().trim() ?? '';
		if (!name) return fail(400, { message: m.templates_action_error() });
		const id = await createTemplate({ name, createdBy: locals.user!.id });
		void recordAudit({
			type: 'project_template.create',
			actorId: locals.user!.id,
			targetType: 'project_template',
			targetId: id,
			targetLabel: name
		});
		return { success: true, id };
	},

	duplicate: async ({ request, locals }) => {
		const denied = guard(locals);
		if (denied) return denied;
		const fd = await request.formData();
		const id = fd.get('id')?.toString();
		const name = fd.get('name')?.toString().trim() ?? '';
		if (!id || !name) return fail(400, { message: m.templates_action_error() });
		const newId = await duplicateTemplate(id, { name, createdBy: locals.user!.id });
		if (!newId) return fail(404, { message: m.templates_not_found() });
		void recordAudit({
			type: 'project_template.create',
			actorId: locals.user!.id,
			targetType: 'project_template',
			targetId: newId,
			targetLabel: name,
			meta: { duplicatedFrom: id }
		});
		return { success: true, id: newId };
	},

	status: async ({ request, locals }) => {
		const denied = guard(locals);
		if (denied) return denied;
		const fd = await request.formData();
		const id = fd.get('id')?.toString();
		const status = fd.get('status')?.toString();
		if (!id || (status !== 'draft' && status !== 'published')) {
			return fail(400, { message: m.templates_action_error() });
		}
		const ok = await updateTemplate(id, { status });
		if (!ok) return fail(404, { message: m.templates_not_found() });
		void recordAudit({
			type: status === 'published' ? 'project_template.publish' : 'project_template.unpublish',
			actorId: locals.user!.id,
			targetType: 'project_template',
			targetId: id
		});
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const denied = guard(locals);
		if (denied) return denied;
		const fd = await request.formData();
		const id = fd.get('id')?.toString();
		if (!id) return fail(400, { message: m.templates_action_error() });
		const ok = await deleteTemplate(id);
		if (!ok) return fail(404, { message: m.templates_not_found() });
		void recordAudit({
			type: 'project_template.delete',
			actorId: locals.user!.id,
			targetType: 'project_template',
			targetId: id
		});
		return { success: true };
	}
};
