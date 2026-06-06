import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization, ticket, ticketMessage, ticketFavorite } from '$lib/server/db/app.schema';
import { assertCan, can, isTrackrTeam } from '$lib/server/permissions';
import { attachFormFiles, deleteAttachmentsFor } from '$lib/server/attachments';
import {
	addTicketMessage,
	createTicket,
	getTicket,
	loadTickets,
	softDeleteTicket,
	updateTicket,
	TICKET_CATEGORY_SET,
	TICKET_CHANNEL_SET,
	TICKET_PRIORITY_SET,
	TICKET_STATUS_SET,
	type TicketCategory,
	type TicketChannel,
	type TicketPriority,
	type TicketRow,
	type TicketStatus
} from '$lib/server/tickets';
import { notify } from '$lib/server/notify';
import { ticketRecipients } from '$lib/server/notify-recipients';
import { getPreferences } from '$lib/server/preferences';
import { m } from '$lib/paraglide/messages';

export const load: ServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/sign-in');

	const trackrTeam = isTrackrTeam(locals);
	const myOrgIds = (locals.memberships?.orgs ?? []).map((o) => o.orgId);

	let tickets: TicketRow[];
	if (trackrTeam) {
		tickets = await loadTickets({});
	} else if (myOrgIds.length === 0) {
		tickets = [];
	} else {
		// Split orgs by access level: orgs where I can read all tickets vs.
		// orgs where I can only read my own (client role).
		const anyOrgIds: string[] = [];
		const ownOrgIds: string[] = [];
		for (const orgId of myOrgIds) {
			if (await can(locals, 'org.tickets.read.any', { orgId })) {
				anyOrgIds.push(orgId);
			} else if (await can(locals, 'org.tickets.read.own', { orgId })) {
				ownOrgIds.push(orgId);
			}
		}
		const [anyRows, ownRows] = await Promise.all([
			anyOrgIds.length ? loadTickets({ orgIds: anyOrgIds }) : Promise.resolve([]),
			ownOrgIds.length
				? loadTickets({ orgIds: ownOrgIds, ownerUserId: locals.user.id })
				: Promise.resolve([])
		]);
		tickets = [...anyRows, ...ownRows];
	}

	const preferences = await getPreferences(locals.user.id);
	const savedView = (preferences.viewState?.tickets ?? {}) as Record<string, unknown>;

	return {
		tickets,
		canCreateTicket: await anyCreatePerm(locals, myOrgIds, trackrTeam),
		savedView
	};
};

async function anyCreatePerm(
	locals: Parameters<typeof can>[0],
	orgIds: string[],
	trackrTeam: boolean
): Promise<boolean> {
	if (trackrTeam) return true;
	for (const orgId of orgIds) {
		if (await can(locals, 'org.tickets.create', { orgId })) return true;
	}
	return false;
}

