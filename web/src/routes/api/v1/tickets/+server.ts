// Tickets for the app.
//   GET  ?segment=mine|watched|all&status=<status>  — segmented list (the app's
//        "Für mich / Beobachtet / Alle" control). `mine` = customer, creator or
//        assignee; `watched` = pinned; `all` = everything the role can read.
//   POST { orgId, subject, description? }           — quick-create (one-field;
//        details are edited on the desktop later).
// Reuses loadTickets/createTicket and the exact org-split scoping of the
// web tickets page.
import { can, isTrackrTeam } from '$lib/server/permissions';
import {
	createTicket,
	loadTicketDisplayUsers,
	loadTickets,
	TICKET_STATUS_SET,
	type TicketRow
} from '$lib/server/tickets';
import { notifyTicketCreated } from '$lib/server/notify/events/ticket';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

// The read.any/read.own org split, shared by `all` scoping here and by the
// detail endpoint's visibility check (via canViewTicket there).
async function loadAccessibleTickets(
	locals: App.Locals,
	extra: { ownerUserId?: string; pinnedByUserId?: string } = {}
): Promise<TicketRow[]> {
	if (isTrackrTeam(locals)) {
		return loadTickets({ includeInternalMessages: true, ...extra });
	}
	const myOrgIds = (locals.memberships?.orgs ?? []).map((o) => o.orgId);
	if (myOrgIds.length === 0) return [];
	const anyOrgIds: string[] = [];
	const ownOrgIds: string[] = [];
	for (const orgId of myOrgIds) {
		if (await can(locals, 'org.tickets.read.any', { orgId })) anyOrgIds.push(orgId);
		else if (await can(locals, 'org.tickets.read.own', { orgId })) ownOrgIds.push(orgId);
	}
	const uid = locals.user!.id;
	const [anyRows, ownRows] = await Promise.all([
		anyOrgIds.length ? loadTickets({ orgIds: anyOrgIds, ...extra }) : Promise.resolve([]),
		ownOrgIds.length
			? loadTickets({ orgIds: ownOrgIds, ...extra, ownerUserId: uid })
			: Promise.resolve([])
	]);
	return [...anyRows, ...ownRows];
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireUser(locals);
	const segment = url.searchParams.get('segment') ?? 'mine';
	const status = url.searchParams.get('status');

	let tickets: TicketRow[];
	if (segment === 'mine') {
		// ownerUserId already means "customer, creator or assignee".
		tickets = await loadAccessibleTickets(locals, { ownerUserId: user.id });
	} else if (segment === 'watched') {
		tickets = await loadAccessibleTickets(locals, { pinnedByUserId: user.id });
	} else if (segment === 'all') {
		tickets = await loadAccessibleTickets(locals);
	} else {
		apiError(400, 'Invalid segment.');
	}

	if (status && TICKET_STATUS_SET.has(status)) {
		tickets = tickets.filter((t) => t.status === status);
	}
	// Most recent activity first — the mobile list is a feed, not a board.
	tickets.sort((a, b) =>
		(b.lastMessageAt ?? b.updatedAt).localeCompare(a.lastMessageAt ?? a.updatedAt)
	);
	// Display directory (name + color only) for customers/assignees — same
	// contract as the tasks list's `users` map.
	const displayUsers = await loadTicketDisplayUsers(
		tickets.flatMap((t) => [t.customerId, t.createdBy, ...t.assignees])
	);
	const users = Object.fromEntries(
		displayUsers.map((u) => [u.id, { name: u.name, color: u.color }])
	);
	return json({ tickets, users });
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
	const user = requireUser(locals);
	const body = await readJson<{ orgId?: string; subject?: string; description?: string }>(request);
	const orgId = body.orgId?.trim();
	const subject = body.subject?.trim();
	if (!orgId) apiError(400, m.tickets_org_required());
	if (!subject) apiError(400, m.tickets_subject_required());
	if (!(await can(locals, 'org.tickets.create', { orgId }))) {
		apiError(403, m.tickets_no_access());
	}

	// Mirrors the web create action: agents may leave the ticket unassigned;
	// everyone else becomes the customer.
	const isAgent = await can(locals, 'org.tickets.edit.any', { orgId });
	const created = await createTicket({
		orgId,
		subject,
		description: body.description?.trim() || null,
		priority: 'medium',
		category: 'general',
		channel: 'api',
		customerId: isAgent ? null : user.id,
		assigneeIds: [],
		tags: [],
		createdBy: user.id
	});

	await notifyTicketCreated({
		ticket: {
			id: created.id,
			displayId: created.displayId,
			orgId,
			subject,
			customerId: isAgent ? null : user.id,
			creatorId: user.id,
			assigneeIds: [],
			status: 'open',
			priority: 'medium'
		},
		description: body.description?.slice(0, 280) ?? null,
		actor: { id: user.id, name: user.name },
		origin: url.origin
	});
	void recordAudit({
		type: 'ticket.create',
		actorId: user.id,
		targetType: 'ticket',
		targetId: created.id,
		targetLabel: `${created.displayId} · ${subject}`,
		orgId
	});

	return json({ id: created.id, displayId: created.displayId }, { status: 201 });
};
