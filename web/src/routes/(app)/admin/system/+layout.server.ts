import { error } from '@sveltejs/kit';
import { isSuperadmin } from '$lib/roles';
import type { LayoutServerLoad } from './$types';

// /admin/* already requires an admin-like role (parent gate). Within the
// system section, the audit log is open to every admin (its own loader checks
// admin.logs.view); the job queue + schedules are root-tier only: superadmins,
// not regular admins. hooks.server.ts applies the same split for POSTs.
export const load: LayoutServerLoad = ({ locals, url }) => {
	// The bare section path only redirects to the log tab, so it passes too.
	const isLogs = url.pathname === '/admin/system' || url.pathname.startsWith('/admin/system/logs');
	if (!isLogs && !isSuperadmin((locals.user as { role?: string | null } | undefined)?.role)) {
		error(403, 'Superadmin access required.');
	}
	return {};
};
