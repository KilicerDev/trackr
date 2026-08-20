// Read-only wiki page for the app: serves the `body_html` read model, never
// the Yjs document (the app doesn't collaborate — editing is desktop-only).
// Internal team only, mirroring the web wiki routes.
import { isTrackrTeam } from '$lib/server/permissions';
import { loadBodyHtml } from '$lib/server/collab/derive';
import { getWikiPage } from '$lib/server/wiki';
import { apiError, json, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	requireUser(locals);
	if (!isTrackrTeam(locals)) apiError(403, 'Wiki is restricted to the internal team.');

	const page = await getWikiPage(params.id);
	if (!page) apiError(404, 'Page not found.');

	// Prefer the collaborative document's derived HTML — re-deriving from
	// the Yjs state when the read model is empty (store-time derivation is
	// best-effort) — and fall back to the legacy inline body for pages never
	// opened in the editor.
	let bodyHtml = page.body;
	if (page.documentId) {
		bodyHtml = (await loadBodyHtml(page.documentId)) || page.body;
	}

	return json({
		page: {
			id: page.id,
			title: page.title,
			icon: page.icon,
			isFolder: page.isFolder,
			bodyHtml,
			updatedAt: page.updatedAt.toISOString()
		}
	});
};
