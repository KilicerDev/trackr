// Event fan-out for tickets. One function = the complete notification set for
// one user action, shared by the web actions and the /api/v1 endpoints so the
// two paths cannot drift. Recipient eligibility comes from
// `ticketRecipients()`; preference/channel routing stays inside `notify()`.
// Each emit also carries structured email content (eyebrow / meta rows /
// quote / CTA) so the email channel can render the rich card.
import { notify } from '../index';
import { ticketRecipients } from '../recipients';
import { parseMentionIds } from '$lib/utils/mentions';
import { m } from '$lib/paraglide/messages';
import { priorityLabel, ticketStatusLabel } from '$lib/utils/labels';
import type { TicketPriority, TicketStatus } from '$lib/server/tickets';
import type { Locale } from '$lib/paraglide/runtime';
import { emailDate, type NotifyActor } from './shared';

// The slice of a ticket row every event needs. Callers already hold the loaded
// ticket (from getTicket()/createTicket()) — no re-querying here. `status` /
// `priority` are the values AFTER the action and feed the email meta rows.
export type TicketNotifyCtx = {
	id: string;
	displayId: string;
	orgId: string;
	subject: string;
	customerId: string | null;
	// `createdBy` on TicketRow; null for legacy rows.
	creatorId?: string | null;
	assigneeIds: string[];
	status?: string | null;
	priority?: string | null;
};

const involved = (t: TicketNotifyCtx): string[] =>
	[...t.assigneeIds, t.customerId, t.creatorId].filter((x): x is string => !!x);

// Standard meta rows for the email card: Von / Status / Priorität / Datum.
function ticketMeta(
	t: TicketNotifyCtx,
	actor: NotifyActor,
	locale: Locale
): { label: string; value: string }[] {
	const rows: { label: string; value: string }[] = [
		{ label: m.email_meta_from(undefined, { locale }), value: actor.name }
	];
	if (t.status) {
		rows.push({
			label: m.email_meta_status(undefined, { locale }),
			value: ticketStatusLabel(t.status as TicketStatus, locale)
		});
	}
	if (t.priority) {
		rows.push({
			label: m.email_meta_priority(undefined, { locale }),
			value: priorityLabel(t.priority as TicketPriority, locale)
		});
	}
	rows.push({ label: m.email_meta_date(undefined, { locale }), value: emailDate(locale) });
	return rows;
}

// A new ticket: `ticketCreated` to everyone allowed to see it, plus a separate
// `ticketAssigned` to each assignee set on create.
export async function notifyTicketCreated(opts: {
	ticket: TicketNotifyCtx;
	description: string | null;
	actor: NotifyActor;
	origin: string;
}): Promise<void> {
	const { ticket: t, actor } = opts;
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
		actorId: actor.id,
		orgId: t.orgId,
		participants: involved(t),
		render: (locale) => ({
			title: m.notify_ticket_created({ ref: t.displayId, subject: t.subject }, { locale }),
			body: opts.description
		}),
		email: (locale) => ({
			subjectLabel: m.email_ev_new_ticket(undefined, { locale }),
			eyebrow: m.email_ev_new_ticket(undefined, { locale }),
			ref: t.displayId,
			heading: t.subject,
			meta: ticketMeta(t, actor, locale),
			quote: opts.description,
			ctaLabel: m.email_cta_ticket(undefined, { locale })
		}),
		url: `/tickets/${t.id}`,
		entity: { type: 'ticket', id: t.id },
		baseUrl: opts.origin
	});
	const assignedToNotify = t.assigneeIds.filter((aid) => aid !== actor.id);
	if (assignedToNotify.length) {
		await notifyAssigned(t, assignedToNotify, actor, opts.origin);
	}
}

// `ticketAssigned` — shared by the create and update paths.
async function notifyAssigned(
	t: TicketNotifyCtx,
	recipients: string[],
	actor: NotifyActor,
	origin: string
): Promise<void> {
	await notify({
		kind: 'ticketAssigned',
		recipients,
		actorId: actor.id,
		orgId: t.orgId,
		render: (locale) => ({
			title: m.notify_ticket_assigned({ ref: t.displayId, subject: t.subject }, { locale })
		}),
		email: (locale) => ({
			subjectLabel: m.email_ev_assigned(undefined, { locale }),
			eyebrow: `${m.email_kind_ticket(undefined, { locale })} · ${m.email_ev_assigned(undefined, { locale })}`,
			ref: t.displayId,
			heading: t.subject,
			meta: ticketMeta(t, actor, locale),
			ctaLabel: m.email_cta_ticket(undefined, { locale })
		}),
		url: `/tickets/${t.id}`,
		entity: { type: 'ticket', id: t.id },
		baseUrl: origin
	});
}

