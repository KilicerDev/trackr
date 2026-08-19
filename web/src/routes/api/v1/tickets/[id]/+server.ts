// Ticket detail for the app.
//   GET   — ticket + full message timeline (internal notes only for staff);
//           agents also get the assignable-users picker directory.
//   PATCH { status?, priority?, category?, assigneeIds? } — the property-pill
//   edits the app offers. Tags/checklist/subject stay a desktop concern.
import { canViewTicket, can, isTrackrTeam } from '$lib/server/permissions';
import {
	addTicketSystemEvents,
	getTicket,
	loadAssignableUsers,
	loadTicketDisplayUsers,
	loadTicketMessages,
	updateTicket,
	TICKET_CATEGORY_SET,
	TICKET_PRIORITY_SET,
	TICKET_STATUS_SET,
	type TicketCategory,
	type TicketEventMeta,
	type TicketPriority,
	type TicketStatus
} from '$lib/server/tickets';
import { notifyTicketUpdated } from '$lib/server/notify/events/ticket';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	requireUser(locals);
	const ticket = await getTicket(params.id);
	if (!ticket) apiError(404, m.tickets_not_found());
	if (!(await canViewTicket(locals, ticket))) apiError(403, m.tickets_no_access());

	const staff = isTrackrTeam(locals);
	const messages = await loadTicketMessages(ticket.id, { includeInternal: staff });
	// Same grant as PATCH below and the web update action — plain org.staff
	// reads everything but must not be offered status/assignee controls.
	const canEdit = await can(locals, 'org.tickets.edit.any', { orgId: ticket.orgId });
	const canComment = canEdit || (await can(locals, 'org.tickets.comment', { orgId: ticket.orgId }));
	// Display directory (name + color only, emails stripped) so the app can
	// label message authors without a users endpoint.
	const users = await loadTicketDisplayUsers([
		ticket.customerId,
		ticket.createdBy,
		...ticket.assignees,
		...messages.map((msg) => msg.authorId)
	]);
	const authors = Object.fromEntries(users.map((u) => [u.id, { name: u.name, color: u.color }]));
	// Agents get the assignee picker candidates (name + color only) — same
	// scoping as the web Inspector's picker.
	const assignableUsers = canEdit
		? (await loadAssignableUsers([ticket.orgId])).map((u) => ({
				id: u.id,
				name: u.name,
				color: u.color
			}))
		: [];
	return json({
		ticket,
		messages,
		authors,
		assignableUsers,
		canEdit,
		canComment,
		canInternalNote: staff
	});
};

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	const user = requireUser(locals);
	const ticket = await getTicket(params.id);
	if (!ticket) apiError(404, m.tickets_not_found());
	// Status/assignment are agent actions — same grant as the web update action.
	if (!(await can(locals, 'org.tickets.edit.any', { orgId: ticket.orgId }))) {
		apiError(403, m.tickets_no_access());
	}

	const body = await readJson<{
		status?: string;
		priority?: string;
		category?: string;
		assigneeIds?: string[];
	}>(request);
	const events: { meta: TicketEventMeta; internal: boolean }[] = [];
	const patch: {
		status?: TicketStatus;
		priority?: TicketPriority;
		category?: TicketCategory;
		assigneeIds?: string[];
	} = {};

	if (body.status !== undefined) {
		if (!TICKET_STATUS_SET.has(body.status)) apiError(400, 'Invalid status.');
		if (body.status !== ticket.status) {
			patch.status = body.status as TicketStatus;
			events.push({
				meta: { event: 'status_changed', from: ticket.status, to: body.status },
				internal: false
			});
		}
	}
	if (body.priority !== undefined) {
		if (!TICKET_PRIORITY_SET.has(body.priority)) apiError(400, 'Invalid priority.');
		if (body.priority !== ticket.priority) {
			patch.priority = body.priority as TicketPriority;
			events.push({
				meta: { event: 'priority_changed', from: ticket.priority, to: body.priority },
				internal: false
			});
		}
	}
	if (body.category !== undefined) {
		if (!TICKET_CATEGORY_SET.has(body.category)) apiError(400, 'Invalid category.');
		if (body.category !== ticket.category) {
			patch.category = body.category as TicketCategory;
			events.push({
				meta: { event: 'category_changed', from: ticket.category, to: body.category },
				internal: false
			});
		}
	}
	if (body.assigneeIds !== undefined) {
		if (!Array.isArray(body.assigneeIds) || body.assigneeIds.some((x) => typeof x !== 'string')) {
			apiError(400, 'assigneeIds must be a string array.');
		}
		const next = [...new Set(body.assigneeIds)];
		// Never trust posted ids — same boundary as the web update action.
		if (next.length) {
			const allowed = new Set((await loadAssignableUsers([ticket.orgId])).map((u) => u.id));
			if (!next.every((id) => allowed.has(id))) apiError(400, 'Invalid assignee.');
		}
		const prev = new Set(ticket.assignees);
		const added = next.filter((id) => !prev.has(id));
		const removed = ticket.assignees.filter((id) => !next.includes(id));
		if (added.length || removed.length) {
			patch.assigneeIds = next;
			events.push({ meta: { event: 'assigned', added, removed }, internal: false });
		}
	}

	if (Object.keys(patch).length === 0) return json({ ok: true, unchanged: true });

	await updateTicket(ticket.id, patch);
	await addTicketSystemEvents(ticket.id, user.id, events);

	// Notifications mirror the web update action (minus priority, which the
	// app's pill editor treats as a silent triage edit): newly-added assignees
	// and status changes, fanned out by the shared event helper.
	await notifyTicketUpdated({
		ticket: {
			id: ticket.id,
			displayId: ticket.displayId,
			orgId: ticket.orgId,
			subject: ticket.subject,
			customerId: ticket.customerId,
			creatorId: ticket.createdBy,
			assigneeIds: patch.assigneeIds ?? ticket.assignees
		},
		addedAssigneeIds: (patch.assigneeIds ?? []).filter((id) => !ticket.assignees.includes(id)),
		newStatus: (patch.status as TicketStatus | undefined) ?? null,
		newPriority: null,
		actorId: user.id,
		origin: url.origin
	});
	void recordAudit({
		type: 'ticket.update',
		actorId: user.id,
		targetType: 'ticket',
		targetId: ticket.id,
		targetLabel: `${ticket.displayId} · ${ticket.subject}`,
		orgId: ticket.orgId,
		meta: { fields: Object.keys(patch), via: 'api.v1' }
	});

	const fresh = await getTicket(ticket.id);
	return json({ ok: true, ticket: fresh });
};
