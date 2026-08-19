// Event fan-out for tickets. One function = the complete notification set for
// one user action, shared by the web actions and the /api/v1 endpoints so the
// two paths cannot drift. Recipient eligibility comes from
// `ticketRecipients()`; preference/channel routing stays inside `notify()`.
import { notify } from '../index';
import { ticketRecipients } from '../recipients';
import { parseMentionIds } from '$lib/utils/mentions';
import { m } from '$lib/paraglide/messages';
import { priorityLabel, ticketStatusLabel } from '$lib/utils/labels';
import type { TicketPriority, TicketStatus } from '$lib/server/tickets';

// The slice of a ticket row every event needs. Callers already hold the loaded
// ticket (from getTicket()/createTicket()) — no re-querying here.
export type TicketNotifyCtx = {
	id: string;
	displayId: string;
	orgId: string;
	subject: string;
	customerId: string | null;
	// `createdBy` on TicketRow; null for legacy rows.
	creatorId?: string | null;
	assigneeIds: string[];
};

const involved = (t: TicketNotifyCtx): string[] =>
	[...t.assigneeIds, t.customerId, t.creatorId].filter((x): x is string => !!x);

// A new ticket: `ticketCreated` to everyone allowed to see it, plus a separate
// `ticketAssigned` to each assignee set on create.
export async function notifyTicketCreated(opts: {
	ticket: TicketNotifyCtx;
	description: string | null;
	actorId: string;
	origin: string;
}): Promise<void> {
	const { ticket: t } = opts;
	const recipients = await ticketRecipients({
		orgId: t.orgId,
		customerId: t.customerId,
		creatorId: t.creatorId ?? null,
		assigneeIds: t.assigneeIds
	});
	// Assignees get the personal `ticketAssigned` below instead of a
	// `ticketCreated` duplicate for the same ticket (both default to instant
	// email). `participants` stays complete for scope-narrowing.
	for (const aid of t.assigneeIds) recipients.delete(aid);
	await notify({
		kind: 'ticketCreated',
		recipients,
		actorId: opts.actorId,
		orgId: t.orgId,
		participants: involved(t),
		render: (locale) => ({
			title: m.notify_ticket_created({ ref: t.displayId, subject: t.subject }, { locale }),
			body: opts.description
		}),
		url: `/tickets/${t.id}`,
		entity: { type: 'ticket', id: t.id },
		baseUrl: opts.origin
	});
	const assignedToNotify = t.assigneeIds.filter((aid) => aid !== opts.actorId);
	if (assignedToNotify.length) {
		await notify({
			kind: 'ticketAssigned',
			recipients: assignedToNotify,
			actorId: opts.actorId,
			orgId: t.orgId,
			render: (locale) => ({
				title: m.notify_ticket_assigned({ ref: t.displayId, subject: t.subject }, { locale })
			}),
			url: `/tickets/${t.id}`,
			entity: { type: 'ticket', id: t.id },
			baseUrl: opts.origin
		});
	}
}

