import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The system section opens on the jobs view.
export const load: PageServerLoad = () => {
	redirect(307, '/admin/system/jobs');
};
