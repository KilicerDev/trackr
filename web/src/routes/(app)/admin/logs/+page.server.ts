import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The audit log moved into the System section (/admin/system/logs). Keep the
// old address working for bookmarks and notification links, filters included.
export const load: PageServerLoad = ({ url }) => {
	redirect(301, `/admin/system/logs${url.search}`);
};
