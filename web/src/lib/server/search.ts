// Global search — v1. Permission-scoped ILIKE substring matching over the
// entity titles a user can reach; built for the mobile app's search tab (the
// web command palette is still a static action list). Everything here reuses
// the same scoping primitives as the page loads: `accessibleProjectIds` for
// tasks/projects, per-org ticket grants, `isTrackrTeam` for wiki/notes.
//
// Upgrade path (endpoint shape stays stable): pg_trgm indexes or tsvector
// columns per table, then swap the ILIKE predicates for ranked queries.

import { and, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { note, organization, project, task, ticket, wikiPage } from '$lib/server/db/app.schema';
import { accessibleProjectIds, can, isTrackrTeam } from '$lib/server/permissions';
import { ticketDisplayId } from '$lib/server/tickets';
import type { Memberships } from '$lib/permissions';

type Locals = {
	user?: { id: string } | null;
	memberships?: Memberships;
	isAdmin?: boolean;
};

export type SearchResult = {
	type: 'ticket' | 'task' | 'project' | 'wiki' | 'note';
	id: string;
	title: string;
	subtitle: string | null;
	/** In-app route on the web client; the mobile app maps types to its own routes. */
	url: string;
	/** Human-readable reference id (`SGP-22`, `SIWEB-15`, project key) — set for
	 *  ticket/task/project so the `!` reference picker can build tokens. */
	displayId?: string;
};

export type SearchOptions = {
	/** Restrict result types (the `!` reference picker passes these). When set,
	 *  an empty query is allowed and returns recently-updated items instead. */
	types?: SearchResult['type'][];
	/** Restrict tickets to one org — customer-visible surfaces (ticket threads,
	 *  org chat) must not suggest another org's tickets. */
	orgId?: string;
};

const PER_TYPE_LIMIT = 10;

function likePattern(q: string): string {
	// Escape LIKE wildcards in the user's query, then wrap for substring match.
	return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function searchAll(
	locals: Locals,
	rawQuery: string,
	opts: SearchOptions = {}
): Promise<SearchResult[]> {
	const q = rawQuery.trim();
	const restricted = opts.types?.length ? new Set(opts.types) : null;
	// Untyped callers (mobile search tab) keep the 2-char minimum; the typed
	// reference picker may pass short/empty queries (empty = recent items).
	if (!locals.user || (!restricted && q.length < 2)) return [];
	const want = (t: SearchResult['type']) => !restricted || restricted.has(t);
	const pattern = q ? likePattern(q) : null;
	// `SIWEB-15`-shaped query → also match on key + number so typing a known
	// display id surfaces the entity even though titles are what's indexed.
	const idMatch = /^([A-Za-z][A-Za-z0-9]{0,11})-(\d{1,9})$/.exec(q);
	const idKey = idMatch?.[1].toUpperCase();
	const idNumPrefix = idMatch ? `${idMatch[2]}%` : null;
	const team = isTrackrTeam(locals);

	// ── Tickets: same org split as the tickets page (read.any vs read.own) ────
	let ticketWhere: SQL | undefined;
	if (!want('ticket')) {
		ticketWhere = undefined;
	} else if (team) {
		ticketWhere = isNull(ticket.deletedAt);
	} else {
		const anyOrgIds: string[] = [];
		const ownOrgIds: string[] = [];
		for (const om of locals.memberships?.orgs ?? []) {
			if (await can(locals, 'org.tickets.read.any', { orgId: om.orgId })) anyOrgIds.push(om.orgId);
			else if (await can(locals, 'org.tickets.read.own', { orgId: om.orgId }))
				ownOrgIds.push(om.orgId);
		}
		const uid = locals.user.id;
		const parts: SQL[] = [];
		if (anyOrgIds.length) parts.push(inArray(ticket.orgId, anyOrgIds)!);
		if (ownOrgIds.length) {
			parts.push(
				and(
					inArray(ticket.orgId, ownOrgIds),
					sql`(${ticket.customerId} = ${uid} OR ${ticket.createdBy} = ${uid} OR EXISTS (SELECT 1 FROM ticket_assignee ta WHERE ta.ticket_id = ${ticket.id} AND ta.user_id = ${uid}))`
				)!
			);
		}
		if (parts.length === 0) ticketWhere = undefined;
		else ticketWhere = and(isNull(ticket.deletedAt), or(...parts));
	}

	const ticketTextParts: SQL[] = [];
	if (pattern) ticketTextParts.push(sql`${ticket.subject} ILIKE ${pattern}`);
	if (idKey && idNumPrefix) {
		ticketTextParts.push(
			and(
				sql`upper(${organization.key}) = ${idKey}`,
				sql`${ticket.number}::text LIKE ${idNumPrefix}`
			)!
		);
	}
	const ticketRows = ticketWhere
		? await db
				.select({
					id: ticket.id,
					subject: ticket.subject,
					number: ticket.number,
					status: ticket.status,
					orgName: organization.name,
					orgKey: organization.key
				})
				.from(ticket)
				.innerJoin(organization, eq(organization.id, ticket.orgId))
				.where(
					and(
						ticketWhere,
						...(opts.orgId ? [eq(ticket.orgId, opts.orgId)] : []),
						...(ticketTextParts.length ? [or(...ticketTextParts)!] : [])
					)
				)
				.orderBy(sql`${ticket.updatedAt} DESC`)
				.limit(PER_TYPE_LIMIT)
		: [];

	// ── Tasks + projects: accessibleProjectIds scoping ─────────────────────────
	const access = accessibleProjectIds(locals);
	const projectFilter = access.all
		? undefined
		: access.ids.size > 0
			? inArray(task.projectId, [...access.ids])
			: null; // no access at all
	const projectListFilter = access.all
		? undefined
		: access.ids.size > 0
			? inArray(project.id, [...access.ids])
			: null;

	const taskTextParts: SQL[] = [];
	if (pattern) taskTextParts.push(sql`${task.title} ILIKE ${pattern}`);
	if (idKey && idNumPrefix) {
		taskTextParts.push(
			and(sql`upper(${project.key}) = ${idKey}`, sql`${task.number}::text LIKE ${idNumPrefix}`)!
		);
	}
	const taskRows =
		want('task') && projectFilter !== null
			? await db
					.select({
						id: task.id,
						title: task.title,
						number: task.number,
						status: task.status,
						projectKey: project.key
					})
					.from(task)
					.innerJoin(project, eq(project.id, task.projectId))
					.where(
						and(
							isNull(task.deletedAt),
							isNull(task.archivedAt),
							ne(project.status, 'archived'),
							...(taskTextParts.length ? [or(...taskTextParts)!] : []),
							...(projectFilter ? [projectFilter] : [])
						)
					)
					.orderBy(sql`${task.updatedAt} DESC`)
					.limit(PER_TYPE_LIMIT)
			: [];

	const projectRows =
		want('project') && projectListFilter !== null
			? await db
					.select({ id: project.id, key: project.key, name: project.name })
					.from(project)
					.where(
						and(
							ne(project.status, 'archived'),
							...(pattern
								? [or(sql`${project.name} ILIKE ${pattern}`, sql`${project.key} ILIKE ${pattern}`)!]
								: []),
							...(projectListFilter ? [projectListFilter] : [])
						)
					)
					.orderBy(project.name)
					.limit(PER_TYPE_LIMIT)
			: [];

	// ── Wiki + notes: internal team only (mirrors the route guards) ────────────
	const wikiRows =
		team && want('wiki') && pattern
			? await db
					.select({ id: wikiPage.id, title: wikiPage.title, isFolder: wikiPage.isFolder })
					.from(wikiPage)
					.where(and(eq(wikiPage.isFolder, false), sql`${wikiPage.title} ILIKE ${pattern}`))
					.orderBy(sql`${wikiPage.updatedAt} DESC`)
					.limit(PER_TYPE_LIMIT)
			: [];

	// Notes: own quick notes + all meeting notes (meeting access is team-wide).
	const noteRows =
		team && want('note') && pattern
			? await db
					.select({ id: note.id, title: note.title, kind: note.kind, ownerId: note.ownerId })
					.from(note)
					.where(
						and(
							sql`${note.title} ILIKE ${pattern}`,
							or(eq(note.kind, 'meeting'), eq(note.ownerId, locals.user.id))
						)
					)
					.orderBy(sql`${note.updatedAt} DESC`)
					.limit(PER_TYPE_LIMIT)
			: [];

	const results: SearchResult[] = [
		...ticketRows.map((t) => ({
			type: 'ticket' as const,
			id: t.id,
			title: t.subject,
			subtitle: `${ticketDisplayId(t.orgKey, t.number)} · ${t.orgName}`,
			url: `/tickets/${t.id}`,
			displayId: ticketDisplayId(t.orgKey, t.number)
		})),
		...taskRows.map((t) => ({
			type: 'task' as const,
			id: t.id,
			title: t.title,
			subtitle: `${t.projectKey}-${t.number}`,
			url: `/tasks?task=${t.projectKey}-${t.number}`,
			displayId: `${t.projectKey}-${t.number}`
		})),
		...projectRows.map((p) => ({
			type: 'project' as const,
			id: p.id,
			title: p.name,
			subtitle: p.key,
			url: `/projects/${p.id}`,
			displayId: p.key
		})),
		...wikiRows.map((w) => ({
			type: 'wiki' as const,
			id: w.id,
			title: w.title,
			subtitle: null,
			url: `/wiki/${w.id}`
		})),
		...noteRows.map((n) => ({
			type: 'note' as const,
			id: n.id,
			title: n.title || 'Untitled',
			subtitle: n.kind === 'meeting' ? 'Meeting' : null,
			url: `/notes/${n.id}`
		}))
	];
	return results;
}
