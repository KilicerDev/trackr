import { error, fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { assertCan } from '$lib/server/permissions';
import { recordAudit } from '$lib/server/audit';
import { isSuperadmin } from '$lib/roles';
import { canManageMcpFor, canViewUser, isRoot } from '$lib/server/user-policy';
import { m } from '$lib/paraglide/messages';
import {
	getMcpConnection,
	listMcpAccess,
	listMcpConnections,
	revokeAllForUser,
	revokeMcpConnection,
	setMcpAccess
} from '$lib/server/mcp/access';
import {
	deleteGuide,
	getInstructions,
	GuidanceError,
	INSTRUCTIONS_MAX_CHARS,
	listGuides,
	refreshGuide,
	setGuideEnabled,
	setInstructions
} from '$lib/server/mcp/guidance';
import { guidanceErrorMessage } from '$lib/server/mcp/guidance-messages';

async function guard(locals: App.Locals) {
	await assertCan(locals, 'admin.settings.manage');
	if (!locals.user) throw error(401, m.settings_err_not_authenticated());
	return locals.user;
}

/** Audit a refused MCP-access operation (the policy said no). */
function denied(
	me: App.Locals['user'],
	reason: string,
	target: { id: string; email?: string | null }
) {
	void recordAudit({
		type: 'authz.denied',
		actorId: me?.id ?? null,
		actorLabel: me?.email ?? null,
		targetType: 'user',
		targetId: target.id,
		targetLabel: target.email ?? null,
		meta: { path: '/admin/settings/mcp', reason }
	});
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = await guard(locals);
	const [access, connections, instructions, guides, users] = await Promise.all([
		listMcpAccess(),
		listMcpConnections(),
		getInstructions(),
		listGuides(),
		db
			.select({
				id: userTable.id,
				name: userTable.name,
				email: userTable.email,
				role: userTable.role
			})
			.from(userTable)
			.where(eq(userTable.banned, false))
			.orderBy(asc(userTable.name))
	]);
	const enabled = new Set(access.map((a) => a.userId));
	const connectionCount = new Map<string, number>();
	for (const c of connections) {
		if (c.userId) connectionCount.set(c.userId, (connectionCount.get(c.userId) ?? 0) + 1);
	}
	// Same tier or below only (admins never see superadmins) — same rule as
	// user management and API keys.
	const mcpUrl = `${url.origin}/api/mcp`;
	return {
		mcpUrl,
		claudeCodeCommand: `claude mcp add --transport http trackr ${mcpUrl}`,
		instructions: instructions.instructions,
		instructionsUpdatedAt: instructions.updatedAt,
		instructionsMax: INSTRUCTIONS_MAX_CHARS,
		guides: guides.map((g) => ({
			id: g.id,
			slug: g.slug,
			title: g.title,
			summary: g.summary,
			sourceUrl: g.sourceUrl,
			fetchedAt: g.fetchedAt,
			enabled: g.enabled,
			updatedAt: g.updatedAt,
			bodyChars: g.body.length
		})),
		users: users
			.filter((u) => canViewUser(me, u))
			.map((u) => ({
				id: u.id,
				name: u.name,
				email: u.email,
				role: u.role,
				enabled: enabled.has(u.id),
				connections: connectionCount.get(u.id) ?? 0
			})),
		connections: connections.filter((c) =>
			canViewUser(me, { id: c.userId ?? '', role: c.userRole })
		),
		isSuperadmin: isSuperadmin(me.role)
	};
};

async function manageableUser(me: NonNullable<App.Locals['user']>, userId: string, reason: string) {
	if (!userId) return { fail: fail(400, { message: m.mcp_err_user_required() }) };
	const [target] = await db
		.select({
			id: userTable.id,
			name: userTable.name,
			email: userTable.email,
			role: userTable.role,
			isRoot: userTable.isRoot,
			banned: userTable.banned
		})
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);
	// Tiers the actor cannot see answer like an unknown user.
	if (!target || target.banned || !canViewUser(me, target)) {
		return { fail: fail(400, { message: m.mcp_err_user_required() }) };
	}
	if (!canManageMcpFor(me, target)) {
		denied(me, reason, target);
		return {
			fail: fail(403, {
				message: isRoot(target) ? m.admin_err_root_untouchable() : m.mcp_err_user_forbidden()
			})
		};
	}
	return { target };
}

