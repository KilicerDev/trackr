import { error } from '@sveltejs/kit';
import { isSuperadmin } from '$lib/roles';
import type { LayoutServerLoad } from './$types';

// /admin/* already requires an admin-like role (parent gate). The system
// section — the job queue + schedules — is root-tier only: superadmins, not
// regular admins.
export const load: LayoutServerLoad = ({ locals }) => {
	if (!isSuperadmin((locals.user as { role?: string | null } | undefined)?.role)) {
		error(403, 'Superadmin access required.');
	}
	return {};
};
