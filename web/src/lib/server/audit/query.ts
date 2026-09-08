// Read model for the audit log, shared by the /admin/system/logs page loader, its
// "load more" JSON endpoint, and the CSV export. One query path so filtering and
// row shaping stay consistent across all three.

import { and, desc, gte, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { auditLog } from '../db/app.schema';
import { user as userTable } from '../db/auth.schema';
import { parseDevice } from './index';

export const AUDIT_PAGE_SIZE = 50;
const RANGE_DAYS: Record<string, number> = { '1': 1, '7': 7, '30': 30 };

function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase();
}
function userColor(id: string): string {
	let h = 0;
	for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return `hsl(${h % 360} 55% 60%)`;
}
// "YYYY-MM-DD HH:MM" — matches the format the UI renders.
function fmtAt(d: Date): string {
	return d.toISOString().slice(0, 16).replace('T', ' ');
}

export type AuditRow = {
	id: string;
	type: string;
	kind: string;
	actor: string; // actorId ('' for anonymous)
	actorLabel: string | null;
	target: string; // targetLabel, shown in the table
	targetType: string | null;
	targetId: string | null;
	orgId: string | null;
	at: string;
	atIso: string;
	ip: string;
	device: string;
	userAgent: string | null;
	channel: string | null;
	meta: Record<string, unknown> | null;
};

export type AuditActor = { id: string; name: string; initials: string; color: string };

/** Comma-separated multi-value filter from the URL ('all' or '' = no filter). */
export function parseFilterList(raw: string | null | undefined): string[] {
	if (!raw || raw === 'all') return [];
	return [
		...new Set(
			raw
				.split(',')
				.map((v) => v.trim())
				.filter(Boolean)
		)
	];
}

export type AuditQueryParams = {
	/** Log categories (audit_log.kind); empty = all. */
	kind?: string[];
	/** Surfaces (audit_log.channel: web | app | api | mcp); empty = all. */
	channel?: string[];
	/** Actor user ids; empty = all. */
	actor?: string[];
	range?: string;
	q?: string;
	before?: string | null;
	limit?: number;
};

export type AuditQueryResult = {
	events: AuditRow[];
	actors: Record<string, AuditActor>;
	hasMore: boolean;
	nextCursor: string | null;
};

export async function queryAuditLog(params: AuditQueryParams): Promise<AuditQueryResult> {
	const kind = params.kind ?? [];
	const channel = params.channel ?? [];
	const actor = params.actor ?? [];
	const range = params.range ?? '30';
	const q = (params.q ?? '').trim();
	const before = params.before ?? null;
	const limit = params.limit ?? AUDIT_PAGE_SIZE;

	const conditions = [];
	if (kind.length) conditions.push(inArray(auditLog.kind, kind));
	if (channel.length) conditions.push(inArray(auditLog.channel, channel));
	if (actor.length) conditions.push(inArray(auditLog.actorId, actor));
	const days = RANGE_DAYS[range];
	if (days) conditions.push(gte(auditLog.createdAt, new Date(Date.now() - days * 86_400_000)));
	if (q) {
		const like = `%${q}%`;
		conditions.push(
			or(
				sql`${auditLog.type} ILIKE ${like}`,
				sql`${auditLog.targetLabel} ILIKE ${like}`,
				sql`${auditLog.actorLabel} ILIKE ${like}`
			)
		);
	}
	if (before) {
		const d = new Date(before);
		if (!Number.isNaN(d.getTime())) conditions.push(lt(auditLog.createdAt, d));
	}

	// Fetch one extra to detect a next page.
	const rows = await db
		.select()
		.from(auditLog)
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(auditLog.createdAt))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;

	const actorIds = [...new Set(page.map((r) => r.actorId).filter((v): v is string => !!v))];
	const actorRows = actorIds.length
		? await db
				.select({ id: userTable.id, name: userTable.name, email: userTable.email })
				.from(userTable)
				.where(inArray(userTable.id, actorIds))
		: [];
	const actors: Record<string, AuditActor> = {};
	for (const u of actorRows) {
		const name = u.name ?? u.email;
		actors[u.id] = { id: u.id, name, initials: initials(name), color: userColor(u.id) };
	}

	const events: AuditRow[] = page.map((r) => ({
		id: r.id,
		type: r.type,
		kind: r.kind,
		actor: r.actorId ?? '',
		actorLabel: r.actorLabel,
		target: r.targetLabel ?? '',
		targetType: r.targetType,
		targetId: r.targetId,
		orgId: r.orgId,
		at: fmtAt(r.createdAt),
		atIso: r.createdAt.toISOString(),
		ip: r.ipAddress ?? '—',
		device: parseDevice(r.userAgent),
		userAgent: r.userAgent,
		channel: r.channel,
		meta: r.meta
	}));

	return {
		events,
		actors,
		hasMore,
		nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null
	};
}
