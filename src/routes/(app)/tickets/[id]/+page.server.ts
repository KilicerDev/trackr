import { error, redirect, type ServerLoad } from '@sveltejs/kit';
import { can, isTrackrTeam } from '$lib/server/permissions';
import { getTicket, loadTicketMessages } from '$lib/server/tickets';
import { markEntityRead } from '$lib/server/notify';

export const load: ServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(303, '/sign-in');
	const id = params.id;
	if (!id) throw error(404, 'Ticket not found');

	const ticket = await getTicket(id);
	if (!ticket) throw error(404, 'Ticket not found');

	const isAgent = await can(locals, 'org.tickets.edit.any', { orgId: ticket.orgId });
	const canReadAny = isTrackrTeam(locals) || isAgent
		|| (await can(locals, 'org.tickets.read.any', { orgId: ticket.orgId }));

	if (!canReadAny) {
		const ownAllowed =
			(await can(locals, 'org.tickets.read.own', { orgId: ticket.orgId })) &&
			(ticket.customerId === locals.user.id || ticket.assignedAgentId === locals.user.id);
		if (!ownAllowed) throw error(403, 'You do not have access to this ticket.');
	}

	const messages = await loadTicketMessages(id, { includeInternal: isAgent });

	// Opening the ticket clears any unread bell items pointing at it.
	// Fire and forget — a failed update should never break the load.
	void markEntityRead(locals.user.id, 'ticket', id).catch(() => {});

	return { ticket, messages, isAgent };
};
