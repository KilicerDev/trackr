import { error, redirect, type ServerLoad } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ticketFavorite } from '$lib/server/db/app.schema';
import { user as userTable } from '$lib/server/db/auth.schema';
import { can, isPortalUser, isTrackrTeam } from '$lib/server/permissions';
import { getTicket, loadTicketMessages } from '$lib/server/tickets';
import { markEntityRead } from '$lib/server/notify';
import { listAttachments, listAttachmentsForMany } from '$lib/server/attachments';
import { m } from '$lib/paraglide/messages';

function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase();
}
function userColor(id: string): string {
	let h = 0;
	for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return `hsl(${h % 360} 55% 60%)`;
}

export const load: ServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(303, '/sign-in');
	const id = params.id;
	if (!id) throw error(404, m.tickets_not_found_404());

	const ticket = await getTicket(id);
	if (!ticket) throw error(404, m.tickets_not_found_404());

	const isAgent = await can(locals, 'org.tickets.edit.any', { orgId: ticket.orgId });
	const canReadAny = isTrackrTeam(locals) || isAgent
		|| (await can(locals, 'org.tickets.read.any', { orgId: ticket.orgId }));

	if (!canReadAny) {
		const ownAllowed =
			(await can(locals, 'org.tickets.read.own', { orgId: ticket.orgId })) &&
			(ticket.customerId === locals.user.id || ticket.assignedAgentId === locals.user.id);
		if (!ownAllowed) throw error(403, m.tickets_no_access());
	}

	const messages = await loadTicketMessages(id, { includeInternal: isAgent });

	// Attachments: ticket-level, plus those on each message (keyed by message id).
	const [attachments, messageAttachmentMap] = await Promise.all([
		listAttachments('ticket', id),
		listAttachmentsForMany(
			'ticket_message',
			messages.map((m) => m.id)
		)
	]);
	const messageAttachments = Object.fromEntries(messageAttachmentMap);

	const [pin] = await db
		.select({ ticketId: ticketFavorite.ticketId })
		.from(ticketFavorite)
		.where(and(eq(ticketFavorite.userId, locals.user.id), eq(ticketFavorite.ticketId, id)))
		.limit(1);

	// Resolve display names for everyone involved in THIS ticket — assignee,
	// customer, creator, and message authors. Needed because the layout's global
	// `users` lookup is filtered to a client's own org, so an assigned internal
	// agent would otherwise render as "Unassigned"/"Unknown". Scoped to the
	// ticket's participants, so it doesn't leak the wider staff directory.
	const participantIds = [
		...new Set(
			[
				ticket.customerId,
				ticket.assignedAgentId,
				ticket.createdBy,
				...messages.map((m) => m.authorId)
			].filter((v): v is string => !!v)
		)
	];
	const participantRows = participantIds.length
		? await db
				.select({ id: userTable.id, name: userTable.name, email: userTable.email })
				.from(userTable)
				.where(inArray(userTable.id, participantIds))
		: [];
	const participants = participantRows.map((u) => {
		const name = u.name ?? u.email;
		return { id: u.id, name, initials: initials(name), color: userColor(u.id) };
	});

	// Opening the ticket clears any unread bell items pointing at it.
	// Fire and forget — a failed update should never break the load.
	void markEntityRead(locals.user.id, 'ticket', id).catch(() => {});

	return {
		ticket,
		messages,
		isAgent,
		attachments,
		messageAttachments,
		currentUserId: locals.user.id,
		isPinned: !!pin,
		isPortalUser: isPortalUser(locals),
		participants
	};
};
