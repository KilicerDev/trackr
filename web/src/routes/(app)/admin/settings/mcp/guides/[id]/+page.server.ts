// Guide editor (Settings → MCP → Guides). `[id]` is a guide id or `new`.
// `fetch` only returns the imported content to the form; nothing is stored
// until `save`, so an admin can look at the conversion before it goes live.

import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { assertCan } from '$lib/server/permissions';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
import {
	createGuide,
	deleteGuide,
	fetchGuideFromUrl,
	getGuide,
	GUIDE_BODY_MAX_CHARS,
	GuidanceError,
	slugify,
	updateGuide,
	type GuideInput
} from '$lib/server/mcp/guidance';
import { guidanceErrorMessage } from '$lib/server/mcp/guidance-messages';

const NEW = 'new';

async function guard(locals: App.Locals) {
	await assertCan(locals, 'admin.settings.manage');
	if (!locals.user) throw error(401, m.settings_err_not_authenticated());
	return locals.user;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	await guard(locals);
	if (params.id === NEW) return { guide: null, bodyMax: GUIDE_BODY_MAX_CHARS };
	const guide = await getGuide(params.id);
	if (!guide) error(404, m.mcp_guide_err_not_found());
	return {
		guide: {
			id: guide.id,
			slug: guide.slug,
			title: guide.title,
			summary: guide.summary,
			body: guide.body,
			sourceUrl: guide.sourceUrl,
			fetchedAt: guide.fetchedAt,
			enabled: guide.enabled,
			updatedAt: guide.updatedAt
		},
		bodyMax: GUIDE_BODY_MAX_CHARS
	};
};

function readForm(fd: FormData): GuideInput & { fetched: boolean } {
	const str = (k: string) => String(fd.get(k) ?? '');
	return {
		title: str('title'),
		slug: str('slug'),
		summary: str('summary'),
		body: str('body'),
		sourceUrl: str('sourceUrl') || null,
		enabled: str('enabled') === 'on' || str('enabled') === 'true',
		fetched: str('fetched') === '1'
	};
}

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		const me = await guard(locals);
		const form = readForm(await request.formData());
		const input: GuideInput = {
			title: form.title,
			slug: form.slug,
			summary: form.summary,
			body: form.body,
			sourceUrl: form.sourceUrl,
			enabled: form.enabled,
			// A body just imported from the URL is a fresh snapshot.
			...(form.fetched ? { fetchedAt: new Date() } : {})
		};
		try {
			if (params.id === NEW) {
				const row = await createGuide(input, me.id);
				void recordAudit({
					type: 'mcp_guide.create',
					actorId: me.id,
					targetType: 'mcp_guide',
					targetId: row.id,
					targetLabel: row.title,
					meta: { slug: row.slug, sourceUrl: row.sourceUrl, chars: row.body.length }
				});
				redirect(303, `/admin/settings/mcp/guides/${row.id}?created=1`);
			}
			const row = await updateGuide(params.id, input, me.id);
			void recordAudit({
				type: 'mcp_guide.update',
				actorId: me.id,
				targetType: 'mcp_guide',
				targetId: row.id,
				targetLabel: row.title,
				meta: { slug: row.slug, sourceUrl: row.sourceUrl, chars: row.body.length }
			});
			return { success: true, saved: row.id };
		} catch (err) {
			if (err instanceof GuidanceError) return fail(400, { message: guidanceErrorMessage(err) });
			throw err;
		}
	},

	fetch: async ({ request, locals }) => {
		await guard(locals);
		const form = readForm(await request.formData());
		if (!form.sourceUrl) return fail(400, { message: m.mcp_guide_err_invalid_url() });
		try {
			const fetched = await fetchGuideFromUrl(form.sourceUrl);
			return {
				success: true,
				fetched: {
					body: fetched.body,
					title: fetched.title,
					slug: fetched.title && !form.title.trim() ? slugify(fetched.title) : null,
					truncated: fetched.truncated
				}
			};
		} catch (err) {
			if (err instanceof GuidanceError) return fail(400, { message: guidanceErrorMessage(err) });
			throw err;
		}
	},

	delete: async ({ locals, params }) => {
		const me = await guard(locals);
		if (params.id === NEW) redirect(303, '/admin/settings/mcp');
		const row = await deleteGuide(params.id);
		if (!row) return fail(404, { message: m.mcp_guide_err_not_found() });
		void recordAudit({
			type: 'mcp_guide.delete',
			actorId: me.id,
			targetType: 'mcp_guide',
			targetId: row.id,
			targetLabel: row.title,
			meta: { slug: row.slug }
		});
		redirect(303, '/admin/settings/mcp');
	}
};
