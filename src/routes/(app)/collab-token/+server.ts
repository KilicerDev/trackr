import { error, json } from '@sveltejs/kit';
import { isTrackrTeam } from '$lib/server/permissions';
import { signCollabToken } from '$lib/server/collab/auth';
import type { RequestHandler } from './$types';

// Mints a short-lived token the browser hands to the Hocuspocus provider. The
// session cookie is httpOnly so JS can't read it directly; this endpoint is
// cookie-authenticated (via hooks.server.ts) and bridges that to a collab token.
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Not authenticated');
	if (!isTrackrTeam(locals)) error(403, 'Wiki is restricted.');
	return json({ token: signCollabToken(locals.user.id) });
};
