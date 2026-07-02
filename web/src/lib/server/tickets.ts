import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { organization, organizationMember, ticket, message, thread } from './db/app.schema';
import { user as userTable } from './db/auth.schema';
import { ticketRecipients } from './notify/recipients';

export const TICKET_STATUSES = [
	'open',
	'in_progress',
	'waiting_on_customer',
	'waiting_on_agent',
	'paused',
	'resolved',
	'closed'
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS_SET = new Set<string>(TICKET_STATUSES);

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export const TICKET_PRIORITY_SET = new Set<string>(TICKET_PRIORITIES);

export const TICKET_CATEGORIES = [
	'billing',
	'technical_issue',
	'feature_request',
	'general'
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export const TICKET_CATEGORY_SET = new Set<string>(TICKET_CATEGORIES);

export const TICKET_CHANNELS = ['email', 'api', 'chat', 'web_form'] as const;
export type TicketChannel = (typeof TICKET_CHANNELS)[number];
export const TICKET_CHANNEL_SET = new Set<string>(TICKET_CHANNELS);

// Shape exposed to the UI. Flat-ish so list/inspector components don't need
// to chase relations.
export type TicketRow = {
	id: string;
	orgId: string;
	orgSlug: string;
	orgName: string;
	orgColor: string;
	number: number;
	displayId: string;
	subject: string;
	description: string | null;
	status: TicketStatus;
	priority: TicketPriority;
	category: TicketCategory;
	channel: TicketChannel;
	customerId: string | null;
	assignedAgentId: string | null;
	createdBy: string | null;
	firstResponseAt: string | null;
	resolvedAt: string | null;
	closedAt: string | null;
	satisfactionScore: number | null;
	tags: string[];
	checklist: { id: string; text: string; done: boolean }[];
	messageCount: number;
	lastMessageAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type TicketMessageRow = {
	id: string;
	ticketId: string;
	authorId: string | null;
	body: string;
	isInternalNote: boolean;
	createdAt: string;
	updatedAt: string;
};

// pg returns timestamps as strings for some aggregate columns (depends on the
// driver / type parsers). Drizzle's `sql<Date>` is just a type assertion, so
// we coerce defensively here rather than trusting the type.
function toIso(v: unknown): string | null {
	if (v == null) return null;
	if (v instanceof Date) return v.toISOString();
	if (typeof v === 'string') {
		const d = new Date(v);
		return Number.isNaN(d.getTime()) ? null : d.toISOString();
	}
	return null;
}

export function ticketDisplayId(slug: string | null, isInternal: boolean, n: number): string {
	if (isInternal) return `T-${n}`;
	const upper = (slug ?? 'ORG').toUpperCase().replace(/[^A-Z0-9]/g, '');
	return `${upper}-T-${n}`;
}
// Local alias kept so existing call sites in this module read unchanged.
const displayId = ticketDisplayId;

type AccessOpts = {
	// When set, restrict to these org ids. Null/undefined means no org filter
	// (use for Trackr-internal staff that see everything).
	orgIds?: string[];
	// When set, restrict to tickets where the user is customer or assignee.
	// Used for OrgClient role (read.own).
	ownerUserId?: string;
	// When set, restrict to tickets this user has pinned (ticket_favorite).
	pinnedByUserId?: string;
	// When set, cap the number of rows (newest-first). Used for the portal
	// "Recents" list.
	limit?: number;
};

export async function loadTickets(opts: AccessOpts = {}): Promise<TicketRow[]> {
	if (opts.orgIds && opts.orgIds.length === 0) return [];

	const conditions = [isNull(ticket.deletedAt)];
	if (opts.orgIds) conditions.push(inArray(ticket.orgId, opts.orgIds));
	if (opts.ownerUserId) {
		conditions.push(
			sql`(${ticket.customerId} = ${opts.ownerUserId} OR ${ticket.assignedAgentId} = ${opts.ownerUserId})`
		);
	}
	if (opts.pinnedByUserId) {
		conditions.push(
			sql`EXISTS (SELECT 1 FROM ticket_favorite tf WHERE tf.ticket_id = ${ticket.id} AND tf.user_id = ${opts.pinnedByUserId})`
		);
	}

	let q = db
		.select({
			t: ticket,
			orgSlug: organization.slug,
			orgName: organization.name,
			orgColor: organization.color,
			orgInternal: organization.isInternal
		})
		.from(ticket)
		.innerJoin(organization, eq(organization.id, ticket.orgId))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(ticket.updatedAt))
		.$dynamic();
	if (opts.limit && opts.limit > 0) q = q.limit(opts.limit);
	const rows = await q;

	const ids = rows.map((r) => r.t.id);
	const counts = new Map<string, { count: number; last: string | null }>();
	if (ids.length) {
		const msgRows = await db
			.select({
				ticketId: thread.subjectId,
				count: sql<number>`count(*)::int`,
				last: sql<string | null>`max(${message.createdAt})`
			})
			.from(message)
			.innerJoin(thread, eq(thread.id, message.threadId))
			.where(
				and(
					eq(thread.subjectType, 'ticket'),
					inArray(thread.subjectId, ids),
					isNull(message.deletedAt)
				)
			)
			.groupBy(thread.subjectId);
		for (const m of msgRows) {
			counts.set(m.ticketId, { count: Number(m.count), last: toIso(m.last) });
		}
	}

	return rows.map((r) => {
		const t = r.t;
		const mc = counts.get(t.id);
		return {
			id: t.id,
			orgId: t.orgId,
			orgSlug: r.orgSlug,
			orgName: r.orgName,
			orgColor: r.orgColor,
			number: t.number,
			displayId: displayId(r.orgSlug, r.orgInternal, t.number),
			subject: t.subject,
			description: t.description,
			status: t.status as TicketStatus,
			priority: t.priority as TicketPriority,
			category: t.category as TicketCategory,
			channel: t.channel as TicketChannel,
			customerId: t.customerId,
			assignedAgentId: t.assignedAgentId,
			createdBy: t.createdBy,
			firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
			resolvedAt: t.resolvedAt?.toISOString() ?? null,
			closedAt: t.closedAt?.toISOString() ?? null,
			satisfactionScore: t.satisfactionScore,
			tags: t.tags,
			checklist: t.checklist ?? [],
			messageCount: mc?.count ?? 0,
			lastMessageAt: mc?.last ?? null,
			createdAt: t.createdAt.toISOString(),
			updatedAt: t.updatedAt.toISOString()
		};
	});
}

export async function loadTicketMessages(
	ticketId: string,
	opts: { includeInternal: boolean }
): Promise<TicketMessageRow[]> {
	const conditions = [
		eq(thread.subjectType, 'ticket'),
		eq(thread.subjectId, ticketId),
		isNull(message.deletedAt)
	];
	if (!opts.includeInternal) {
		conditions.push(eq(message.internal, false));
	}
	const rows = await db
		.select({
			id: message.id,
			authorId: message.authorId,
			body: message.body,
			internal: message.internal,
			createdAt: message.createdAt,
			updatedAt: message.updatedAt
		})
		.from(message)
		.innerJoin(thread, eq(thread.id, message.threadId))
		.where(and(...conditions))
		.orderBy(message.createdAt);
	return rows.map((m) => ({
		id: m.id,
		ticketId,
		authorId: m.authorId,
		body: m.body,
		isInternalNote: m.internal,
		createdAt: m.createdAt.toISOString(),
		updatedAt: m.updatedAt.toISOString()
	}));
}

type CreateTicketInput = {
	orgId: string;
	subject: string;
	description: string | null;
	priority: TicketPriority;
	category: TicketCategory;
	channel: TicketChannel;
	customerId: string | null;
	assignedAgentId: string | null;
	tags: string[];
	createdBy: string;
	// Set when the ticket originates from a chat thread (create-ticket-from-thread
	// flow). Back-links the ticket to its source conversation.
	sourceThreadId?: string | null;
};

export async function createTicket(input: CreateTicketInput): Promise<{
	id: string;
	number: number;
	displayId: string;
}> {
	const id = crypto.randomUUID();
	let number = 0;
	let display = '';

	await db.transaction(async (tx) => {
		const [bumped] = await tx
			.update(organization)
			.set({ nextTicketNumber: sql`${organization.nextTicketNumber} + 1` })
			.where(eq(organization.id, input.orgId))
			.returning({
				next: organization.nextTicketNumber,
				slug: organization.slug,
				isInternal: organization.isInternal
			});
		if (!bumped) throw new Error('Organization not found');
		number = bumped.next - 1;
		display = displayId(bumped.slug, bumped.isInternal, number);

		await tx.insert(ticket).values({
			id,
			orgId: input.orgId,
			number,
			subject: input.subject,
			description: input.description,
			status: 'open',
			priority: input.priority,
			category: input.category,
			channel: input.channel,
			customerId: input.customerId,
			assignedAgentId: input.assignedAgentId,
			createdBy: input.createdBy,
			tags: input.tags,
			sourceThreadId: input.sourceThreadId ?? null
		});
	});

	return { id, number, displayId: display };
}

type UpdateTicketInput = {
	subject?: string;
	status?: TicketStatus;
	priority?: TicketPriority;
	category?: TicketCategory;
	assignedAgentId?: string | null;
	satisfactionScore?: number | null;
	tags?: string[];
	checklist?: { id: string; text: string; done: boolean }[];
};

// Centralizes the resolved/closed timestamp bookkeeping that the auto-
// transition helper also depends on.
export async function updateTicket(ticketId: string, patch: UpdateTicketInput): Promise<void> {
	const fields: Record<string, unknown> = {};
	if (patch.subject !== undefined) fields.subject = patch.subject;
	if (patch.priority !== undefined) fields.priority = patch.priority;
	if (patch.category !== undefined) fields.category = patch.category;
	if (patch.assignedAgentId !== undefined) fields.assignedAgentId = patch.assignedAgentId;
	if (patch.satisfactionScore !== undefined) fields.satisfactionScore = patch.satisfactionScore;
	if (patch.tags !== undefined) fields.tags = patch.tags;
	if (patch.checklist !== undefined) fields.checklist = patch.checklist;
	if (patch.status !== undefined) {
		fields.status = patch.status;
		if (patch.status === 'resolved') fields.resolvedAt = new Date();
		if (patch.status === 'closed') fields.closedAt = new Date();
		// Re-opening clears the stamps so they reflect the most recent close.
		if (patch.status === 'open' || patch.status === 'in_progress') {
			fields.resolvedAt = null;
			fields.closedAt = null;
		}
	}
	if (Object.keys(fields).length === 0) return;
	await db.update(ticket).set(fields).where(eq(ticket.id, ticketId));
}

type AddMessageInput = {
	ticketId: string;
	authorId: string;
	body: string;
	isInternalNote: boolean;
	// Whether the author is an agent (internal Trackr staff). Drives the
	// auto-transition rules below.
	authorIsAgent: boolean;
};

// Adds a message. Public replies bump `updatedAt` (so the portal "Recents"
// list reflects conversation activity) and stamp `first_response_at` on the
// first agent reply for response-time metrics. Replies do NOT auto-transition
// the ticket status — agents move status manually via the picker.
export async function addTicketMessage(input: AddMessageInput): Promise<{ id: string }> {
	const id = crypto.randomUUID();
	await db.transaction(async (tx) => {
		// Get-or-create the ticket's thread (the backfill made one per existing
		// ticket; new tickets create theirs lazily on first message).
		let [th] = await tx
			.select({ id: thread.id })
			.from(thread)
			.where(and(eq(thread.subjectType, 'ticket'), eq(thread.subjectId, input.ticketId)))
			.limit(1);
		if (!th) {
			const tid = crypto.randomUUID();
			await tx.insert(thread).values({ id: tid, subjectType: 'ticket', subjectId: input.ticketId });
			th = { id: tid };
		}
		await tx.insert(message).values({
			id,
			threadId: th.id,
			authorId: input.authorId,
			body: input.body,
			internal: input.isInternalNote
		});

		if (input.isInternalNote) return;

		const [t] = await tx
			.select({ firstResponseAt: ticket.firstResponseAt })
			.from(ticket)
			.where(eq(ticket.id, input.ticketId))
			.limit(1);
		if (!t) return;

		// Bump updatedAt so the portal "Recents" list reflects conversation
		// activity, and stamp the first agent reply for response-time metrics.
		// No status transition — status is changed manually only.
		const fields: Record<string, unknown> = { updatedAt: new Date() };
		if (input.authorIsAgent && !t.firstResponseAt) fields.firstResponseAt = new Date();
		await tx.update(ticket).set(fields).where(eq(ticket.id, input.ticketId));
	});
	return { id };
}

// Soft delete: stamps deleted_at so the ticket drops out of every read path.
// Messages stay in place (cascade only fires on a hard row delete), which keeps
// the record recoverable. No-op if the ticket is already gone.
export async function softDeleteTicket(ticketId: string): Promise<void> {
	await db
		.update(ticket)
		.set({ deletedAt: new Date() })
		.where(and(eq(ticket.id, ticketId), isNull(ticket.deletedAt)));
}

// Mirror checklist completion from a converted task back onto its source ticket.
// Items carried over at conversion keep the same id on both sides, so we match
// by id and copy the done-state across. Items the task added later (new ids) and
// ticket-only items are left untouched. No-op when nothing matches or changed.
export async function syncTicketChecklistFromTask(
	ticketId: string,
	taskChecklist: { id: string; done: boolean }[]
): Promise<void> {
	const doneById = new Map(taskChecklist.map((i) => [i.id, i.done]));
	const [row] = await db
		.select({ checklist: ticket.checklist })
		.from(ticket)
		.where(and(eq(ticket.id, ticketId), isNull(ticket.deletedAt)))
		.limit(1);
	if (!row) return;
	let changed = false;
	const next = (row.checklist ?? []).map((it) => {
		const done = doneById.get(it.id);
		if (done !== undefined && done !== it.done) {
			changed = true;
			return { ...it, done };
		}
		return it;
	});
	if (changed) await db.update(ticket).set({ checklist: next }).where(eq(ticket.id, ticketId));
}

export async function getTicket(ticketId: string): Promise<TicketRow | null> {
	const [row] = await db
		.select({
			t: ticket,
			orgSlug: organization.slug,
			orgName: organization.name,
			orgColor: organization.color,
			orgInternal: organization.isInternal
		})
		.from(ticket)
		.innerJoin(organization, eq(organization.id, ticket.orgId))
		.where(and(eq(ticket.id, ticketId), isNull(ticket.deletedAt)))
		.limit(1);
	if (!row) return null;
	const t = row.t;
	const [mc] = await db
		.select({
			count: sql<number>`count(*)::int`,
			last: sql<string | null>`max(${message.createdAt})`
		})
		.from(message)
		.innerJoin(thread, eq(thread.id, message.threadId))
		.where(
			and(
				eq(thread.subjectType, 'ticket'),
				eq(thread.subjectId, ticketId),
				isNull(message.deletedAt)
			)
		);
	return {
		id: t.id,
		orgId: t.orgId,
		orgSlug: row.orgSlug,
		orgName: row.orgName,
		orgColor: row.orgColor,
		number: t.number,
		displayId: displayId(row.orgSlug, row.orgInternal, t.number),
		subject: t.subject,
		description: t.description,
		status: t.status as TicketStatus,
		priority: t.priority as TicketPriority,
		category: t.category as TicketCategory,
		channel: t.channel as TicketChannel,
		customerId: t.customerId,
		assignedAgentId: t.assignedAgentId,
		createdBy: t.createdBy,
		firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
		resolvedAt: t.resolvedAt?.toISOString() ?? null,
		closedAt: t.closedAt?.toISOString() ?? null,
		satisfactionScore: t.satisfactionScore,
		tags: t.tags,
		checklist: t.checklist ?? [],
		messageCount: Number(mc?.count ?? 0),
		lastMessageAt: toIso(mc?.last ?? null),
		createdAt: t.createdAt.toISOString(),
		updatedAt: t.updatedAt.toISOString()
	};
}

// ─── Assignable users ──────────────────────────────────────────────────────
// Who may be assigned a ticket: every member of the requested org(s) — clients,
// agents and members — plus every internal Trackr-team member (the platform
// agents). Deduped; banned accounts excluded. Each row carries the requested
// org ids it belongs to so the list-view picker can scope candidates to a
// single selected ticket's org, while `internal` flags the platform agents
// (who are assignable on every ticket regardless of org).

export type AssignableUser = {
	id: string;
	name: string;
	email: string;
	initials: string;
	color: string;
	status: 'active';
	internal: boolean;
	orgIds: string[];
};

function assigneeInitials(name: string): string {
	return name
		.split(/\s+/)
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase();
}
function assigneeColor(id: string): string {
	let h = 0;
	for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return `hsl(${h % 360} 55% 60%)`;
}

export async function loadAssignableUsers(orgIds: string[]): Promise<AssignableUser[]> {
	// Internal Trackr orgs — their members are platform agents, always assignable.
	const internalOrgRows = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.isInternal, true));
	const internalOrgIds = internalOrgRows.map((r) => r.id);
	const scopeOrgIds = [...new Set([...orgIds, ...internalOrgIds])];
	if (scopeOrgIds.length === 0) return [];

	const rows = await db
		.select({
			userId: organizationMember.userId,
			orgId: organizationMember.orgId,
			name: userTable.name,
			email: userTable.email,
			banned: userTable.banned
		})
		.from(organizationMember)
		.innerJoin(userTable, eq(userTable.id, organizationMember.userId))
		.where(inArray(organizationMember.orgId, scopeOrgIds));

	const internalSet = new Set(internalOrgIds);
	const requested = new Set(orgIds);
	const byUser = new Map<string, AssignableUser>();
	for (const r of rows) {
		if (r.banned) continue;
		const name = r.name ?? r.email;
		let u = byUser.get(r.userId);
		if (!u) {
			u = {
				id: r.userId,
				name,
				email: r.email,
				initials: assigneeInitials(name),
				color: assigneeColor(r.userId),
				status: 'active',
				internal: false,
				orgIds: []
			};
			byUser.set(r.userId, u);
		}
		if (internalSet.has(r.orgId)) u.internal = true;
		// Only the requested (ticket) orgs are surfaced in `orgIds`; the internal
		// org id stays an implementation detail — `internal` already marks them.
		if (requested.has(r.orgId) && !u.orgIds.includes(r.orgId)) u.orgIds.push(r.orgId);
	}
	return [...byUser.values()];
}