export const actions: Actions = {
	enable: async ({ request, locals }) => {
		const me = await guard(locals);
		const userId = String((await request.formData()).get('userId') ?? '').trim();
		const res = await manageableUser(me, userId, 'mcp_enable');
		if ('fail' in res) return res.fail;
		await setMcpAccess(res.target.id, true, me);
		void recordAudit({
			type: 'mcp_access.enable',
			actorId: me.id,
			targetType: 'user',
			targetId: res.target.id,
			targetLabel: res.target.name
		});
		return { success: true, enabled: res.target.id };
	},

	disable: async ({ request, locals }) => {
		const me = await guard(locals);
		const userId = String((await request.formData()).get('userId') ?? '').trim();
		const res = await manageableUser(me, userId, 'mcp_disable');
		if ('fail' in res) return res.fail;
		await setMcpAccess(res.target.id, false, me);
		// Hard cut-off: issued tokens would be refused anyway, but leaving them
		// around only confuses the connections list.
		const revoked = await revokeAllForUser(res.target.id, me);
		void recordAudit({
			type: 'mcp_access.disable',
			actorId: me.id,
			targetType: 'user',
			targetId: res.target.id,
			targetLabel: res.target.name,
			meta: { revokedConnections: revoked }
		});
		return { success: true, disabled: res.target.id };
	},

	revoke: async ({ request, locals }) => {
		const me = await guard(locals);
		const id = String((await request.formData()).get('id') ?? '').trim();
		const existing = id ? await getMcpConnection(id) : null;
		const owner = existing ? { id: existing.userId ?? '', role: existing.userRole } : null;
		if (!existing || !owner || !canViewUser(me, owner))
			return fail(404, { message: m.mcp_err_not_found() });
		if (!(await revokeMcpConnection(id, me))) return fail(404, { message: m.mcp_err_not_found() });
		void recordAudit({
			type: 'mcp_connection.revoke',
			actorId: me.id,
			targetType: 'mcp_connection',
			targetId: id,
			targetLabel: existing.clientName ?? existing.clientId ?? null,
			meta: {
				userId: existing.userId,
				userName: existing.userName,
				clientId: existing.clientId,
				clientName: existing.clientName
			}
		});
		return { success: true, revoked: id };
	},
	saveInstructions: async ({ request, locals }) => {
		const me = await guard(locals);
		const text = String((await request.formData()).get('instructions') ?? '');
		try {
			await setInstructions(text, me.id);
		} catch (err) {
			if (err instanceof GuidanceError) return fail(400, { message: guidanceErrorMessage(err) });
			throw err;
		}
		void recordAudit({
			type: 'mcp_instructions.update',
			actorId: me.id,
			targetType: 'mcp_settings',
			targetId: 'default',
			meta: { chars: text.trim().length }
		});
		return { success: true, instructions: true };
	},

	guideEnable: async ({ request, locals }) => {
		const me = await guard(locals);
		const id = String((await request.formData()).get('id') ?? '').trim();
		const row = id ? await setGuideEnabled(id, true, me.id) : null;
		if (!row) return fail(404, { message: m.mcp_guide_err_not_found() });
		void recordAudit({
			type: 'mcp_guide.update',
			actorId: me.id,
			targetType: 'mcp_guide',
			targetId: id,
			targetLabel: row.title,
			meta: { enabled: true }
		});
		return { success: true };
	},

	guideDisable: async ({ request, locals }) => {
		const me = await guard(locals);
		const id = String((await request.formData()).get('id') ?? '').trim();
		const row = id ? await setGuideEnabled(id, false, me.id) : null;
		if (!row) return fail(404, { message: m.mcp_guide_err_not_found() });
		void recordAudit({
			type: 'mcp_guide.update',
			actorId: me.id,
			targetType: 'mcp_guide',
			targetId: id,
			targetLabel: row.title,
			meta: { enabled: false }
		});
		return { success: true };
	},

	guideRefresh: async ({ request, locals }) => {
		const me = await guard(locals);
		const id = String((await request.formData()).get('id') ?? '').trim();
		try {
			const row = await refreshGuide(id, me.id);
			void recordAudit({
				type: 'mcp_guide.update',
				actorId: me.id,
				targetType: 'mcp_guide',
				targetId: id,
				targetLabel: row.title,
				meta: { refreshedFrom: row.sourceUrl, chars: row.body.length }
			});
			return { success: true, refreshed: id };
		} catch (err) {
			if (err instanceof GuidanceError) return fail(400, { message: guidanceErrorMessage(err) });
			throw err;
		}
	},

	guideDelete: async ({ request, locals }) => {
		const me = await guard(locals);
		const id = String((await request.formData()).get('id') ?? '').trim();
		const row = id ? await deleteGuide(id) : null;
		if (!row) return fail(404, { message: m.mcp_guide_err_not_found() });
		void recordAudit({
			type: 'mcp_guide.delete',
			actorId: me.id,
			targetType: 'mcp_guide',
			targetId: id,
			targetLabel: row.title,
			meta: { slug: row.slug }
		});
		return { success: true, deleted: id };
	}
};