// A new message on a ticket: `ticketMessage` to the scoped audience (internal
// notes go to Trackr staff only), then `ticketMentioned` for @-mentions.
// Mentions are intersected with the already-scoped audience so an internal
// note's mention can never reach the customer.
export async function notifyTicketMessage(opts: {
	ticket: TicketNotifyCtx;
	body: string;
	internal: boolean;
	actorId: string;
	origin: string;
}): Promise<void> {
	const { ticket: t } = opts;
	const recipients = await ticketRecipients(
		{
			orgId: t.orgId,
			customerId: t.customerId,
			creatorId: t.creatorId ?? null,
			assigneeIds: t.assigneeIds
		},
		{ teamOnly: opts.internal }
	);
	// Mention wins: a mentioned user gets only `ticketMentioned`, never a
	// `ticketMessage` duplicate for the same message.
	const mentionIds = parseMentionIds(opts.body).filter((mid) => recipients.has(mid));
	for (const mid of mentionIds) recipients.delete(mid);
	await notify({
		kind: 'ticketMessage',
		recipients,
		actorId: opts.actorId,
		orgId: t.orgId,
		participants: involved(t),
		render: (locale) => ({
			title: opts.internal
				? m.notify_ticket_internal_note({ ref: t.displayId }, { locale })
				: m.notify_ticket_message({ ref: t.displayId, subject: t.subject }, { locale }),
			body: opts.body.slice(0, 280)
		}),
		url: `/tickets/${t.id}`,
		entity: { type: 'ticket', id: t.id },
		baseUrl: opts.origin
	});

	if (mentionIds.length > 0) {
		await notify({
			kind: 'ticketMentioned',
			recipients: mentionIds,
			actorId: opts.actorId,
			orgId: t.orgId,
			render: (locale) => ({
				title: m.notify_mentioned({ label: `${t.displayId} — ${t.subject}` }, { locale }),
				body: opts.body.slice(0, 280)
			}),
			url: `/tickets/${t.id}`,
			entity: { type: 'ticket', id: t.id },
			baseUrl: opts.origin
		});
	}
}

// A ticket update: `ticketAssigned` to newly-added assignees (removed ones are
// not notified, mirroring tasks), `ticketStatusChanged` to the full audience on
// a status change (the customer wants to know their ticket moved), and the same
// kind internal-only on a priority change (triage concern — customer excluded).
export async function notifyTicketUpdated(opts: {
	ticket: TicketNotifyCtx;
	addedAssigneeIds: string[];
	newStatus?: TicketStatus | null;
	newPriority?: TicketPriority | null;
	actorId: string;
	origin: string;
}): Promise<void> {
	const { ticket: t } = opts;
	const url = `/tickets/${t.id}`;

	const addedToNotify = opts.addedAssigneeIds.filter((aid) => aid !== opts.actorId);
	if (addedToNotify.length) {
		await notify({
			kind: 'ticketAssigned',
			recipients: addedToNotify,
			actorId: opts.actorId,
			orgId: t.orgId,
			render: (locale) => ({
				title: m.notify_ticket_assigned({ ref: t.displayId, subject: t.subject }, { locale })
			}),
			url,
			entity: { type: 'ticket', id: t.id },
			baseUrl: opts.origin
		});
	}

	const newStatus = opts.newStatus;
	if (newStatus) {
		const recipients = await ticketRecipients({
			orgId: t.orgId,
			customerId: t.customerId,
			creatorId: t.creatorId ?? null,
			assigneeIds: t.assigneeIds
		});
		await notify({
			kind: 'ticketStatusChanged',
			recipients,
			actorId: opts.actorId,
			orgId: t.orgId,
			participants: involved(t),
			render: (locale) => ({
				title: m.notify_ticket_status_changed(
					{
						ref: t.displayId,
						subject: t.subject,
						status: ticketStatusLabel(newStatus, locale)
					},
					{ locale }
				)
			}),
			url,
			entity: { type: 'ticket', id: t.id },
			baseUrl: opts.origin
		});
	}

	// When status and priority change in the same submit, the status
	// notification (whose audience is a superset) carries the update — a second
	// `ticketStatusChanged` for the priority would double-notify internal staff.
	const newPriority = opts.newPriority;
	if (newPriority && !newStatus) {
		const recipients = await ticketRecipients(
			{
				orgId: t.orgId,
				customerId: t.customerId,
				creatorId: t.creatorId ?? null,
				assigneeIds: t.assigneeIds
			},
			{ internalOnly: true }
		);
		await notify({
			kind: 'ticketStatusChanged',
			recipients,
			actorId: opts.actorId,
			orgId: t.orgId,
			participants: involved(t),
			render: (locale) => ({
				title: m.notify_ticket_priority_changed(
					{
						ref: t.displayId,
						subject: t.subject,
						priority: priorityLabel(newPriority, locale)
					},
					{ locale }
				)
			}),
			url,
			entity: { type: 'ticket', id: t.id },
			baseUrl: opts.origin
		});
	}
}
