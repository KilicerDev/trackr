// Read-only wiki page for the app: serves the `body_html` read model, never
// the Yjs document (the app doesn't collaborate — editing is desktop-only).
// Internal team only, mirroring the web wiki routes.
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { document } from '$lib/server/db/app.schema';
import { isTrackrTeam } from '$lib/server/permissions';
import { getWikiPage } from '$lib/server/wiki';
import { apiError, json, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	requireUser(locals);
	if (!isTrackrTeam(locals)) apiError(403, 'Wiki is restricted to the internal team.');

	const page = await getWikiPage(params.id);
	if (!page) apiError(404, 'Page not found.');

	// Prefer the collaborative document's derived HTML; fall back to the
	// legacy inline body for pages never opened in the editor.
	let bodyHtml = page.body;
	if (page.documentId) {
		const [doc] = await db
			.select({ bodyHtml: document.bodyHtml })
			.from(document)
			.where(eq(document.id, page.documentId))
			.limit(1);
		if (doc) bodyHtml = doc.bodyHtml || page.body;
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
