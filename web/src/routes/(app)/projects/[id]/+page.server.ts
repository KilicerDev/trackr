import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	project,
	projectActivity,
	projectFavorite,
	projectMember,
	organization
} from '$lib/server/db/app.schema';
import { user } from '$lib/server/db/auth.schema';
import { loadTasks } from '$lib/server/tasks';
import { loadProjectActivity } from '$lib/server/activity-feed';
import { logActivityFF } from '$lib/server/activity';
import { recordAudit } from '$lib/server/audit';
import { notify } from '$lib/server/notify';
import { projectMentionRecipients } from '$lib/server/notify-recipients';
import { parseMentionIds } from '$lib/mentions';
import { assertCan } from '$lib/server/permissions';
import { m } from '$lib/paraglide/messages';

// "KEY · Name" for the audit log's target column. Best-effort; returns the id
// if the project can't be read.
async function projectLabel(id: string): Promise<string> {
	const [p] = await db
		.select({ name: project.name, key: project.key })
		.from(project)
		.where(eq(project.id, id))
		.limit(1);
	return p ? `${p.key} · ${p.name}` : id;
}

const ALLOWED_MEMBER_ROLES = new Set(['project.manager', 'project.member', 'project.viewer']);
const ALLOWED_STATUSES = new Set([
	'prospect',
	'planned',
	'active',
	'paused',
	'completed',
	'cancelled',
	'archived'
]);

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
	if (!id) throw error(404, m.projects_not_found());

	const [row] = await db.select().from(project).where(eq(project.id, id)).limit(1);
	if (!row) throw error(404, m.projects_not_found());

	// Authorise read access. Trackr team is granted via their internal-org
	// role (project.tasks.read); project members get it via their explicit
	// project_member row.
	await assertCan(locals, 'project.tasks.read', { projectId: id });

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

	// Initial page of the activity feed for the history sidebar. The sidebar
	// fetches further pages on demand via the `?/activity` endpoint.
	const activity = await loadProjectActivity(id, { limit: 50 });

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
			updatedAt: row.updatedAt
		},
		lead,
		members,
		org,
		tasks,
		activity
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401, m.projects_not_authenticated());
		if (!params.id) return fail(400, { message: m.projects_missing_id() });
		await assertCan(locals, 'project.edit', { projectId: params.id });

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const description = String(form.get('description') ?? '').trim();
		const status = String(form.get('status') ?? '').trim();
		const color = String(form.get('color') ?? '').trim();

		if (!name) return fail(400, { message: m.projects_name_required_edit() });
		if (!ALLOWED_STATUSES.has(status)) return fail(400, { message: m.projects_invalid_status() });

		const icon = (name[0] ?? 'P').toUpperCase();

		const [prior] = await db
			.select({
				name: project.name,
				description: project.description,
				status: project.status,
				color: project.color
			})
			.from(project)
			.where(eq(project.id, params.id))
			.limit(1);
		if (!prior) return fail(404, { message: m.projects_not_found_period() });

		try {
			await db
				.update(project)
				.set({
					name,
					description: description || null,
					status,
					icon,
					...(color ? { color } : {}),
					updatedAt: new Date()
				})
				.where(eq(project.id, params.id));
		} catch (err) {
			console.error('project update failed', err);
			return fail(500, { message: m.projects_update_failed() });
		}

		const actorId = locals.user.id;
		if (name !== prior.name) {
			logActivityFF({
				projectId: params.id,
				actorId,
				type: 'project.name',
				meta: { from: prior.name, to: name }
			});
		}
		if ((description || null) !== prior.description) {
			logActivityFF({ projectId: params.id, actorId, type: 'project.description' });
		}
		if (status !== prior.status) {
			logActivityFF({
				projectId: params.id,
				actorId,
				type: 'project.status',
				meta: { from: prior.status, to: status }
			});
		}
		if (color && color !== prior.color) {
			logActivityFF({
				projectId: params.id,
				actorId,
				type: 'project.color',
				meta: { from: prior.color, to: color }
			});
		}
		void recordAudit({
			type: 'project.update',
			actorId,
			targetType: 'project',
			targetId: params.id,
			targetLabel: name,
			meta: { status, statusFrom: prior.status }
		});
		return { success: true };
	},

	// Archive is now a status value rather than a separate timestamp column.
	// Until the project audit log lands (which will record the prior status),
	// unarchive restores to 'active' as a sensible default.
	archive: async ({ params, locals }) => {
		if (!locals.user) throw error(401, m.projects_not_authenticated());
		if (!params.id) return fail(400, { message: m.projects_missing_id() });
		await assertCan(locals, 'project.archive', { projectId: params.id });
		await db
			.update(project)
			.set({ status: 'archived', updatedAt: new Date() })
			.where(eq(project.id, params.id));
		logActivityFF({
			projectId: params.id,
			actorId: locals.user.id,
			type: 'project.status',
			meta: { to: 'archived' }
		});
		void recordAudit({
			type: 'project.archive',
			actorId: locals.user.id,
			targetType: 'project',
			targetId: params.id,
			targetLabel: await projectLabel(params.id)
		});
		return { success: true };
	},

	unarchive: async ({ params, locals }) => {
		if (!locals.user) throw error(401, m.projects_not_authenticated());
		if (!params.id) return fail(400, { message: m.projects_missing_id() });
		await assertCan(locals, 'project.archive', { projectId: params.id });
		await db
			.update(project)
			.set({ status: 'active', updatedAt: new Date() })
			.where(eq(project.id, params.id));
		logActivityFF({
			projectId: params.id,
			actorId: locals.user.id,
			type: 'project.status',
			meta: { from: 'archived', to: 'active' }
		});
		return { success: true };
	},

	favoriteAdd: async ({ params, locals }) => {
		if (!locals.user) throw error(401, m.projects_not_authenticated());
		if (!params.id) return fail(400, { message: m.projects_missing_id() });
		await db
			.insert(projectFavorite)
			.values({ userId: locals.user.id, projectId: params.id })
			.onConflictDoNothing();
		return { success: true };
	},

	favoriteRemove: async ({ params, locals }) => {
		if (!locals.user) throw error(401, m.projects_not_authenticated());
		if (!params.id) return fail(400, { message: m.projects_missing_id() });
		await db
			.delete(projectFavorite)
			.where(
				and(eq(projectFavorite.userId, locals.user.id), eq(projectFavorite.projectId, params.id))
			);
		return { success: true };
	},

	delete: async ({ params, locals }) => {
		if (!locals.user) throw error(401, m.projects_not_authenticated());
		if (!params.id) return fail(400, { message: m.projects_missing_id() });
		// project.archive is the closest existing perm; project deletion is
		// strictly more destructive but we don't model a separate perm yet.
		// Restrict to managers and Trackr admins via project.archive.
		await assertCan(locals, 'project.archive', { projectId: params.id });
		const label = await projectLabel(params.id);
		// FK cascades take care of project_member, tasks, task_assignee, etc.
		await db.delete(project).where(eq(project.id, params.id));
		void recordAudit({
			type: 'project.delete',
			actorId: locals.user.id,
			targetType: 'project',
			targetId: params.id,
			targetLabel: label
		});
		return { success: true };
	},

	memberAdd: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401, m.projects_not_authenticated());
		if (!params.id) return fail(400, { message: m.projects_missing_id() });
		await assertCan(locals, 'project.members.manage', { projectId: params.id });

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();
		const role = String(form.get('role') ?? 'project.member');
		if (!userId) return fail(400, { message: m.projects_missing_user() });
		if (!ALLOWED_MEMBER_ROLES.has(role)) return fail(400, { message: m.projects_invalid_role() });

		const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
		if (!u) return fail(404, { message: m.projects_user_not_found() });

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
			return fail(500, { message: m.projects_add_member_failed() });
		}
		logActivityFF({
			projectId: params.id,
			actorId: locals.user.id,
			type: 'member.added',
			meta: { userId, role }
		});
		void recordAudit({
			type: 'project.member',
			actorId: locals.user.id,
			targetType: 'project',
			targetId: params.id,
			targetLabel: await projectLabel(params.id),
			meta: { action: 'add', userId, role }
		});
		return { success: true };
	},

	leadSet: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401, m.projects_not_authenticated());
		if (!params.id) return fail(400, { message: m.projects_missing_id() });
		await assertCan(locals, 'project.members.manage', { projectId: params.id });

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();

		try {
			if (!userId) {
				// Clear the lead.
				await db.update(project).set({ leadId: null }).where(eq(project.id, params.id));
				logActivityFF({
					projectId: params.id,
					actorId: locals.user.id,
					type: 'lead.cleared'
				});
				return { success: true };
			}

			// Require the new lead to already be a project member; the UI only
			// surfaces this from the member chip menu, so the constraint also
			// guards against stale form posts.
			const [member] = await db
				.select({ userId: projectMember.userId })
				.from(projectMember)
				.where(and(eq(projectMember.projectId, params.id), eq(projectMember.userId, userId)))
				.limit(1);
			if (!member) {
				return fail(400, { message: m.projects_lead_must_be_member() });
			}

			await db.update(project).set({ leadId: userId }).where(eq(project.id, params.id));
		} catch (err) {
			console.error('project leadSet failed', err);
			return fail(500, { message: m.projects_update_lead_failed() });
		}
		logActivityFF({
			projectId: params.id,
			actorId: locals.user.id,
			type: 'lead.set',
			meta: { userId }
		});
		return { success: true };
	},

	memberSetRole: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401, m.projects_not_authenticated());
		if (!params.id) return fail(400, { message: m.projects_missing_id() });
		await assertCan(locals, 'project.members.manage', { projectId: params.id });

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();
		const role = String(form.get('role') ?? '');
		if (!userId) return fail(400, { message: m.projects_missing_user() });
		if (!ALLOWED_MEMBER_ROLES.has(role)) return fail(400, { message: m.projects_invalid_role() });

		await db
			.update(projectMember)
			.set({ role })
			.where(and(eq(projectMember.projectId, params.id), eq(projectMember.userId, userId)));
		logActivityFF({
			projectId: params.id,
			actorId: locals.user.id,
			type: 'member.role',
			meta: { userId, role }
		});
		void recordAudit({
			type: 'project.member',
			actorId: locals.user.id,
			targetType: 'project',
			targetId: params.id,
			targetLabel: await projectLabel(params.id),
			meta: { action: 'role', userId, role }
		});
		return { success: true };
	},

	memberRemove: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401, m.projects_not_authenticated());
		if (!params.id) return fail(400, { message: m.projects_missing_id() });
		await assertCan(locals, 'project.members.manage', { projectId: params.id });

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();
		if (!userId) return fail(400, { message: m.projects_missing_user() });

		try {
			await db.transaction(async (tx) => {
				// If we're removing the project lead, clear the lead pointer too.
				const [proj] = await tx
					.select({ leadId: project.leadId })
					.from(project)
					.where(eq(project.id, params.id!))
					.limit(1);
				if (proj?.leadId === userId) {
					await tx.update(project).set({ leadId: null }).where(eq(project.id, params.id!));
				}
				await tx
					.delete(projectMember)
					.where(and(eq(projectMember.projectId, params.id!), eq(projectMember.userId, userId)));
			});
		} catch (err) {
			console.error('project memberRemove failed', err);
			return fail(500, { message: m.projects_remove_member_failed() });
		}
		logActivityFF({
			projectId: params.id,
			actorId: locals.user.id,
			type: 'member.removed',
			meta: { userId }
		});
		void recordAudit({
			type: 'project.member',
			actorId: locals.user.id,
			targetType: 'project',
			targetId: params.id,
			targetLabel: await projectLabel(params.id),
			meta: { action: 'remove', userId }
		});
		return { success: true };
	},

	// Project-level comment posted from the history sidebar (taskId stays null).
	commentAdd: async ({ request, params, locals, url }) => {
		if (!locals.user) throw error(401, m.projects_not_authenticated());
		if (!params.id) return fail(400, { message: m.projects_missing_id() });
		await assertCan(locals, 'project.tasks.read', { projectId: params.id });

		const form = await request.formData();
		const body = String(form.get('body') ?? '').trim();
		if (!body) return fail(400, { message: m.projects_comment_empty() });

		try {
			await db.insert(projectActivity).values({
				id: crypto.randomUUID(),
				projectId: params.id,
				actorId: locals.user.id,
				type: 'comment',
				body
			});
		} catch (err) {
			console.error('project comment add failed', err);
			return fail(500, { message: m.projects_add_comment_failed() });
		}

		// Notify members @-mentioned in the comment.
		const mentioned = await projectMentionRecipients(params.id, parseMentionIds(body));
		if (mentioned.size > 0) {
			const [proj] = await db
				.select({ name: project.name, orgId: project.orgId })
				.from(project)
				.where(eq(project.id, params.id))
				.limit(1);
			void notify({
				kind: 'mentioned',
				recipients: mentioned,
				actorId: locals.user.id,
				orgId: proj?.orgId ?? null,
				render: (locale) => ({
					title: m.notify_mentioned({ label: proj?.name ?? '' }, { locale }),
					body
				}),
				url: `/projects/${params.id}`,
				entity: { type: 'project', id: params.id },
				baseUrl: url.origin
			}).catch((err) => console.error('project comment mention notify failed', err));
		}

		return { success: true };
	},

	// Pagination endpoint for the history sidebar's "load more".
	activity: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401, m.projects_not_authenticated());
		if (!params.id) return fail(400, { message: m.projects_missing_id() });
		await assertCan(locals, 'project.tasks.read', { projectId: params.id });

		const form = await request.formData();
		const offset = Number(form.get('offset') ?? 0);
		const items = await loadProjectActivity(params.id, {
			limit: 50,
			offset: Number.isFinite(offset) && offset > 0 ? offset : 0
		});
		return { success: true, items };
	}
};
