import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Organizations moved into the Directory section. Keep the old address
// working for bookmarks and notification links.
export const load: PageServerLoad = ({ url }) => {
	redirect(301, `/admin/directory/organizations${url.search}`);
};
