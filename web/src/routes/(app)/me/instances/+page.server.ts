import { getPreferences } from '$lib/server/preferences';
import type { PageServerLoad } from './$types';

// The user's other trackr instances (TRACK-140). Writes go through the JSON
// endpoint at /api/instances, shared with the sidebar switcher.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { instances: [] };
	const prefs = locals.preferences ?? (await getPreferences(locals.user.id));
	return { instances: prefs.instances };
};
