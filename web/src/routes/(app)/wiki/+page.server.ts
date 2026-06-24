import { error, fail } from '@sveltejs/kit';
import { createWikiPage, getRecentWikiPages, getWikiPage } from '$lib/server/wiki';
import { isTrackrTeam } from '$lib/server/permissions';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isTrackrTeam(locals)) error(403, m.wiki_err_restricted());
	const recent = await getRecentWikiPages(5);
	return { recent };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: m.wiki_err_not_authenticated() });
		if (!isTrackrTeam(locals)) return fail(403, { message: m.wiki_err_restricted_short() });
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const isFolder = String(form.get('isFolder') ?? '') === 'true';
		const parentRaw = form.get('parentId');
		const parentId = typeof parentRaw === 'string' && parentRaw ? parentRaw : null;

		if (!title) return fail(400, { message: m.wiki_err_title_required() });
		if (title.length > 120) return fail(400, { message: m.wiki_err_title_too_long() });

		if (parentId) {
			const parent = await getWikiPage(parentId);
			if (!parent) return fail(400, { message: m.wiki_err_parent_not_exist() });
		}

		const id = await createWikiPage({
			title,
			parentId,
			isFolder,
			authorId: locals.user.id
		});

		return { success: true, id };
	}
};
