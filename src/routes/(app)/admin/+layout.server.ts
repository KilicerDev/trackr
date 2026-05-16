import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// Single gate for /admin/*. Membership-of-Trackr-org check happens upstream
// in hooks.server.ts; here we just enforce the boolean.
export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.isAdmin) error(403, 'Admin access required.');
	return {};
};