export const actions: Actions = {
	create: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());
		const me = locals.user;

		const form = await request.formData();
		const orgId = String(form.get('orgId') ?? '').trim();
		const subject = String(form.get('subject') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		const priority = String(form.get('priority') ?? 'medium');
		const category = String(form.get('category') ?? 'general');
		const channel = String(form.get('channel') ?? 'web_form');
		const customerIdRaw = String(form.get('customerId') ?? '').trim();
		const assignedAgentRaw = String(form.get('assignedAgentId') ?? '').trim();
		const tags = form
			.getAll('tags')
			.map((v) => String(v))
			.filter(Boolean);

		if (!orgId) return fail(400, { message: m.tickets_org_required() });
		if (!subject) return fail(400, { message: m.tickets_subject_required() });
		if (!TICKET_PRIORITY_SET.has(priority)) return fail(400, { message: m.tickets_invalid_priority() });
		if (!TICKET_CATEGORY_SET.has(category)) return fail(400, { message: m.tickets_invalid_category() });
		if (!TICKET_CHANNEL_SET.has(channel)) return fail(400, { message: m.tickets_invalid_channel() });

		await assertCan(locals, 'org.tickets.create', { orgId });

		// Verify the org exists (and isn't archived) before incrementing its
		// counter — failing the FK after the bump would leave a gap.
		const [orgRow] = await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.id, orgId))
			.limit(1);
		if (!orgRow) return fail(400, { message: m.tickets_org_not_found() });

		// Agents may set customer + assignee; clients always get customerId=self
		// and no assignee.
		const isAgent = await can(locals, 'org.tickets.edit.any', { orgId });
		const customerId = isAgent ? customerIdRaw || me.id : me.id;
		const assignedAgentId = isAgent && assignedAgentRaw ? assignedAgentRaw : null;

		try {
			const { id, displayId } = await createTicket({
				orgId,
				subject,
				description,
				priority: priority as TicketPriority,
				category: category as TicketCategory,
				channel: channel as TicketChannel,
				customerId,
				assignedAgentId,
				tags,
				createdBy: me.id
			});

			// Fan out: a `ticketCreated` notification to everyone allowed to see
			// the new ticket, and a separate `ticketAssigned` to the assignee if
			// one was set on create. Recipients scoped by ticketRecipients() —
			// clients of other orgs cannot appear in the set.
			const recipients = await ticketRecipients({
				orgId,
				customerId,
				assignedAgentId
			});
			await notify({
				kind: 'ticketCreated',
				recipients,
				actorId: me.id,
				orgId,
				render: (locale) => ({
					title: m.notify_ticket_created({ ref: displayId, subject }, { locale }),
					body: description
				}),
				url: `/tickets/${id}`,
				entity: { type: 'ticket', id },
				baseUrl: url.origin
			});
			if (assignedAgentId && assignedAgentId !== me.id) {
				await notify({
					kind: 'ticketAssigned',
					recipients: [assignedAgentId],
					actorId: me.id,
					orgId,
					render: (locale) => ({
						title: m.notify_ticket_assigned({ ref: displayId, subject }, { locale })
					}),
					url: `/tickets/${id}`,
					entity: { type: 'ticket', id },
					baseUrl: url.origin
				});
			}

			// Attach any files dropped on the create modal. Best-effort: the
			// ticket already exists, so a failed attachment is warned, not fatal.
			const { failed } = await attachFormFiles({
				files: form.getAll('attachments'),
				entityType: 'ticket',
				entityId: id,
				orgId,
				projectId: null,
				uploadedBy: me.id
			});

			return { ok: true, id, displayId, attachmentsFailed: failed };
		} catch (err) {
			const msg = err instanceof Error ? err.message : m.tickets_create_failed_server();
			return fail(500, { message: msg });
		}
	},

	update: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		if (!id) return fail(400, { message: m.tickets_id_required() });

		const orgId = await getTicketOrgId(id);
		if (!orgId) return fail(404, { message: m.tickets_not_found() });

		// Only agents can edit any. (read.own users could only edit own fields
		// before first response; v1 omits self-edit to keep scope tight.)
		await assertCan(locals, 'org.tickets.edit.any', { orgId });

		const patch: Parameters<typeof updateTicket>[1] = {};
		const subject = form.get('subject');
		if (typeof subject === 'string' && subject.trim()) patch.subject = subject.trim();
		const status = form.get('status');
		if (typeof status === 'string' && TICKET_STATUS_SET.has(status)) {
			patch.status = status as TicketStatus;
		}
		const priority = form.get('priority');
		if (typeof priority === 'string' && TICKET_PRIORITY_SET.has(priority)) {
			patch.priority = priority as TicketPriority;
		}
		const category = form.get('category');
		if (typeof category === 'string' && TICKET_CATEGORY_SET.has(category)) {
			patch.category = category as TicketCategory;
		}
		if (form.has('assignedAgentId')) {
			const v = String(form.get('assignedAgentId') ?? '').trim();
			patch.assignedAgentId = v || null;
		}
		const tags = form.getAll('tags');
		if (tags.length > 0) {
			patch.tags = tags.map((t) => String(t)).filter(Boolean);
		}

		const before = patch.assignedAgentId !== undefined ? await getTicket(id) : null;

		try {
			await updateTicket(id, patch);

			// Notify the *new* assignee if assignment changed to a real user
			// (not the actor themselves, not a no-op). The assignee is
			// trivially allowed to read the ticket, so no separate access check.
			if (
				before &&
				patch.assignedAgentId &&
				patch.assignedAgentId !== before.assignedAgentId &&
				patch.assignedAgentId !== locals.user!.id
			) {
				await notify({
					kind: 'ticketAssigned',
					recipients: [patch.assignedAgentId],
					actorId: locals.user!.id,
					orgId: before.orgId,
					render: (locale) => ({
						title: m.notify_ticket_assigned(
							{ ref: before.displayId, subject: before.subject },
							{ locale }
						)
					}),
					url: `/tickets/${id}`,
					entity: { type: 'ticket', id },
					baseUrl: url.origin
				});
			}
			return { ok: true };
		} catch (err) {
			const msg = err instanceof Error ? err.message : m.tickets_update_failed_server();
			return fail(500, { message: msg });
		}
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		if (!id) return fail(400, { message: m.tickets_id_required() });

		const orgId = await getTicketOrgId(id);
		if (!orgId) return fail(404, { message: m.tickets_not_found() });

		// Administrational: only the internal admin roles hold this grant.
		await assertCan(locals, 'org.tickets.delete.any', { orgId });

		try {
			await softDeleteTicket(id);
			// The ticket's read paths are now closed, so its attachments are
			// already unreachable; remove their files (ticket-level + per-message)
			// to reclaim disk.
			await deleteAttachmentsFor('ticket', id);
			const msgs = await db
				.select({ id: ticketMessage.id })
				.from(ticketMessage)
				.where(eq(ticketMessage.ticketId, id));
			for (const m of msgs) await deleteAttachmentsFor('ticket_message', m.id);
			return { ok: true };
		} catch (err) {
			const msg = err instanceof Error ? err.message : m.tickets_delete_failed_server();
			return fail(500, { message: msg });
		}
	},

	message: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());
		const me = locals.user;

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const internal = form.get('internal') === '1';

		if (!id) return fail(400, { message: m.tickets_id_required() });
		if (!body) return fail(400, { message: m.tickets_message_required() });

		const orgId = await getTicketOrgId(id);
		if (!orgId) return fail(404, { message: m.tickets_not_found() });

		if (internal) {
			// Internal notes are agents-only.
			await assertCan(locals, 'org.tickets.edit.any', { orgId });
		} else {
			await assertCan(locals, 'org.tickets.comment', { orgId });
		}

		const authorIsAgent = await can(locals, 'org.tickets.edit.any', { orgId });

		try {
			const { id: messageId } = await addTicketMessage({
				ticketId: id,
				authorId: me.id,
				body,
				isInternalNote: internal,
				authorIsAgent
			});

			// Attach any files staged on the composer to the new message.
			await attachFormFiles({
				files: form.getAll('attachments'),
				entityType: 'ticket_message',
				entityId: messageId,
				orgId,
				projectId: null,
				uploadedBy: me.id
			});

			const t = await getTicket(id);
			if (t) {
				const recipients = await ticketRecipients(
					{
						orgId: t.orgId,
						customerId: t.customerId,
						assignedAgentId: t.assignedAgentId
					},
					{ internalOnly: internal }
				);
				await notify({
					kind: 'ticketMessage',
					recipients,
					actorId: me.id,
					orgId: t.orgId,
					render: (locale) => ({
						title: internal
							? m.notify_ticket_internal_note({ ref: t.displayId }, { locale })
							: m.notify_ticket_message({ ref: t.displayId, subject: t.subject }, { locale }),
						body: body.slice(0, 280)
					}),
					url: `/tickets/${id}`,
					entity: { type: 'ticket', id },
					baseUrl: url.origin
				});
			}

			return { ok: true };
		} catch (err) {
			const msg = err instanceof Error ? err.message : m.tickets_post_message_failed();
			return fail(500, { message: msg });
		}
	},

	pinAdd: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		if (!id) return fail(400, { message: m.tickets_id_required() });
		// Only pin tickets the user can actually see.
		const orgId = await getTicketOrgId(id);
		if (!orgId) return fail(404, { message: m.tickets_not_found() });
		const allowed =
			(await can(locals, 'org.tickets.read.any', { orgId })) ||
			(await can(locals, 'org.tickets.read.own', { orgId }));
		if (!allowed) return fail(403, { message: m.tickets_cannot_pin() });
		await db
			.insert(ticketFavorite)
			.values({ userId: locals.user.id, ticketId: id })
			.onConflictDoNothing();
		return { ok: true };
	},

	pinRemove: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		if (!id) return fail(400, { message: m.tickets_id_required() });
		await db
			.delete(ticketFavorite)
			.where(and(eq(ticketFavorite.userId, locals.user.id), eq(ticketFavorite.ticketId, id)));
		return { ok: true };
	}
};

async function getTicketOrgId(ticketId: string): Promise<string | null> {
	const [row] = await db
		.select({ orgId: ticket.orgId })
		.from(ticket)
		.where(and(eq(ticket.id, ticketId), isNull(ticket.deletedAt)))
		.limit(1);
	return row?.orgId ?? null;
}
