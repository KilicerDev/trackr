import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { user as userTable } from '$lib/server/db/auth.schema';
import { deleteWikiPage, getWikiPage, updateWikiPage } from '$lib/server/wiki';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const page = await getWikiPage(params.id);
	if (!page) error(404, 'Page not found');

	const userIds = [page.authorId, page.updatedById].filter(
		(v): v is string => typeof v === 'string'
	);
	const authors = userIds.length
		? await db
				.select({ id: userTable.id, name: userTable.name, email: userTable.email })
				.from(userTable)
				.where(eq(userTable.id, userIds[0]))
		: [];
	// One author lookup is enough — most pages have author == updatedBy in
	// early use; if they differ we'll add a tiny fan-out later.

	return { page, authors };
};

export const actions: Actions = {
	update: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not authenticated' });
		const form = await request.formData();
		const title = form.get('title');
		const body = form.get('body');
		const icon = form.get('icon');

		const patch: { title?: string; body?: string; icon?: string } = {};
		if (typeof title === 'string') {
			const t = title.trim();
			if (!t) return fail(400, { message: 'Title cannot be empty.' });
			if (t.length > 120) return fail(400, { message: 'Title is too long.' });
			patch.title = t;
		}
		if (typeof body === 'string') patch.body = body;
		if (typeof icon === 'string' && icon.trim()) patch.icon = icon.trim();

		await updateWikiPage(params.id, patch, locals.user.id);
		return { success: true };
	},

	delete: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not authenticated' });
		const existing = await getWikiPage(params.id);
		if (!existing) return fail(404, { message: 'Page not found.' });
		await deleteWikiPage(params.id);
		redirect(303, '/wiki');
	}
};
