// Read-only note for the app (search hit → detail). Access via
// resolveNoteRole — the same owner/share/meeting inheritance the web and the
// collab websocket use.
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { document } from '$lib/server/db/app.schema';
import { isTrackrTeam } from '$lib/server/permissions';
import { getNote, resolveNoteRole } from '$lib/server/notes';
import { m } from '$lib/paraglide/messages';
import { apiError, json, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const user = requireUser(locals);
	if (!isTrackrTeam(locals)) apiError(403, m.notes_err_restricted());

	const note = await getNote(params.id);
	if (!note) apiError(404, m.notes_err_not_found());
	const role = await resolveNoteRole(note, user.id, locals.memberships!);
	if (!role) apiError(403, m.notes_err_no_access());

	let bodyHtml = '';
	if (note.documentId) {
		const [doc] = await db
			.select({ bodyHtml: document.bodyHtml })
			.from(document)
			.where(eq(document.id, note.documentId))
			.limit(1);
		bodyHtml = doc?.bodyHtml ?? '';
	}

	return json({
		note: {
			id: note.id,
			kind: note.kind,
			title: note.title,
			icon: note.icon,
			pinned: note.pinned,
			bodyHtml,
			meetingDate: note.meetingDate?.toISOString() ?? null,
			projectId: note.projectId,
			taskId: note.taskId,
			updatedAt: note.updatedAt.toISOString()
		}
	});
};
