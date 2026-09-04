// Ticket detail for the app.
//   GET   — ticket + full message timeline (internal notes only for staff),
//           with ticket-level `attachments` and per-message `attachments`;
//           agents also get the assignable-users picker directory.
//   PATCH { status?, priority?, category?, assigneeIds?, tags? } — the
//   property-pill and tag edits the app offers. Checklist/subject stay a
//   desktop concern.
import { listAttachments, listAttachmentsForMany } from '$lib/server/attachments';
import { canViewTicket, can, isTrackrTeam } from '$lib/server/permissions';
import {
	applyTicketUpdate,
	deleteTicketFully,
	getTicket,
	loadAssignableUsers,
	loadTicketDisplayUsers,
	loadTicketMessages
} from '$lib/server/tickets';
import { listLinkedTasks } from '$lib/server/tasks';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	requireUser(locals);
	const ticket = await getTicket(params.id);
	if (!ticket) apiError(404, m.tickets_not_found());
	if (!(await canViewTicket(locals, ticket))) apiError(403, m.tickets_no_access());

	const staff = isTrackrTeam(locals);
	const rawMessages = await loadTicketMessages(ticket.id, { includeInternal: staff });
	// Attachments: ticket-level plus per-message in two batched queries, so the
	// app can render them without an N+1 round-trip. Ticket messages live in the
	// shared `message` table (thread subjectType 'ticket'), so their attachments
	// are keyed by entity type 'message' — same as the web detail page.
	const [attachments, messageAttachments] = await Promise.all([
		listAttachments('ticket', ticket.id),
		listAttachmentsForMany(
			'message',
			rawMessages.map((msg) => msg.id)
		)
	]);
	const messages = rawMessages.map((msg) => ({
		...msg,
		attachments: messageAttachments.get(msg.id) ?? []
	}));
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
	// Tasks converted from this ticket — internal back-links, staff-only.
	const linkedTasks = staff ? await listLinkedTasks(ticket.id) : [];

	return json({
		ticket,
		attachments,
		messages,
		authors,
		assignableUsers,
		canEdit,
		canComment,
		canInternalNote: staff,
		linkedTasks
	});
};

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	requireUser(locals);
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
		tags?: string[];
	}>(request);
	// Only the fields this endpoint documents are forwarded; the diff, timeline
	// events, notifications and audit live in applyTicketUpdate (shared with MCP).
	const result = await applyTicketUpdate(
		locals,
		ticket.id,
		{
			status: body.status,
			priority: body.priority,
			category: body.category,
			assigneeIds: body.assigneeIds,
			tags: body.tags
		},
		{ origin: url.origin, via: 'api.v1' }
	);
	if (!result.changed) return json({ ok: true, unchanged: true });
	return json({ ok: true, ticket: result.ticket });
};

// Soft delete, mirroring the web `delete` action: org.tickets.delete.any
// (internal admin roles only), deletedAt stamp via softDeleteTicket, then
// attachment cleanup and an audit entry — all inside deleteTicketFully.
export const DELETE: RequestHandler = async ({ locals, params, url }) => {
	requireUser(locals);
	await deleteTicketFully(locals, params.id, { origin: url.origin, via: 'api.v1' });
	return json({ ok: true });
};
