import { error, json } from '@sveltejs/kit';
import { isTrackrTeam } from '$lib/server/permissions';
import { moveWikiPage } from '$lib/server/wiki';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not authenticated');
	if (!isTrackrTeam(locals)) error(403, 'Wiki is restricted.');

	const body = await request.json().catch(() => null);
	if (!body || typeof body.id !== 'string') error(400, 'Invalid request.');

	const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null;
	const orderedIds = Array.isArray(body.orderedIds)
		? body.orderedIds.filter((v: unknown): v is string => typeof v === 'string')
		: [];

	try {
		await moveWikiPage({ id: body.id, parentId, orderedIds, updatedById: locals.user.id });
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Could not move item.');
	}

	return json({ ok: true });
};
