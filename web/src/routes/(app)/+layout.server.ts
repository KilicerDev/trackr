import { redirect } from '@sveltejs/kit';
import { and, asc, count, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import {
	notification as notificationTable,
	organization,
	organizationMember,
	project as projectTable,
	projectFavorite as projectFavoriteTable,
	projectMember,
	task as taskTable
} from '$lib/server/db/app.schema';
import {
	accessibleProjectIds,
	can,
	effectivePermissions,
	isPortalUser,
	isTrackrTeam
} from '$lib/server/permissions';
import { getPreferences } from '$lib/server/preferences';
import { buildCapabilities } from '$lib/server/capabilities';
import { loadTickets, type TicketRow } from '$lib/server/tickets';
import { isSuperadmin } from '$lib/roles';
import type { LayoutServerLoad } from './$types';

// Routes a confined portal user is allowed to reach. Everything else redirects
// back to the new-ticket view.
function portalPathAllowed(pathname: string): boolean {
	return (
		/^\/tickets(\/|$)/.test(pathname) ||
		/^\/chat(\/|$)/.test(pathname) ||
		/^\/me(\/|$)/.test(pathname) ||
		pathname === '/logout'
	);
}

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

// This load re-runs on every client-side navigation (it depends on `url` for
// the redirects below), so it is the fixed cost under every page. Everything
// it reads depends only on `locals`, never on an earlier query, and is issued
// as one parallel batch: a request pays one database round trip here, not one
// per query.
export const load: LayoutServerLoad = async ({ locals, url, depends }) => {
	if (!locals.user) {
		const next = url.pathname + url.search;
		redirect(302, `/login?next=${encodeURIComponent(next)}`);
	}

	// Shared invalidation key for notification read-state. Both the bell (this
	// load) and the inbox page depend on it, so a single
	// `invalidate('app:notifications')` after a mark-read refreshes both in sync.
	depends('app:notifications');

	// Confine portal users (external org ticket-only users) to the ticket routes.
	const portal = isPortalUser(locals);
	if (portal && !portalPathAllowed(url.pathname)) {
		redirect(303, '/tickets/new');
	}

	const userId = locals.user.id;
	const impersonatedBy = (locals.session as { impersonatedBy?: string | null } | undefined)
		?.impersonatedBy;

	// Lookup data exposed app-wide so components can resolve users + projects
	// from $page.data without prop-drilling or mock imports.
	//
	// Security: non-internal-staff users only see users they share an org or
	// project with — exposing the full directory leaks every Trackr staff
	// member's email to clients. Banned users are excluded for non-staff so
	// disabled-account metadata isn't leaked either.
	const trackrTeamFlag = isTrackrTeam(locals);
	// Project visibility — Trackr internal team members see everything;
	// everyone else sees only projects they're explicitly a member of.
	const access = accessibleProjectIds(locals);
	const myOrgIds = (locals.memberships?.orgs ?? []).map((m) => m.orgId);
	const myProjectIds = (locals.memberships?.projects ?? []).map((m) => m.projectId);

	const projectAccessFilter = access.all
		? undefined
		: access.ids.size > 0
			? inArray(projectTable.id, [...access.ids])
			: // Empty access set — short-circuit by matching no rows.
				eq(projectTable.id, '__none__');

	const userColumns = {
		id: userTable.id,
		name: userTable.name,
		email: userTable.email,
		banned: userTable.banned
	};
	// Staff get the whole directory; everyone else only themselves plus the
	// people they share an org or project with. The sharing is resolved with
	// subqueries so this stays one statement instead of three.
	const usersQuery = trackrTeamFlag
		? db.select(userColumns).from(userTable)
		: db
				.select(userColumns)
				.from(userTable)
				.where(
					or(
						eq(userTable.id, userId),
						...(myOrgIds.length
							? [
									inArray(
										userTable.id,
										db
											.select({ id: organizationMember.userId })
											.from(organizationMember)
											.where(inArray(organizationMember.orgId, myOrgIds))
									)
								]
							: []),
						...(myProjectIds.length
							? [
									inArray(
										userTable.id,
										db
											.select({ id: projectMember.userId })
											.from(projectMember)
											.where(inArray(projectMember.projectId, myProjectIds))
									)
								]
							: [])
					)
				);

	const projectColumns = {
		id: projectTable.id,
		key: projectTable.key,
		name: projectTable.name,
		color: projectTable.color,
		icon: projectTable.icon
	};

	const orgsBase = db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			color: organization.color
		})
		.from(organization)
		.$dynamic();

	const [
		impersonatorRows,
		userRows,
		internalMemberRows,
		projectMemberRows,
		projects,
		archivedProjects,
		activeTasks,
		favoriteRows,
		orgs,
		recentNotifications,
		unreadAgg
	] = await Promise.all([
		impersonatedBy
			? db
					.select({ id: userTable.id, name: userTable.name, email: userTable.email })
					.from(userTable)
					.where(eq(userTable.id, impersonatedBy))
					.limit(1)
			: Promise.resolve([]),
		usersQuery,
		// Mention scoping: tag each user with whether they're internal staff and
		// which (viewer-accessible) projects they're an explicit member of, so
		// the task/project mention dropdowns offer only people who can actually
		// see the resource — mirroring projectMentionRecipients on the notify
		// path. Org-only client users (no project access) stay mentionable in
		// tickets only.
		db
			.select({ userId: organizationMember.userId })
			.from(organizationMember)
			.innerJoin(organization, eq(organization.id, organizationMember.orgId))
			.where(eq(organization.isInternal, true)),
		access.all
			? db
					.select({ projectId: projectMember.projectId, userId: projectMember.userId })
					.from(projectMember)
			: access.ids.size > 0
				? db
						.select({ projectId: projectMember.projectId, userId: projectMember.userId })
						.from(projectMember)
						.where(inArray(projectMember.projectId, [...access.ids]))
				: Promise.resolve([] as { projectId: string; userId: string }[]),
		// Sorted by name so consumers (sidebar, board columns grouped by project,
		// filter dropdowns) render in a stable order. Without an ORDER BY,
		// Postgres returns heap-scan order, which shifts whenever a project row
		// is updated — e.g. creating a task bumps `nextTaskNumber`, which moves
		// that project to a different position on the next read.
		db
			.select({ ...projectColumns, status: projectTable.status })
			.from(projectTable)
			.where(
				projectAccessFilter
					? and(ne(projectTable.status, 'archived'), projectAccessFilter)
					: ne(projectTable.status, 'archived')
			)
			.orderBy(asc(projectTable.name)),
		// Archived projects exposed separately so historical tasks still resolve
		// their icon/color without polluting the "active" list.
		db
			.select(projectColumns)
			.from(projectTable)
			.where(
				projectAccessFilter
					? and(eq(projectTable.status, 'archived'), projectAccessFilter)
					: eq(projectTable.status, 'archived')
			)
			.orderBy(asc(projectTable.name)),
		// Count tasks whose parent project is active AND the user can see it.
		db
			.select({ total: count() })
			.from(taskTable)
			.innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
			.where(
				projectAccessFilter
					? and(
							isNull(taskTable.archivedAt),
							ne(projectTable.status, 'archived'),
							projectAccessFilter
						)
					: and(isNull(taskTable.archivedAt), ne(projectTable.status, 'archived'))
			),
		// The current user's starred projects — drives the sidebar's Projects list.
		db
			.select({ projectId: projectFavoriteTable.projectId })
			.from(projectFavoriteTable)
			.where(eq(projectFavoriteTable.userId, userId)),
		// Active orgs — surfaced app-wide so the global command palette can open
		// the create-project modal without re-fetching from each page.
		//
		// Security: non-internal-staff users must only see orgs they belong to.
		// Leaking the full org list lets a client see every other client we work
		// with by name. Admin pages that need the full list query it directly.
		trackrTeamFlag
			? orgsBase.where(isNull(organization.archivedAt)).orderBy(organization.name)
			: myOrgIds.length === 0
				? Promise.resolve([])
				: orgsBase
						.where(and(isNull(organization.archivedAt), inArray(organization.id, myOrgIds)))
						.orderBy(organization.name),
		// Bell dropdown data. We surface only the 15 most recent rows; older
		// items are reachable from the /me/notifications inbox page.
		db
			.select({
				id: notificationTable.id,
				kind: notificationTable.kind,
				title: notificationTable.title,
				body: notificationTable.body,
				url: notificationTable.url,
				actorId: notificationTable.actorId,
				readAt: notificationTable.readAt,
				createdAt: notificationTable.createdAt
			})
			.from(notificationTable)
			.where(eq(notificationTable.recipientId, userId))
			.orderBy(desc(notificationTable.createdAt))
			.limit(15),
		db
			.select({ total: count() })
			.from(notificationTable)
			.where(and(eq(notificationTable.recipientId, userId), isNull(notificationTable.readAt)))
	]);

	const impersonator = impersonatorRows[0] ?? null;

	const internalUserIds = new Set(internalMemberRows.map((r) => r.userId));
	const projectIdsByUser = new Map<string, string[]>();
	for (const r of projectMemberRows) {
		const list = projectIdsByUser.get(r.userId);
		if (list) list.push(r.projectId);
		else projectIdsByUser.set(r.userId, [r.projectId]);
	}

	const users = userRows
		// Hide banned accounts from non-staff so disabled-account state isn't
		// leaked. Staff continue to see them to support moderation flows.
		.filter((u) => trackrTeamFlag || !u.banned)
		.map((u) => ({
			id: u.id,
			name: u.name,
			email: u.email,
			initials: initials(u.name),
			color: userColor(u.id),
			status: (u.banned ? 'disabled' : 'active') as 'active' | 'invited' | 'disabled',
			internal: internalUserIds.has(u.id),
			projectIds: projectIdsByUser.get(u.id) ?? []
		}));

	const taskCount = Number(activeTasks[0]?.total ?? 0);
	const favoriteProjectIds = favoriteRows.map((r) => r.projectId);

	const memberRoles = {
		orgs: Object.fromEntries((locals.memberships?.orgs ?? []).map((m) => [m.orgId, m.role])),
		projects: Object.fromEntries(
			(locals.memberships?.projects ?? []).map((m) => [m.projectId, m.role])
		)
	};

	const preferences = locals.preferences ?? (await getPreferences(userId));

	// ── Portal context ─────────────────────────────────────────────────────────
	// For external ticket-only users: resolve the active org (persisted in
	// viewState.portal.activeOrgId), and load their pinned + recent tickets scoped
	// to it. org.client sees all org tickets; org.member sees only their own.
	let portalRole: string | null = null;
	let activeOrgId: string | null = null;
	let pinnedTickets: TicketRow[] = [];
	let recentTickets: TicketRow[] = [];
	if (portal && orgs.length > 0) {
		const orgIds = orgs.map((o) => o.id);
		const storedActive = (preferences.viewState?.portal as { activeOrgId?: string } | undefined)
			?.activeOrgId;
		activeOrgId = storedActive && orgIds.includes(storedActive) ? storedActive : orgs[0].id;
		portalRole = memberRoles.orgs[activeOrgId] ?? null;
		// The see-all tier (org.client + org.agent) loads every ticket in the
		// active org; own-tickets-only members are scoped to themselves. Gate on
		// the permission, not the role string, so it stays correct as roles evolve.
		const seeAll = await can(locals, 'org.tickets.read.any', { orgId: activeOrgId });
		const scope = seeAll
			? { orgIds: [activeOrgId] }
			: { orgIds: [activeOrgId], ownerUserId: userId };
		const [pinned, recents] = await Promise.all([
			loadTickets({ ...scope, pinnedByUserId: userId }),
			loadTickets({ ...scope, limit: 20 })
		]);
		pinnedTickets = pinned;
		const pinnedSet = new Set(pinned.map((t) => t.id));
		recentTickets = recents.filter((t) => !pinnedSet.has(t.id)).slice(0, 15);
	}

	const notifications = {
		items: recentNotifications.map((n) => ({
			id: n.id,
			kind: n.kind,
			title: n.title,
			body: n.body,
			url: n.url,
			actorId: n.actorId,
			readAt: n.readAt?.toISOString() ?? null,
			createdAt: n.createdAt.toISOString()
		})),
		unreadCount: Number(unreadAgg[0]?.total ?? 0)
	};

	return {
		user: locals.user,
		impersonator,
		users,
		projects,
		archivedProjects,
		favoriteProjectIds,
		taskCount,
		currentUserId: userId,
		orgs,
		isAdmin: !!locals.isAdmin,
		isSuperadmin: isSuperadmin((locals.user as { role?: string | null }).role),
		isTrackrTeam: trackrTeamFlag,
		isPortalUser: portal,
		portalRole,
		activeOrgId,
		pinnedTickets,
		recentTickets,
		memberRoles,
		effectivePermissions: await effectivePermissions(locals),
		// The consolidated capability manifest — new consumers should read this
		// instead of the individual flags above (kept for unmigrated components).
		capabilities: await buildCapabilities(locals),
		preferences,
		notifications
	};
};
