// Post a reply (or staff-only internal note) into a ticket — the app's
// two-tap answer path. Mirrors the web `message` action: visibility check via
// canViewTicket, comment grant for public replies, isTrackrTeam for internal.
import { assertCan, can, canViewTicket, isTrackrTeam } from '$lib/server/permissions';
import { addTicketMessage, getTicket } from '$lib/server/tickets';
import { notify } from '$lib/server/notify';
import { ticketRecipients } from '$lib/server/notify/recipients';
import { recordAudit } from '$lib/server/audit';
import { parseMentionIds } from '$lib/utils/mentions';
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

	const recipients = await ticketRecipients(
		{
			orgId: t.orgId,
			customerId: t.customerId,
			creatorId: t.createdBy,
			assigneeIds: t.assignees
		},
		{ teamOnly: internal }
	);
	await notify({
		kind: 'ticketMessage',
		recipients,
		actorId: user.id,
		orgId: t.orgId,
		participants: [...t.assignees, t.customerId, t.createdBy].filter((x): x is string => !!x),
		render: (locale) => ({
			title: internal
				? m.notify_ticket_internal_note({ ref: t.displayId }, { locale })
				: m.notify_ticket_message({ ref: t.displayId, subject: t.subject }, { locale }),
			body: text.slice(0, 280)
		}),
		url: `/tickets/${t.id}`,
		entity: { type: 'ticket', id: t.id },
		baseUrl: url.origin
	});

	// Mentions intersected with the already-scoped audience so an internal
	// note's mention can never reach the customer.
	const mentionIds = parseMentionIds(text).filter((mid) => recipients.has(mid));
	if (mentionIds.length > 0) {
		await notify({
			kind: 'ticketMentioned',
			recipients: mentionIds,
			actorId: user.id,
			orgId: t.orgId,
			render: (locale) => ({
				title: m.notify_mentioned({ label: `${t.displayId} — ${t.subject}` }, { locale }),
				body: text.slice(0, 280)
			}),
			url: `/tickets/${t.id}`,
			entity: { type: 'ticket', id: t.id },
			baseUrl: url.origin
		});
	}
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
