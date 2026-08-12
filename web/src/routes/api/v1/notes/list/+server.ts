// Note lists for the app's Notes tab — own quick notes, all meeting notes,
// and quick notes shared with me. Internal team only, mirroring the web
// route guard (/notes). Lives under /list because POST /api/v1/notes
// (quick capture) already owns the collection route's file.
import { isTrackrTeam } from '$lib/server/permissions';
import { listMeetingNotes, listQuickNotes, listSharedWithMe } from '$lib/server/notes';
import type { NoteListItem } from '$lib/server/notes';
import { apiError, json, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

// Drizzle date columns may surface as Date or string depending on mode —
// normalize both.
const serialize = (n: NoteListItem) => ({
	id: n.id,
	kind: n.kind,
	title: n.title,
	icon: n.icon,
	pinned: n.pinned,
	updatedAt: new Date(n.updatedAt).toISOString(),
	meetingDate: n.meetingDate ? new Date(n.meetingDate).toISOString().slice(0, 10) : null
});

export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals);
	if (!isTrackrTeam(locals)) apiError(403, 'Notes are internal.');
	const [quick, meetings, shared] = await Promise.all([
		listQuickNotes(user.id),
		listMeetingNotes(),
		listSharedWithMe(user.id)
	]);
	return json({
		quick: quick.map(serialize),
		meetings: meetings.map(serialize),
		shared: shared.map(serialize)
	});
};
