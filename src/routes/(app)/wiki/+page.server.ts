import { error, fail, redirect } from '@sveltejs/kit';
import { createWikiPage, getFirstRootPageId, getWikiPage } from '$lib/server/wiki';
import { isTrackrTeam } from '$lib/server/permissions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isTrackrTeam(locals)) error(403, 'Wiki is restricted to the Trackr team.');
	const id = await getFirstRootPageId();
	if (id) redirect(302, `/wiki/${id}`);
	return {};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not authenticated' });
		if (!isTrackrTeam(locals)) return fail(403, { message: 'Wiki is restricted.' });
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const isFolder = String(form.get('isFolder') ?? '') === 'true';
		const parentRaw = form.get('parentId');
		const parentId = typeof parentRaw === 'string' && parentRaw ? parentRaw : null;

		if (!title) return fail(400, { message: 'Title is required.' });
		if (title.length > 120) return fail(400, { message: 'Title is too long.' });

		if (parentId) {
			const parent = await getWikiPage(parentId);
			if (!parent) return fail(400, { message: 'Parent does not exist.' });
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
