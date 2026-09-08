import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The directory opens on the users tab.
export const load: PageServerLoad = () => {
	redirect(307, '/admin/directory/users');
};
