// Read-only note for the app (search hit → detail). Access via
// resolveNoteRole — the same owner/share/meeting inheritance the web and the
// collab websocket use.
import { isTrackrTeam } from '$lib/server/permissions';
import { loadBodyHtml } from '$lib/server/collab/derive';
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

	// loadBodyHtml re-derives an empty read model from the Yjs state — the
	// store-time derivation is best-effort and has failed in prod, leaving
	// notes whose content only exists in the ydoc binary.
	const bodyHtml = note.documentId ? await loadBodyHtml(note.documentId) : '';

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
