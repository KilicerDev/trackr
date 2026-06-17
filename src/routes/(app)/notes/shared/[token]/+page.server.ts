import { error, redirect } from '@sveltejs/kit';
import { isTrackrTeam } from '$lib/server/permissions';
import { redeemShareLink } from '$lib/server/notes';
import { m } from '$lib/paraglide/messages';
import type { PageServerLoad } from './$types';

// Redeem a share link: a logged-in internal-team user exchanges the token for a
// persistent note_access grant, then lands on the note. (The (app) layout has
// already required authentication; the parent /notes layout requires team.)
export const load: PageServerLoad = async ({ params, locals }) => {
	if (!isTrackrTeam(locals)) error(403, m.notes_err_restricted());
	const noteId = await redeemShareLink(params.token, locals.user!.id);
	if (!noteId) error(404, m.notes_err_link_invalid());
	redirect(303, `/notes/${noteId}`);
};
