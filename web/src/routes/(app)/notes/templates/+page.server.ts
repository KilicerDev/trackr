import { fail } from '@sveltejs/kit';
import { deleteTemplate, listTemplates, updateTemplate } from '$lib/server/notes';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const all = await listTemplates(locals.user!.id);
	return {
		templates: all.map((t) => ({
			id: t.id,
			name: t.name,
			icon: t.icon,
			isSystem: t.isSystem,
			mine: t.ownerId === locals.user!.id
		}))
	};
};

export const actions: Actions = {
	rename: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: m.notes_err_not_authenticated() });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: m.notes_err_template_name_required() });
		await updateTemplate(id, locals.user.id, { name });
		return { success: true };
	},

	remove: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: m.notes_err_not_authenticated() });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		await deleteTemplate(id, locals.user.id);
		return { success: true };
	}
};
