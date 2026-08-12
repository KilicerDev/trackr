// Quick note capture from the app's + sheet (staff only, like all notes).
// POST { title, body? } — plain text; stored as simple paragraphs in the
// note's document read-model, which the desktop editor picks up on first open
// (same seed path as templates/legacy HTML).
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { document, note } from '$lib/server/db/app.schema';
import { createNote } from '$lib/server/notes';
import { isTrackrTeam } from '$lib/server/permissions';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

function escapeHtml(s: string): string {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	if (!isTrackrTeam(locals)) apiError(403, m.notes_err_restricted());
	const body = await readJson<{ title?: string; body?: string }>(request);
	const title = body.title?.trim();
	if (!title) apiError(400, 'Title is required.');

	const id = await createNote({ kind: 'quick', title, ownerId: user.id });

	const text = body.body?.trim();
	if (text) {
		// Seed the freshly created document with the captured text so it isn't
		// lost before the first desktop edit.
		const [row] = await db
			.select({ documentId: note.documentId })
			.from(note)
			.where(eq(note.id, id))
			.limit(1);
		if (row?.documentId) {
			const html = text
				.split(/\n+/)
				.map((p) => `<p>${escapeHtml(p)}</p>`)
				.join('');
			await db.update(document).set({ bodyHtml: html }).where(eq(document.id, row.documentId));
		}
	}
	return json({ id }, { status: 201 });
};
