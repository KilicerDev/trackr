import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	project,
	projectFavorite,
	projectMember,
	organization
} from '$lib/server/db/app.schema';
import { user } from '$lib/server/db/auth.schema';
import { loadTasks } from '$lib/server/tasks';

const ALLOWED_MEMBER_ROLES = new Set(['owner', 'admin', 'member']);

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

export const load: ServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(303, '/sign-in');

	const id = params.id;
	if (!id) throw error(404, 'Project not found');

	const [row] = await db.select().from(project).where(eq(project.id, id)).limit(1);
	if (!row) throw error(404, 'Project not found');

	const memberRows = await db
		.select({
			userId: projectMember.userId,
			role: projectMember.role,
			name: user.name
		})
		.from(projectMember)
		.innerJoin(user, eq(user.id, projectMember.userId))
		.where(eq(projectMember.projectId, id));

	const members = memberRows.map((m) => ({
		id: m.userId,
		name: m.name,
		role: m.role,
		initials: initials(m.name),
		color: userColor(m.userId)
	}));

	let lead = null;
	if (row.leadId) {
		const [u] = await db
			.select({ id: user.id, name: user.name })
			.from(user)
			.where(eq(user.id, row.leadId))
			.limit(1);
		if (u) lead = { id: u.id, name: u.name, initials: initials(u.name), color: userColor(u.id) };
	}

	let org = null;
	if (row.orgId) {
		const [o] = await db
			.select({ id: organization.id, name: organization.name, slug: organization.slug })
			.from(organization)
			.where(eq(organization.id, row.orgId))
			.limit(1);
		if (o) org = o;
	}

	// Tasks for this project — same shape as /tasks page.
	const tasks = await loadTasks({ projectId: id, plannerUserId: locals.user.id });

	return {
		project: {
			id: row.id,
			key: row.key,
			name: row.name,
			description: row.description,
			color: row.color,
			icon: row.icon,
			status: row.status,
			leadId: row.leadId,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			archivedAt: row.archivedAt
		},
		lead,
		members,
		org,
		tasks
	};
};

export const actions: Actions = {
	archive: async ({ params, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		if (!params.id) return fail(400, { message: 'Missing project id.' });
		await db.update(project).set({ archivedAt: new Date() }).where(eq(project.id, params.id));
		return { success: true };
	},

	unarchive: async ({ params, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		if (!params.id) return fail(400, { message: 'Missing project id.' });
		await db.update(project).set({ archivedAt: null }).where(eq(project.id, params.id));
		return { success: true };
	},

	favoriteAdd: async ({ params, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		if (!params.id) return fail(400, { message: 'Missing project id.' });
		await db
			.insert(projectFavorite)
			.values({ userId: locals.user.id, projectId: params.id })
			.onConflictDoNothing();
		return { success: true };
	},

	favoriteRemove: async ({ params, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		if (!params.id) return fail(400, { message: 'Missing project id.' });
		await db
			.delete(projectFavorite)
			.where(
				and(
					eq(projectFavorite.userId, locals.user.id),
					eq(projectFavorite.projectId, params.id)
				)
			);
		return { success: true };
	},

	delete: async ({ params, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		if (!params.id) return fail(400, { message: 'Missing project id.' });
		// FK cascades take care of project_member, tasks, task_assignee, etc.
		await db.delete(project).where(eq(project.id, params.id));
		return { success: true };
	},

	memberAdd: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		if (!params.id) return fail(400, { message: 'Missing project id.' });

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();
		const role = String(form.get('role') ?? 'member');
		if (!userId) return fail(400, { message: 'Missing user.' });
		if (!ALLOWED_MEMBER_ROLES.has(role)) return fail(400, { message: 'Invalid role.' });

		const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
		if (!u) return fail(404, { message: 'User not found.' });

		try {
			await db
				.insert(projectMember)
				.values({ projectId: params.id, userId, role })
				.onConflictDoUpdate({
					target: [projectMember.projectId, projectMember.userId],
					set: { role }
				});
		} catch (err) {
			console.error('project memberAdd failed', err);
			return fail(500, { message: 'Failed to add member.' });
		}
		return { success: true };
	},

	leadSet: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		if (!params.id) return fail(400, { message: 'Missing project id.' });

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();

		try {
			if (!userId) {
				// Clear the lead.
				await db.update(project).set({ leadId: null }).where(eq(project.id, params.id));
				return { success: true };
			}

			// Require the new lead to already be a project member; the UI only
			// surfaces this from the member chip menu, so the constraint also
			// guards against stale form posts.
			const [m] = await db
				.select({ userId: projectMember.userId })
				.from(projectMember)
				.where(
					and(eq(projectMember.projectId, params.id), eq(projectMember.userId, userId))
				)
				.limit(1);
			if (!m) {
				return fail(400, { message: 'Lead must be a project member.' });
			}

			await db.update(project).set({ leadId: userId }).where(eq(project.id, params.id));
		} catch (err) {
			console.error('project leadSet failed', err);
			return fail(500, { message: 'Failed to update lead.' });
		}
		return { success: true };
	},

	memberRemove: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		if (!params.id) return fail(400, { message: 'Missing project id.' });

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();
		if (!userId) return fail(400, { message: 'Missing user.' });

		try {
			await db.transaction(async (tx) => {
				// If we're removing the project lead, clear the lead pointer too.
				const [proj] = await tx
					.select({ leadId: project.leadId })
					.from(project)
					.where(eq(project.id, params.id!))
					.limit(1);
				if (proj?.leadId === userId) {
					await tx
						.update(project)
						.set({ leadId: null })
						.where(eq(project.id, params.id!));
				}
				await tx
					.delete(projectMember)
					.where(
						and(
							eq(projectMember.projectId, params.id!),
							eq(projectMember.userId, userId)
						)
					);
			});
		} catch (err) {
			console.error('project memberRemove failed', err);
			return fail(500, { message: 'Failed to remove member.' });
		}
		return { success: true };
	}
};
