// Read-only endpoint for the ticket's conversation, fetched lazily when a
// "ticket created" marker in the chat feed is expanded. Reuses the same
// message-loading + permission logic as the ticket detail page: access is gated
// by canViewTicket, and agents-only internal notes stay hidden from non-team
// viewers. Returns the current status/subject so the inline panel reflects the
// live ticket, not a snapshot.

import { json } from '@sveltejs/kit';
import { canViewTicket, isTrackrTeam } from '$lib/server/permissions';
import { getTicket, loadTicketMessages } from '$lib/server/tickets';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ message: 'Not authenticated' }, { status: 401 });

	const ticketId = params.id;
	if (!ticketId) return json({ message: 'Missing ticket id' }, { status: 400 });

	const ticket = await getTicket(ticketId);
	if (!ticket) return json({ message: 'Ticket not found' }, { status: 404 });
	if (!(await canViewTicket(locals, ticket))) {
		return json({ message: 'Forbidden' }, { status: 403 });
	}

	const includeInternal = isTrackrTeam(locals);
	// Conversation only — the inline preview renders each row as a message
	// bubble, so the ticket's system activity events are excluded here.
	const messages = await loadTicketMessages(ticketId, { includeInternal, includeSystem: false });

	return json({
		ticket: {
			id: ticket.id,
			displayId: ticket.displayId,
			subject: ticket.subject,
			status: ticket.status
		},
		messages
	});
};
