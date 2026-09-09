import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Project templates are admin-tier content and left the (superadmin-tier)
// settings section for /admin/templates. Keep the old address for bookmarks.
export const load: PageServerLoad = () => {
	redirect(301, '/admin/templates');
};
