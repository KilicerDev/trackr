import { error } from '@sveltejs/kit';
import { can } from '$lib/server/permissions';
import { adminRoutePermission, SUPERADMIN_REQUIRED_MESSAGE } from '$lib/server/admin-routes';
import type { LayoutServerLoad } from './$types';

// The whole settings section is superadmin tier (admin.settings.manage): it
// configures what the instance is and what can reach into or out of it.
// hooks.server.ts applies the same table for POSTs; each page's actions
// assert the permission again themselves.
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const extra = adminRoutePermission(url.pathname);
	if (extra && !(await can(locals, extra))) error(403, SUPERADMIN_REQUIRED_MESSAGE);
	return {};
};
