import { redirect, type ServerLoad } from '@sveltejs/kit';
import { can } from '$lib/server/permissions';
import { loadTickets } from '$lib/server/tickets';

// Admin (org.client) portal dashboard: a stat overview across all of the active
// org's tickets. Members (org.member) only see their own tickets and are bounced
// back to the standard overview — the guard is server-side, never trusting the
// client-side role flag.
export const load: ServerLoad = async ({ locals, parent }) => {
	if (!locals.user) throw redirect(303, '/sign-in');

	// Reuse the layout's resolved active org so the dashboard always reflects the
	// org currently selected in the switcher.
	const { activeOrgId } = (await parent()) as { activeOrgId?: string | null };
	if (!activeOrgId) throw redirect(303, '/tickets');

	// Only the see-all tier reaches the dashboard.
	if (!(await can(locals, 'org.tickets.read.any', { orgId: activeOrgId }))) {
		throw redirect(303, '/tickets');
	}

	const tickets = await loadTickets({ orgIds: [activeOrgId] });
	return { tickets };
};
