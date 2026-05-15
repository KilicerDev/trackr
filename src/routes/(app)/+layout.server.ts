import { redirect } from '@sveltejs/kit';
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import {
	organization,
	project as projectTable,
	projectFavorite as projectFavoriteTable,
	task as taskTable
} from '$lib/server/db/app.schema';
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
	const userRows = await db
		.select({
			id: userTable.id,
			name: userTable.name,
			email: userTable.email,
			banned: userTable.banned
		})
		.from(userTable);

	const users = userRows.map((u) => ({
		id: u.id,
		name: u.name,
		email: u.email,
		initials: initials(u.name),
		color: userColor(u.id),
		status: (u.banned ? 'disabled' : 'active') as 'active' | 'invited' | 'disabled'
	}));

	const projects = await db
		.select({
			id: projectTable.id,
			key: projectTable.key,
			name: projectTable.name,
			color: projectTable.color,
			icon: projectTable.icon
		})
		.from(projectTable)
		.where(isNull(projectTable.archivedAt));

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
		.where(isNotNull(projectTable.archivedAt));

	// Count only tasks whose parent project is active.
	const [activeTasks] = await db
		.select({ total: count() })
		.from(taskTable)
		.innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
		.where(and(isNull(taskTable.archivedAt), isNull(projectTable.archivedAt)));
	const taskCount = Number(activeTasks?.total ?? 0);

	// The current user's starred projects — drives the sidebar's Projects list.
	const favoriteRows = await db
		.select({ projectId: projectFavoriteTable.projectId })
		.from(projectFavoriteTable)
		.where(eq(projectFavoriteTable.userId, locals.user.id));
	const favoriteProjectIds = favoriteRows.map((r) => r.projectId);

	// Active orgs — surfaced app-wide so the global command palette can open
	// the create-project modal without re-fetching from each page.
	const orgs = await db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			color: organization.color
		})
		.from(organization)
		.where(isNull(organization.archivedAt))
		.orderBy(organization.name);

	return {
		user: locals.user,
		impersonator,
		users,
		projects,
		archivedProjects,
		favoriteProjectIds,
		taskCount,
		currentUserId: locals.user.id,
		orgs
	};
};
