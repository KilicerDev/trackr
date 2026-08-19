import { error, fail, redirect } from '@sveltejs/kit';
import { deleteTemplate, listTemplates, updateTemplate } from '$lib/server/notes';
import { isTrackrTeam } from '$lib/server/permissions';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Notes (incl. templates) are internal-team only — same gate as the notes
	// layout, repeated here because sibling layout loads run in parallel and a
	// direct hit could otherwise 500 on the user assertion below.
	if (!locals.user) redirect(302, `/login?next=${encodeURIComponent(url.pathname)}`);
	if (!isTrackrTeam(locals)) error(403, m.notes_err_restricted());
	const all = await listTemplates();
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
		// Layout gates don't cover action POSTs — templates are team-only.
		if (!isTrackrTeam(locals)) return fail(403, { message: m.notes_err_restricted() });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: m.notes_err_template_name_required() });
		await updateTemplate(id, locals.user.id, { name });
		return { success: true };
	},

	remove: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: m.notes_err_not_authenticated() });
		if (!isTrackrTeam(locals)) return fail(403, { message: m.notes_err_restricted() });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		await deleteTemplate(id, locals.user.id);
		return { success: true };
	}
};
