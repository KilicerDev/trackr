import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import {
	organization,
	organizationMember,
	ticket,
	ticketAssignee,
	message,
	thread,
	type MessageKind
} from './db/app.schema';
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
	// Full assignee set. `assignedAgentId` is the derived primary (first) assignee,
	// kept for back-compat with read sites that still expect a single id.
	assignees: string[];
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
	// 'comment' = human reply; 'system' = a folded-in field-change event, whose
	// payload lives in `meta` (see TicketEventMeta) and is rendered per-locale.
	kind: MessageKind;
	meta: Record<string, unknown> | null;
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

// Rendered at read time from organization.key + ticket.number — never stored —
// so renaming an org key re-labels all of its tickets at once.
export function ticketDisplayId(orgKey: string, n: number): string {
	return `${orgKey}-${n}`;
}
// Local alias kept so existing call sites in this module read unchanged.
const displayId = ticketDisplayId;

type AccessOpts = {
	// When set, restrict to these org ids. Null/undefined means no org filter
	// (use for Trackr-internal staff that see everything).
	orgIds?: string[];
	// When set, restrict to tickets where the user is customer, creator, or
	// assignee. Used for the read.own tier — creator included so a ticket
	// raised *for* another customer stays visible to whoever opened it
	// (matches canViewTicket and ticketRecipients).
	ownerUserId?: string;
	// When set, restrict to tickets this user has pinned (ticket_favorite).
	pinnedByUserId?: string;
	// When set, cap the number of rows (newest-first). Used for the portal
	// "Recents" list.
	limit?: number;
	// Internal Trackr staff see internal notes reflected in reply counts. External
	// org users must only see public-message counts and timestamps.
	includeInternalMessages?: boolean;
};

