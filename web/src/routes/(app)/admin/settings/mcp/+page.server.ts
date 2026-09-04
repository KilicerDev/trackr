import { error, fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { assertCan } from '$lib/server/permissions';
import { recordAudit } from '$lib/server/audit';
import { canManageTarget, isSuperadmin } from '$lib/roles';
import { m } from '$lib/paraglide/messages';
import {
	getMcpConnection,
	listMcpAccess,
	listMcpConnections,
	revokeAllForUser,
	revokeMcpConnection,
	setMcpAccess
} from '$lib/server/mcp/access';

async function guard(locals: App.Locals) {
	await assertCan(locals, 'admin.settings.manage');
	if (!locals.user) throw error(401, m.settings_err_not_authenticated());
	return locals.user;
}

function roleOf(u: { role?: string | null } | undefined): string | null | undefined {
	return u?.role;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = await guard(locals);
	const callerRole = roleOf(me);
	const [access, connections, users] = await Promise.all([
		listMcpAccess(),
		listMcpConnections(),
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
	// Superadmin accounts (and their connections) are invisible to plain
	// admins — same rule as user management and API keys.
	const mcpUrl = `${url.origin}/api/mcp`;
	return {
		mcpUrl,
		claudeCodeCommand: `claude mcp add --transport http trackr ${mcpUrl}`,
		users: users
			.filter((u) => canManageTarget(callerRole, u.role))
			.map((u) => ({
				id: u.id,
				name: u.name,
				email: u.email,
				role: u.role,
				enabled: enabled.has(u.id),
				connections: connectionCount.get(u.id) ?? 0
			})),
		connections: connections.filter((c) => canManageTarget(callerRole, c.userRole)),
		isSuperadmin: isSuperadmin(callerRole)
	};
};

async function manageableUser(me: { role?: string | null }, userId: string) {
	if (!userId) return { fail: fail(400, { message: m.mcp_err_user_required() }) };
	const [target] = await db
		.select({
			id: userTable.id,
			name: userTable.name,
			role: userTable.role,
			banned: userTable.banned
		})
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);
	if (!target || target.banned) return { fail: fail(400, { message: m.mcp_err_user_required() }) };
	if (!canManageTarget(roleOf(me), target.role))
		return { fail: fail(403, { message: m.mcp_err_user_forbidden() }) };
	return { target };
}

export const actions: Actions = {
	enable: async ({ request, locals }) => {
		const me = await guard(locals);
		const userId = String((await request.formData()).get('userId') ?? '').trim();
		const res = await manageableUser(me, userId);
		if ('fail' in res) return res.fail;
		await setMcpAccess(res.target.id, true, me.id);
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
		const res = await manageableUser(me, userId);
		if ('fail' in res) return res.fail;
		await setMcpAccess(res.target.id, false, me.id);
		// Hard cut-off: issued tokens would be refused anyway, but leaving them
		// around only confuses the connections list.
		const revoked = await revokeAllForUser(res.target.id);
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
		if (!existing || !canManageTarget(roleOf(me), existing.userRole))
			return fail(404, { message: m.mcp_err_not_found() });
		if (!(await revokeMcpConnection(id))) return fail(404, { message: m.mcp_err_not_found() });
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
	}
};
