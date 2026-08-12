// Wiki page list for the app's Notes tab — the flat tree (id, parentId,
// title, folder flag), internal team only, mirroring the web route guard.
import { isTrackrTeam } from '$lib/server/permissions';
import { loadWikiTree } from '$lib/server/wiki';
import { apiError, json, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	requireUser(locals);
	if (!isTrackrTeam(locals)) apiError(403, 'Wiki is internal.');
	const pages = await loadWikiTree();
	return json({ pages });
};