// @-mention directory for a ticket's conversation composer: everyone in the
// ticket's notify audience — org agents/admins (read.any), internal platform
// staff, the customer, and the assigned agent. Mirrors `ticketRecipients` (the
// public-message variant), so the dropdown only offers people the server will
// actually deliver a mention to. The customer is included here; for an internal
// note the post action re-intersects with the internal-only audience, so a
// customer mention is silently dropped (and they never see the note anyway).
export async function loadTicketMentionUsers(ticket: {
	orgId: string;
	customerId: string | null;
	assignedAgentId: string | null;
}): Promise<AssignableUser[]> {
	const audience = await ticketRecipients({
		orgId: ticket.orgId,
		customerId: ticket.customerId,
		assignedAgentId: ticket.assignedAgentId
	});
	const ids = [...audience];
	if (ids.length === 0) return [];

	const [rows, internalRows] = await Promise.all([
		db
			.select({
				id: userTable.id,
				name: userTable.name,
				email: userTable.email,
				banned: userTable.banned
			})
			.from(userTable)
			.where(inArray(userTable.id, ids)),
		db
			.select({ userId: organizationMember.userId })
			.from(organizationMember)
			.innerJoin(organization, eq(organization.id, organizationMember.orgId))
			.where(eq(organization.isInternal, true))
	]);

	const internalSet = new Set(internalRows.map((r) => r.userId));
	return rows
		.filter((u) => !u.banned)
		.map((u) => {
			const name = u.name ?? u.email;
			return {
				id: u.id,
				name,
				email: u.email,
				initials: assigneeInitials(name),
				color: assigneeColor(u.id),
				status: 'active' as const,
				internal: internalSet.has(u.id),
				orgIds: [ticket.orgId]
			};
		});
}
