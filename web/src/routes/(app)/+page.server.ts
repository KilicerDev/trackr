import { redirect } from '@sveltejs/kit';
import { isPortalUser } from '$lib/server/permissions';
import type { ServerLoad } from '@sveltejs/kit';

export const load: ServerLoad = ({ locals }) => {
	// External ticket-only users land in the portal's new-ticket view; everyone
	// else goes to the task workspace.
	if (isPortalUser(locals)) throw redirect(302, '/tickets/new');
	throw redirect(302, '/tasks');
};
