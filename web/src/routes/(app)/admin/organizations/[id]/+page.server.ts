import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Organization detail moved into the Directory section (see ../+page.server.ts).
export const load: PageServerLoad = ({ params, url }) => {
	redirect(301, `/admin/directory/organizations/${params.id}${url.search}`);
};
