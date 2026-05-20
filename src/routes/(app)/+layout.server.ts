import { redirect } from '@sveltejs/kit';
import { and, asc, count, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
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
	effectivePermissions,
	isTrackrTeam
} from '$lib/server/permissions';
import { getPreferences } from '$lib/server/preferences';
import type { LayoutServerLoad } from './$types';

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

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const next = url.pathname + url.search;
		redirect(302, `/login?next=${encodeURIComponent(next)}`);
	}

	const impersonatedBy = (locals.session as { impersonatedBy?: string | null } | undefined)
		?.impersonatedBy;
	let impersonator: { id: string; name: string | null; email: string } | null = null;
	if (impersonatedBy) {
		const [admin] = await db
			.select({ id: userTable.id, name: userTable.name, email: userTable.email })
			.from(userTable)
			.where(eq(userTable.id, impersonatedBy))
			.limit(1);
		impersonator = admin ?? null;
	}

	// Lookup data exposed app-wide so components can resolve users + projects
	// from $page.data without prop-drilling or mock imports.
	//
	// Security: non-internal-staff users only see users they share an org or
	// project with — exposing the full directory leaks every Trackr staff
	// member's email to clients. Banned users are excluded for non-staff so
	// disabled-account metadata isn't leaked either.
	const trackrTeamFlag = isTrackrTeam(locals);
	let visibleUserIds: Set<string> | null = null;
	if (!trackrTeamFlag) {
		const myOrgIds = (locals.memberships?.orgs ?? []).map((m) => m.orgId);
		const myProjectIds = (locals.memberships?.projects ?? []).map((m) => m.projectId);
		const [orgMates, projectMates] = await Promise.all([
			myOrgIds.length
				? db
						.select({ userId: organizationMember.userId })
						.from(organizationMember)
						.where(inArray(organizationMember.orgId, myOrgIds))
				: Promise.resolve([] as { userId: string }[]),
			myProjectIds.length
				? db
						.select({ userId: projectMember.userId })
						.from(projectMember)
						.where(inArray(projectMember.projectId, myProjectIds))
				: Promise.resolve([] as { userId: string }[])
		]);
		visibleUserIds = new Set<string>([locals.user.id]);
		for (const r of orgMates) visibleUserIds.add(r.userId);
		for (const r of projectMates) visibleUserIds.add(r.userId);
	}

	const userQuery = db
		.select({
			id: userTable.id,
			name: userTable.name,
			email: userTable.email,
			banned: userTable.banned
		})
		.from(userTable)
		.$dynamic();
	const userRows = trackrTeamFlag
		? await userQuery
		: visibleUserIds && visibleUserIds.size > 0
			? await userQuery.where(inArray(userTable.id, [...visibleUserIds]))
			: [];

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
			status: (u.banned ? 'disabled' : 'active') as 'active' | 'invited' | 'disabled'
		}));

	// Project visibility — Trackr internal team members see everything;
	// everyone else sees only projects they're explicitly a member of.
	const access = accessibleProjectIds(locals);
	const projectAccessFilter = access.all
		? undefined
		: access.ids.size > 0
			? inArray(projectTable.id, [...access.ids])
			: // Empty access set — short-circuit by matching no rows.
				eq(projectTable.id, '__none__');

	// Sorted by name so consumers (sidebar, board columns grouped by project,
	// filter dropdowns) render in a stable order. Without an ORDER BY,
	// Postgres returns heap-scan order, which shifts whenever a project row
	// is updated — e.g. creating a task bumps `nextTaskNumber`, which moves
	// that project to a different position on the next read.
	const projects = await db
		.select({
			id: projectTable.id,
			key: projectTable.key,
			name: projectTable.name,
			color: projectTable.color,
			icon: projectTable.icon,
			status: projectTable.status
		})
		.from(projectTable)
		.where(
			projectAccessFilter
				? and(ne(projectTable.status, 'archived'), projectAccessFilter)
				: ne(projectTable.status, 'archived')
		)
		.orderBy(asc(projectTable.name));

	// Archived projects exposed separately so historical tasks still resolve
	// their icon/color without polluting the "active" list.
	const archivedProjects = await db
		.select({
			id: projectTable.id,
			key: projectTable.key,
			name: projectTable.name,
			color: projectTable.color,
			icon: projectTable.icon
		})
		.from(projectTable)
		.where(
			projectAccessFilter
				? and(eq(projectTable.status, 'archived'), projectAccessFilter)
				: eq(projectTable.status, 'archived')
		)
		.orderBy(asc(projectTable.name));

	// Count tasks whose parent project is active AND the user can see it.
	const [activeTasks] = await db
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
		);
	const taskCount = Number(activeTasks?.total ?? 0);

	// The current user's starred projects — drives the sidebar's Projects list.
	const favoriteRows = await db
		.select({ projectId: projectFavoriteTable.projectId })
		.from(projectFavoriteTable)
		.where(eq(projectFavoriteTable.userId, locals.user.id));
	const favoriteProjectIds = favoriteRows.map((r) => r.projectId);

	// Active orgs — surfaced app-wide so the global command palette can open
	// the create-project modal without re-fetching from each page.
	//
	// Security: non-internal-staff users must only see orgs they belong to.
	// Leaking the full org list lets a client see every other client we work
	// with by name. Admin pages that need the full list query it directly.
	const myOrgIds = (locals.memberships?.orgs ?? []).map((m) => m.orgId);
	const orgsBase = db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			color: organization.color
		})
		.from(organization)
		.$dynamic();
	const orgs = trackrTeamFlag
		? await orgsBase.where(isNull(organization.archivedAt)).orderBy(organization.name)
		: myOrgIds.length === 0
			? []
			: await orgsBase
					.where(and(isNull(organization.archivedAt), inArray(organization.id, myOrgIds)))
					.orderBy(organization.name);

	const memberRoles = {
		orgs: Object.fromEntries(
			(locals.memberships?.orgs ?? []).map((m) => [m.orgId, m.role])
		),
		projects: Object.fromEntries(
			(locals.memberships?.projects ?? []).map((m) => [m.projectId, m.role])
		)
	};

	const preferences = await getPreferences(locals.user.id);

	// Bell dropdown data. We surface only the 15 most recent rows; older
	// items are reachable from the /me/notifications inbox page.
	const [recentNotifications, unreadAgg] = await Promise.all([
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
			.where(eq(notificationTable.recipientId, locals.user.id))
			.orderBy(desc(notificationTable.createdAt))
			.limit(15),
		db
			.select({ total: count() })
			.from(notificationTable)
			.where(
				and(
					eq(notificationTable.recipientId, locals.user.id),
					isNull(notificationTable.readAt)
				)
			)
	]);
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
		currentUserId: locals.user.id,
		orgs,
		isAdmin: !!locals.isAdmin,
		isTrackrTeam: trackrTeamFlag,
		memberRoles,
		effectivePermissions: await effectivePermissions(locals),
		preferences,
		notifications
	};
};
