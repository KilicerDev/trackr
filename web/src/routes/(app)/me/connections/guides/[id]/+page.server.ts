// Personal guide editor (/me/connections). `[id]` is a guide id or `new`.
// Same shape as the workspace editor under Settings → MCP, scoped to the
// signed-in user's own guides: someone else's id answers like a missing one.

import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recordAudit } from '$lib/server/audit';
import { isMcpEnabled } from '$lib/server/mcp/access';
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
const BACK = '/me/connections';

async function guard(locals: App.Locals) {
	if (!locals.user) throw error(401, m.settings_err_not_authenticated());
	// Guides only reach assistants acting as this user, so without MCP access
	// there is nothing to manage.
	if (!(await isMcpEnabled(locals.user.id))) throw error(403, m.connections_mcp_disabled());
	return locals.user;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const me = await guard(locals);
	if (params.id === NEW) return { guide: null, bodyMax: GUIDE_BODY_MAX_CHARS };
	const guide = await getGuide(params.id, { ownerUserId: me.id });
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
	save: async (event) => {
		const me = await guard(event.locals);
		const form = readForm(await event.request.formData());
		const input: GuideInput = {
			title: form.title,
			slug: form.slug,
			summary: form.summary,
			body: form.body,
			sourceUrl: form.sourceUrl,
			enabled: form.enabled,
			...(form.fetched ? { fetchedAt: new Date() } : {})
		};
		try {
			if (event.params.id === NEW) {
				const row = await createGuide({ ...input, ownerUserId: me.id }, me.id);
				void recordAudit(
					{
						type: 'mcp_guide.create',
						actorId: me.id,
						targetType: 'mcp_guide',
						targetId: row.id,
						targetLabel: row.title,
						meta: {
							slug: row.slug,
							sourceUrl: row.sourceUrl,
							chars: row.body.length,
							personal: true
						}
					},
					event
				);
				redirect(303, `${BACK}/guides/${row.id}?created=1`);
			}
			const row = await updateGuide(event.params.id, input, me.id, { ownerUserId: me.id });
			void recordAudit(
				{
					type: 'mcp_guide.update',
					actorId: me.id,
					targetType: 'mcp_guide',
					targetId: row.id,
					targetLabel: row.title,
					meta: { slug: row.slug, sourceUrl: row.sourceUrl, chars: row.body.length, personal: true }
				},
				event
			);
			return { success: true, saved: row.id };
		} catch (err) {
			if (err instanceof GuidanceError) return fail(400, { message: guidanceErrorMessage(err) });
			throw err;
		}
	},

	fetch: async (event) => {
		await guard(event.locals);
		const form = readForm(await event.request.formData());
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

	delete: async (event) => {
		const me = await guard(event.locals);
		if (event.params.id === NEW) redirect(303, BACK);
		const row = await deleteGuide(event.params.id, { ownerUserId: me.id });
		if (!row) return fail(404, { message: m.mcp_guide_err_not_found() });
		void recordAudit(
			{
				type: 'mcp_guide.delete',
				actorId: me.id,
				targetType: 'mcp_guide',
				targetId: row.id,
				targetLabel: row.title,
				meta: { slug: row.slug, personal: true }
			},
			event
		);
		redirect(303, BACK);
	}
};