// A new message on a ticket: `ticketMessage` to the scoped audience (internal
// notes go to Trackr staff only), then `ticketMentioned` for @-mentions.
export async function notifyTicketMessage(opts: {
	ticket: TicketNotifyCtx;
	body: string;
	internal: boolean;
	actor: NotifyActor;
	origin: string;
}): Promise<void> {
	const { ticket: t, actor } = opts;
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
	// `ticketMessage` duplicate for the same message. Intersected with the
	// already-scoped audience first, so an internal note's mention can never
	// reach the customer.
	const mentionIds = parseMentionIds(opts.body).filter((mid) => recipients.has(mid));
	for (const mid of mentionIds) recipients.delete(mid);
	const excerpt = opts.body.slice(0, 280);
	await notify({
		kind: 'ticketMessage',
		recipients,
		actorId: actor.id,
		orgId: t.orgId,
		participants: involved(t),
		render: (locale) => ({
			title: opts.internal
				? m.notify_ticket_internal_note({ ref: t.displayId }, { locale })
				: m.notify_ticket_message({ ref: t.displayId, subject: t.subject }, { locale }),
			body: excerpt
		}),
		email: (locale) => {
			const label = opts.internal
				? m.email_ev_internal_note(undefined, { locale })
				: m.email_ev_message(undefined, { locale });
			return {
				subjectLabel: label,
				eyebrow: `${m.email_kind_ticket(undefined, { locale })} · ${label}`,
				ref: t.displayId,
				heading: t.subject,
				meta: ticketMeta(t, actor, locale),
				quote: excerpt,
				ctaLabel: m.email_cta_ticket(undefined, { locale })
			};
		},
		url: `/tickets/${t.id}`,
		entity: { type: 'ticket', id: t.id },
		baseUrl: opts.origin
	});

	if (mentionIds.length > 0) {
		await notify({
			kind: 'ticketMentioned',
			recipients: mentionIds,
			actorId: actor.id,
			orgId: t.orgId,
			render: (locale) => ({
				title: m.notify_mentioned({ label: `${t.displayId} — ${t.subject}` }, { locale }),
				body: excerpt
			}),
			email: (locale) => ({
				subjectLabel: m.email_ev_mentioned(undefined, { locale }),
				eyebrow: m.email_ev_mentioned(undefined, { locale }),
				ref: t.displayId,
				heading: t.subject,
				meta: ticketMeta(t, actor, locale),
				quote: excerpt,
				ctaLabel: m.email_cta_ticket(undefined, { locale })
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
	actor: NotifyActor;
	origin: string;
}): Promise<void> {
	const { ticket: t, actor } = opts;
	const url = `/tickets/${t.id}`;

	const addedToNotify = opts.addedAssigneeIds.filter((aid) => aid !== actor.id);
	if (addedToNotify.length) {
		await notifyAssigned(t, addedToNotify, actor, opts.origin);
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
			actorId: actor.id,
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
			email: (locale) => ({
				subjectLabel: m.email_ev_status(undefined, { locale }),
				eyebrow: `${m.email_kind_ticket(undefined, { locale })} · ${m.email_ev_status(undefined, { locale })}`,
				ref: t.displayId,
				heading: t.subject,
				meta: ticketMeta({ ...t, status: newStatus }, actor, locale),
				ctaLabel: m.email_cta_ticket(undefined, { locale })
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
			actorId: actor.id,
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
			email: (locale) => ({
				subjectLabel: m.email_ev_priority(undefined, { locale }),
				eyebrow: `${m.email_kind_ticket(undefined, { locale })} · ${m.email_ev_priority(undefined, { locale })}`,
				ref: t.displayId,
				heading: t.subject,
				meta: ticketMeta({ ...t, priority: newPriority }, actor, locale),
				ctaLabel: m.email_cta_ticket(undefined, { locale })
			}),
			url,
			entity: { type: 'ticket', id: t.id },
			baseUrl: opts.origin
		});
	}
}
