import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { user as userTable } from '$lib/server/db/auth.schema';
import {
	deleteWikiPage,
	ensureDocumentForPage,
	getWikiPage,
	updateWikiPage
} from '$lib/server/wiki';
import { isTrackrTeam } from '$lib/server/permissions';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!isTrackrTeam(locals)) error(403, m.wiki_err_restricted());
	let page = await getWikiPage(params.id);
	if (!page) error(404, m.wiki_err_page_not_found());

	// Every page (folders included, for their description) edits collaboratively;
	// make sure a document is linked — lazily created + seeded from the legacy
	// HTML on first open.
	if (!page.documentId) {
		await ensureDocumentForPage(page.id);
		page = (await getWikiPage(params.id)) ?? page;
	}

	const me = locals.user ? { id: locals.user.id, name: locals.user.name } : null;

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

	return { page, authors, me };
};

export const actions: Actions = {
	update: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { message: m.wiki_err_not_authenticated() });
		if (!isTrackrTeam(locals)) return fail(403, { message: m.wiki_err_restricted_short() });
		const form = await request.formData();
		const title = form.get('title');
		const icon = form.get('icon');

		// Body is no longer saved here — page content is the collaborative
		// document (Yjs), persisted server-side by Hocuspocus. Only metadata
		// (title/icon) flows through this action.
		const patch: { title?: string; icon?: string } = {};
		if (typeof title === 'string') {
			const t = title.trim();
			if (!t) return fail(400, { message: m.wiki_err_title_empty() });
			if (t.length > 120) return fail(400, { message: m.wiki_err_title_too_long() });
			patch.title = t;
		}
		if (typeof icon === 'string' && icon.trim()) patch.icon = icon.trim();

		await updateWikiPage(params.id, patch, locals.user.id);
		return { success: true };
	},

	delete: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { message: m.wiki_err_not_authenticated() });
		if (!isTrackrTeam(locals)) return fail(403, { message: m.wiki_err_restricted_short() });
		const existing = await getWikiPage(params.id);
		if (!existing) return fail(404, { message: m.wiki_err_page_not_found_period() });
		await deleteWikiPage(params.id);
		redirect(303, '/wiki');
	}
};
