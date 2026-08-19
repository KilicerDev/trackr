// Post a reply (or staff-only internal note) into a ticket — the app's
// two-tap answer path. Mirrors the web `message` action: visibility check via
// canViewTicket, comment grant for public replies, isTrackrTeam for internal.
import { assertCan, can, canViewTicket, isTrackrTeam } from '$lib/server/permissions';
import { addTicketMessage, getTicket } from '$lib/server/tickets';
import { notifyTicketMessage } from '$lib/server/notify/events/ticket';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	const user = requireUser(locals);
	const body = await readJson<{ body?: string; internal?: boolean }>(request);
	const text = body.body?.trim();
	if (!text) apiError(400, m.tickets_message_required());
	const internal = body.internal === true;

	const t = await getTicket(params.id);
	if (!t) apiError(404, m.tickets_not_found());
	if (!(await canViewTicket(locals, t))) apiError(403, m.tickets_no_access());
	if (internal) {
		if (!isTrackrTeam(locals)) apiError(403, m.tickets_no_access());
	} else {
		await assertCan(locals, 'org.tickets.comment', { orgId: t.orgId });
	}

	const authorIsAgent = await can(locals, 'org.tickets.edit.any', { orgId: t.orgId });
	const { id: messageId } = await addTicketMessage({
		ticketId: t.id,
		authorId: user.id,
		body: text,
		isInternalNote: internal,
		authorIsAgent
	});

	// Fan-out (incl. @-mentions, intersected with the scoped audience so an
	// internal note's mention can never reach the customer) lives in the helper.
	await notifyTicketMessage({
		ticket: {
			id: t.id,
			displayId: t.displayId,
			orgId: t.orgId,
			subject: t.subject,
			customerId: t.customerId,
			creatorId: t.createdBy,
			assigneeIds: t.assignees,
			status: t.status,
			priority: t.priority
		},
		body: text,
		internal,
		actor: { id: user.id, name: user.name },
		origin: url.origin
	});
	void recordAudit({
		type: 'ticket.message',
		actorId: user.id,
		targetType: 'ticket',
		targetId: t.id,
		targetLabel: `${t.displayId} · ${t.subject}`,
		orgId: t.orgId,
		meta: { internal, body: text.slice(0, 280), via: 'api.v1' }
	});

	return json({ id: messageId }, { status: 201 });
};