export async function loadTickets(opts: AccessOpts = {}): Promise<TicketRow[]> {
	if (opts.orgIds && opts.orgIds.length === 0) return [];

	const conditions = [isNull(ticket.deletedAt)];
	if (opts.orgIds) conditions.push(inArray(ticket.orgId, opts.orgIds));
	if (opts.ownerUserId) {
		conditions.push(
			sql`(${ticket.customerId} = ${opts.ownerUserId} OR ${ticket.createdBy} = ${opts.ownerUserId} OR EXISTS (SELECT 1 FROM ticket_assignee ta WHERE ta.ticket_id = ${ticket.id} AND ta.user_id = ${opts.ownerUserId}))`
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
			orgKey: organization.key,
			orgName: organization.name,
			orgColor: organization.color
		})
		.from(ticket)
		.innerJoin(organization, eq(organization.id, ticket.orgId))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(ticket.createdAt))
		.$dynamic();
	if (opts.limit && opts.limit > 0) q = q.limit(opts.limit);
	const rows = await q;

	const ids = rows.map((r) => r.t.id);

	// Batch-load the assignee sets for this page of tickets (mirror of tasks).
	const assigneesByTicket = new Map<string, string[]>();
	if (ids.length) {
		const assigneeRows = await db
			.select({ ticketId: ticketAssignee.ticketId, userId: ticketAssignee.userId })
			.from(ticketAssignee)
			.where(inArray(ticketAssignee.ticketId, ids));
		for (const r of assigneeRows) {
			const list = assigneesByTicket.get(r.ticketId) ?? [];
			list.push(r.userId);
			assigneesByTicket.set(r.ticketId, list);
		}
	}

	const counts = new Map<string, { count: number; last: string | null }>();
	if (ids.length) {
		const messageConditions = [
			eq(thread.subjectType, 'ticket'),
			inArray(thread.subjectId, ids),
			isNull(message.deletedAt),
			// System events are timeline entries, not replies — they must not
			// inflate the reply count or the "last message" timestamp.
			eq(message.kind, 'comment')
		];
		if (!opts.includeInternalMessages) messageConditions.push(eq(message.internal, false));

		const msgRows = await db
			.select({
				ticketId: thread.subjectId,
				count: sql<number>`count(*)::int`,
				last: sql<string | null>`max(${message.createdAt})`
			})
			.from(message)
			.innerJoin(thread, eq(thread.id, message.threadId))
			.where(and(...messageConditions))
			.groupBy(thread.subjectId);
		for (const m of msgRows) {
			counts.set(m.ticketId, { count: Number(m.count), last: toIso(m.last) });
		}
	}

	return rows.map((r) => {
		const t = r.t;
		const mc = counts.get(t.id);
		const assignees = assigneesByTicket.get(t.id) ?? [];
		return {
			id: t.id,
			orgId: t.orgId,
			orgSlug: r.orgSlug,
			orgName: r.orgName,
			orgColor: r.orgColor,
			number: t.number,
			displayId: displayId(r.orgKey, t.number),
			subject: t.subject,
			description: t.description,
			status: t.status as TicketStatus,
			priority: t.priority as TicketPriority,
			category: t.category as TicketCategory,
			channel: t.channel as TicketChannel,
			customerId: t.customerId,
			assignees,
			assignedAgentId: assignees[0] ?? null,
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

// `includeSystem` (default true) keeps the folded-in field-change events. Pass
// false for surfaces that want only the human conversation (e.g. the chat feed's
// inline ticket preview), which would otherwise render events as message bubbles.
export async function loadTicketMessages(
	ticketId: string,
	opts: { includeInternal: boolean; includeSystem?: boolean }
): Promise<TicketMessageRow[]> {
	const conditions = [
		eq(thread.subjectType, 'ticket'),
		eq(thread.subjectId, ticketId),
		isNull(message.deletedAt)
	];
	if (!opts.includeInternal) {
		conditions.push(eq(message.internal, false));
	}
	if (opts.includeSystem === false) {
		conditions.push(eq(message.kind, 'comment'));
	}
	const rows = await db
		.select({
			id: message.id,
			authorId: message.authorId,
			body: message.body,
			kind: message.kind,
			meta: message.meta,
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
		kind: m.kind,
		meta: m.meta,
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
	assigneeIds: string[];
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
	assignedIds: string[];
}> {
	const id = crypto.randomUUID();
	let number = 0;
	let display = '';
	let assignedIds: string[] = [];

	await db.transaction(async (tx) => {
		const [bumped] = await tx
			.update(organization)
			.set({ nextTicketNumber: sql`${organization.nextTicketNumber} + 1` })
			.where(eq(organization.id, input.orgId))
			.returning({
				next: organization.nextTicketNumber,
				key: organization.key
			});
		if (!bumped) throw new Error('Organization not found');
		number = bumped.next - 1;
		display = displayId(bumped.key, number);

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
			createdBy: input.createdBy,
			tags: input.tags,
			sourceThreadId: input.sourceThreadId ?? null
		});

		// Seed assignees (validated against the user table for FK safety).
		const wanted = [...new Set(input.assigneeIds.filter(Boolean))];
		if (wanted.length) {
			const valid = await tx
				.select({ id: userTable.id })
				.from(userTable)
				.where(inArray(userTable.id, wanted));
			assignedIds = valid.map((u) => u.id);
			if (assignedIds.length) {
				await tx
					.insert(ticketAssignee)
					.values(assignedIds.map((userId) => ({ ticketId: id, userId })));
			}
		}
	});

	return { id, number, displayId: display, assignedIds };
}

type UpdateTicketInput = {
	subject?: string;
	status?: TicketStatus;
	priority?: TicketPriority;
	category?: TicketCategory;
	// undefined = leave assignees untouched; [] = clear all; [...] = set to exactly this.
	assigneeIds?: string[];
	satisfactionScore?: number | null;
	tags?: string[];
	checklist?: { id: string; text: string; done: boolean }[];
	// First agent response timestamp. Set by the update action on the first
	// agent-driven change (status/priority/assignee/category), mirroring the
	// stamp `addTicketMessage` writes on the first public agent reply.
	firstResponseAt?: Date;
};

/**
 * Sanitize a client-posted checklist array (whole-array replace semantics):
 * cap at 100 items / 500 chars, drop empties, fill missing ids. Returns null
 * for a payload that isn't an array at all. Shared by the web `checklist`
 * action and PUT /api/v1/tickets/[id]/checklist.
 */
export function sanitizeTicketChecklist(
	raw: unknown
): { id: string; text: string; done: boolean }[] | null {
	if (!Array.isArray(raw)) return null;
	return raw
		.slice(0, 100)
		.map((it) => ({
			id: typeof it?.id === 'string' && it.id ? it.id : crypto.randomUUID(),
			text: String(it?.text ?? '')
				.trim()
				.slice(0, 500),
			done: !!it?.done
		}))
		.filter((it) => it.text.length > 0);
}

// Centralizes the resolved/closed timestamp bookkeeping that the auto-
// transition helper also depends on.
export async function updateTicket(ticketId: string, patch: UpdateTicketInput): Promise<void> {
	const fields: Record<string, unknown> = {};
	if (patch.subject !== undefined) fields.subject = patch.subject;
	if (patch.priority !== undefined) fields.priority = patch.priority;
	if (patch.category !== undefined) fields.category = patch.category;
	if (patch.satisfactionScore !== undefined) fields.satisfactionScore = patch.satisfactionScore;
	if (patch.tags !== undefined) fields.tags = patch.tags;
	if (patch.checklist !== undefined) fields.checklist = patch.checklist;
	if (patch.firstResponseAt !== undefined) fields.firstResponseAt = patch.firstResponseAt;
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
	if (Object.keys(fields).length > 0) {
		await db.update(ticket).set(fields).where(eq(ticket.id, ticketId));
	}

	// Assignees live in the join table — replace the whole set (delete + reinsert).
	if (patch.assigneeIds !== undefined) {
		await db.delete(ticketAssignee).where(eq(ticketAssignee.ticketId, ticketId));
		const wanted = [...new Set(patch.assigneeIds.filter(Boolean))];
		if (wanted.length) {
			const valid = await db
				.select({ id: userTable.id })
				.from(userTable)
				.where(inArray(userTable.id, wanted));
			if (valid.length) {
				await db.insert(ticketAssignee).values(valid.map((u) => ({ ticketId, userId: u.id })));
			}
		}
	}
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

// Get-or-create the ticket's thread (the backfill made one per existing ticket;
// new tickets create theirs lazily on the first message or system event).
async function getOrCreateTicketThreadId(
	tx: Pick<typeof db, 'select' | 'insert'>,
	ticketId: string
): Promise<string> {
	const [th] = await tx
		.select({ id: thread.id })
		.from(thread)
		.where(and(eq(thread.subjectType, 'ticket'), eq(thread.subjectId, ticketId)))
		.limit(1);
	if (th) return th.id;
	const tid = crypto.randomUUID();
	await tx.insert(thread).values({ id: tid, subjectType: 'ticket', subjectId: ticketId });
	return tid;
}

// ─── Ticket system events ──────────────────────────────────────────────────
// Field changes folded into the ticket's activity timeline as `kind='system'`
// messages (the same mechanism chat uses for its "ticket created" marker).
// Rendered from `meta` so each viewer sees them in their own locale; `body` is
// a non-localized fallback kept for search/export.
//
// `internal: true` hides an event from the customer. Status, assignment,
// priority and category changes are all customer-visible; only subject/tag
// edits are agent-only bookkeeping.

export type TicketEventMeta =
	| { event: 'status_changed'; from: string; to: string }
	| { event: 'priority_changed'; from: string; to: string }
	| { event: 'category_changed'; from: string; to: string }
	| { event: 'assigned'; added: string[]; removed: string[] }
	| {
			event: 'edited';
			subject?: { from: string; to: string };
			tags?: { from: string[]; to: string[] };
	  };

function systemEventBody(meta: TicketEventMeta): string {
	switch (meta.event) {
		case 'status_changed':
			return `Status: ${meta.from} → ${meta.to}`;
		case 'priority_changed':
			return `Priority: ${meta.from} → ${meta.to}`;
		case 'category_changed':
			return `Category: ${meta.from} → ${meta.to}`;
		case 'assigned':
			return `Assignees changed (+${meta.added.length}/-${meta.removed.length})`;
		case 'edited':
			return 'Ticket edited';
	}
}

// Appends system events to a ticket's timeline in one transaction. Never bumps
// `first_response_at` or `updatedAt` — the caller owns that bookkeeping.
export async function addTicketSystemEvents(
	ticketId: string,
	actorId: string,
	events: { meta: TicketEventMeta; internal: boolean }[]
): Promise<void> {
	if (events.length === 0) return;
	await db.transaction(async (tx) => {
		const threadId = await getOrCreateTicketThreadId(tx, ticketId);
		await tx.insert(message).values(
			events.map((e) => ({
				id: crypto.randomUUID(),
				threadId,
				authorId: actorId,
				kind: 'system' as const,
				body: systemEventBody(e.meta),
				internal: e.internal,
				meta: e.meta as unknown as Record<string, unknown>
			}))
		);
	});
}

// Adds a message. Public replies bump `updatedAt` (so the portal "Recents"
// list reflects conversation activity) and stamp `first_response_at` on the
// first agent reply for response-time metrics. Replies do NOT auto-transition
// the ticket status — agents move status manually via the picker.
export async function addTicketMessage(input: AddMessageInput): Promise<{ id: string }> {
	const id = crypto.randomUUID();
	await db.transaction(async (tx) => {
		const threadId = await getOrCreateTicketThreadId(tx, input.ticketId);
		await tx.insert(message).values({
			id,
			threadId,
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
			orgKey: organization.key,
			orgName: organization.name,
			orgColor: organization.color
		})
		.from(ticket)
		.innerJoin(organization, eq(organization.id, ticket.orgId))
		.where(and(eq(ticket.id, ticketId), isNull(ticket.deletedAt)))
		.limit(1);
	if (!row) return null;
	const t = row.t;
	const assigneeRows = await db
		.select({ userId: ticketAssignee.userId })
		.from(ticketAssignee)
		.where(eq(ticketAssignee.ticketId, ticketId));
	const assignees = assigneeRows.map((r) => r.userId);
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
				isNull(message.deletedAt),
				// Exclude system events — they're timeline entries, not replies.
				eq(message.kind, 'comment')
			)
		);
	return {
		id: t.id,
		orgId: t.orgId,
		orgSlug: row.orgSlug,
		orgName: row.orgName,
		orgColor: row.orgColor,
		number: t.number,
		displayId: displayId(row.orgKey, t.number),
		subject: t.subject,
		description: t.description,
		status: t.status as TicketStatus,
		priority: t.priority as TicketPriority,
		category: t.category as TicketCategory,
		channel: t.channel as TicketChannel,
		customerId: t.customerId,
		assignees,
		assignedAgentId: assignees[0] ?? null,
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
	assigneeIds: string[];
}): Promise<AssignableUser[]> {
	const audience = await ticketRecipients({
		orgId: ticket.orgId,
		customerId: ticket.customerId,
		assigneeIds: ticket.assigneeIds
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

// Display-only directory (id → name/initials/color, NO email) for the users
// referenced by a page of tickets — their assignees and customers. Resolves
// assignee names on the tickets LIST for viewers who aren't agents: their
// app-wide `users` directory is scoped to their own org and omits
// internally-assigned platform agents, and the Inspector (unlike the detail
// page) has no server-built `participants` fallback. Emails are stripped so a
// client never learns a platform agent's address; `internal`/`orgIds` are left
// empty so these rows can never leak into the (edit-gated) assignee picker.
export async function loadTicketDisplayUsers(
	userIds: (string | null | undefined)[]
): Promise<AssignableUser[]> {
	const ids = [...new Set(userIds.filter((v): v is string => !!v))];
	if (ids.length === 0) return [];
	const rows = await db
		.select({ id: userTable.id, name: userTable.name, email: userTable.email })
		.from(userTable)
		.where(inArray(userTable.id, ids));
	return rows.map((u) => {
		const name = u.name ?? u.email;
		return {
			id: u.id,
			name,
			email: '',
			initials: assigneeInitials(name),
			color: assigneeColor(u.id),
			status: 'active' as const,
			internal: false,
			orgIds: []
		};
	});
}
