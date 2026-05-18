import { error } from '@sveltejs/kit';
import { loadWikiTree } from '$lib/server/wiki';
import { isTrackrTeam } from '$lib/server/permissions';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Wiki is internal-only: only Trackr-org members can read it. Client orgs
	// shouldn't see internal docs even if they discover the URL.
	if (!isTrackrTeam(locals)) error(403, 'Wiki is restricted to the Trackr team.');
	const tree = await loadWikiTree();
	return { tree };
};
