import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from './db';
import { organization, task, ticket, ticketMessage } from './db/app.schema';

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

export const TICKET_CATEGORIES = ['billing', 'technical_issue', 'feature_request', 'general'] as const;
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
				ticketId: ticketMessage.ticketId,
				count: sql<number>`count(*)::int`,
				last: sql<string | null>`max(${ticketMessage.createdAt})`
			})
			.from(ticketMessage)
			.where(inArray(ticketMessage.ticketId, ids))
			.groupBy(ticketMessage.ticketId);
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
	const conditions = [eq(ticketMessage.ticketId, ticketId)];
	if (!opts.includeInternal) {
		conditions.push(eq(ticketMessage.isInternalNote, false));
	}
	const rows = await db
		.select()
		.from(ticketMessage)
		.where(and(...conditions))
		.orderBy(ticketMessage.createdAt);
	return rows.map((m) => ({
		id: m.id,
		ticketId: m.ticketId,
		authorId: m.authorId,
		body: m.body,
		isInternalNote: m.isInternalNote,
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
			tags: input.tags
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

// Adds a message and runs the lifecycle side-effects:
// - first agent public reply stamps first_response_at
// - agent public reply on `open` moves to `in_progress`
// - customer public reply on `waiting_on_customer` / `resolved` flips to
//   `waiting_on_agent` (i.e. customer re-opens / pushes back)
// - agent public reply on `waiting_on_agent` moves to `waiting_on_customer`
// Internal notes never transition status.
export async function addTicketMessage(input: AddMessageInput): Promise<{ id: string }> {
	const id = crypto.randomUUID();
	await db.transaction(async (tx) => {
		await tx.insert(ticketMessage).values({
			id,
			ticketId: input.ticketId,
			authorId: input.authorId,
			body: input.body,
			isInternalNote: input.isInternalNote
		});

		if (input.isInternalNote) return;

		const [t] = await tx
			.select({
				status: ticket.status,
				firstResponseAt: ticket.firstResponseAt
			})
			.from(ticket)
			.where(eq(ticket.id, input.ticketId))
			.limit(1);
		if (!t) return;

		// Always bump updatedAt for a public reply so the portal "Recents" list
		// reflects conversation activity, not just status transitions.
		const fields: Record<string, unknown> = { updatedAt: new Date() };
		if (input.authorIsAgent) {
			if (!t.firstResponseAt) fields.firstResponseAt = new Date();
			if (t.status === 'open') fields.status = 'in_progress';
			else if (t.status === 'waiting_on_agent') fields.status = 'waiting_on_customer';
		} else {
			if (t.status === 'waiting_on_customer' || t.status === 'resolved') {
				fields.status = 'waiting_on_agent';
			}
		}
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

// Keeps a ticket in step with the tasks spun up from it (the convert flow):
// - when a task is marked done, resolve the ticket once EVERY linked,
//   non-deleted task is done (and the ticket isn't already resolved/closed);
// - when a done task is reopened, leave the ticket status alone but drop an
//   internal note so agents see the regression.
// Caller invokes this fire-and-forget; it never throws into the task save.
export async function syncTicketForLinkedTaskStatus(input: {
	ticketId: string;
	actorId: string;
	prevStatus: string;
	newStatus: string;
	// Pre-localized note body for the reopen case (built by the caller, which
	// has the request locale + the task ref). Falls back to a plain string.
	reopenNote?: string;
}): Promise<void> {
	const { ticketId, actorId, prevStatus, newStatus } = input;

	if (newStatus === 'done') {
		const [remaining] = await db
			.select({ n: sql<number>`count(*)::int` })
			.from(task)
			.where(
				and(eq(task.sourceTicketId, ticketId), isNull(task.deletedAt), ne(task.status, 'done'))
			);
		if (Number(remaining?.n ?? 0) > 0) return;

		const [t] = await db
			.select({ status: ticket.status })
			.from(ticket)
			.where(and(eq(ticket.id, ticketId), isNull(ticket.deletedAt)))
			.limit(1);
		if (!t || t.status === 'resolved' || t.status === 'closed') return;
		await updateTicket(ticketId, { status: 'resolved' });
		return;
	}

	if (prevStatus === 'done' && newStatus !== 'done') {
		const [t] = await db
			.select({ status: ticket.status })
			.from(ticket)
			.where(and(eq(ticket.id, ticketId), isNull(ticket.deletedAt)))
			.limit(1);
		if (!t || t.status !== 'resolved') return;
		await addTicketMessage({
			ticketId,
			authorId: actorId,
			body: input.reopenNote ?? 'A linked task was reopened.',
			isInternalNote: true,
			authorIsAgent: true
		});
	}
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
			last: sql<string | null>`max(${ticketMessage.createdAt})`
		})
		.from(ticketMessage)
		.where(eq(ticketMessage.ticketId, ticketId));
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
		messageCount: Number(mc?.count ?? 0),
		lastMessageAt: toIso(mc?.last ?? null),
		createdAt: t.createdAt.toISOString(),
		updatedAt: t.updatedAt.toISOString()
	};
}
