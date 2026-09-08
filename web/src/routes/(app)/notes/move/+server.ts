// Sidebar drag & drop for quick notes: reparent + reorder in one call
// (mirrors /wiki/move). Only the owner's own quick notes take part — the
// server re-checks every id, so a stray shared/meeting note in the payload is
// ignored rather than moved.
import { error, json } from '@sveltejs/kit';
import { isTrackrTeam } from '$lib/server/permissions';
import { moveNote } from '$lib/server/notes';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not authenticated');
	if (!isTrackrTeam(locals)) error(403, 'Notes are restricted.');

	const body = await request.json().catch(() => null);
	if (!body || typeof body.id !== 'string') error(400, 'Invalid request.');

	const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null;
	const orderedIds = Array.isArray(body.orderedIds)
		? body.orderedIds.filter((v: unknown): v is string => typeof v === 'string')
		: [];

	try {
		await moveNote({ id: body.id, parentId, orderedIds, ownerId: locals.user.id });
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Could not move note.');
	}

	return json({ ok: true });
};
