import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Roles moved into the System section (/admin/system/roles). Keep the old
// address working for bookmarks.
export const load: PageServerLoad = () => {
	redirect(301, '/admin/system/roles');
};
