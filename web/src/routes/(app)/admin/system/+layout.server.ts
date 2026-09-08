import { error } from '@sveltejs/kit';
import { isSuperadmin } from '$lib/roles';
import type { LayoutServerLoad } from './$types';

// /admin/* already requires an admin-like role (parent gate). Within the
// system section, the audit log (its loader checks admin.logs.view) and the
// read-only roles matrix are open to every admin; the job queue + schedules
// are root-tier only: superadmins, not regular admins. hooks.server.ts
// applies the same split for POSTs.
const ADMIN_TIER = ['/admin/system/logs', '/admin/system/roles'];

export const load: LayoutServerLoad = ({ locals, url }) => {
	// The bare section path only redirects to the log tab, so it passes too.
	const adminTier =
		url.pathname === '/admin/system' || ADMIN_TIER.some((p) => url.pathname.startsWith(p));
	if (!adminTier && !isSuperadmin((locals.user as { role?: string | null } | undefined)?.role)) {
		error(403, 'Superadmin access required.');
	}
	return {};
};
