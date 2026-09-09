import { error, fail } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pushToken } from '$lib/server/db/app.schema';
import { recordAudit } from '$lib/server/audit';
import {
	createApiKey,
	deleteApiKey,
	getApiKey,
	listApiKeys,
	revokeApiKey
} from '$lib/server/api-keys';
import {
	getMcpConnection,
	isMcpEnabled,
	listMcpConnectionsFor,
	revokeOwnMcpConnection
} from '$lib/server/mcp/access';
import { canCreateApiKeyFor } from '$lib/server/user-policy';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

// Connected apps — everything that acts as the signed-in user from outside
// the browser: MCP assistants (status + setup + own OAuth connections), own
// trk_ API keys, and the devices registered for push. Ownership is the only
// rule here; the admin registries under /admin/settings stay superadmin tier.

const EXPIRY_DAYS = new Set(['', '30', '90', '365']);

function requireUser(locals: App.Locals) {
	if (!locals.user) throw error(401, m.settings_err_not_authenticated());
	return locals.user;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = requireUser(locals);
	const [mcpEnabled, connections, keys, devices] = await Promise.all([
		isMcpEnabled(me.id),
		listMcpConnectionsFor(me.id),
		listApiKeys({ userId: me.id }),
		db
			.select({
				id: pushToken.id,
				token: pushToken.token,
				platform: pushToken.platform,
				deviceName: pushToken.deviceName,
				createdAt: pushToken.createdAt,
				lastSeenAt: pushToken.lastSeenAt
			})
			.from(pushToken)
			.where(eq(pushToken.userId, me.id))
			.orderBy(desc(pushToken.lastSeenAt))
	]);
	const mcpUrl = `${url.origin}/api/mcp`;
	return {
		// Keys are admin-issued: only admin-like users mint their own here.
		canCreateKeys: canCreateApiKeyFor(me, me),
		mcp: {
			enabled: mcpEnabled,
			url: mcpUrl,
			claudeCodeCommand: `claude mcp add --transport http trackr ${mcpUrl}`
		},
		connections: connections.map((c) => ({
			id: c.id,
			clientId: c.clientId,
			clientName: c.clientName,
			createdAt: c.createdAt,
			accessTokenExpiresAt: c.accessTokenExpiresAt,
			refreshTokenExpiresAt: c.refreshTokenExpiresAt
		})),
		keys: keys.map((k) => ({
			id: k.id,
			name: k.name,
			keyPrefix: k.keyPrefix,
			status: k.status,
			createdAt: k.createdAt,
			lastUsedAt: k.lastUsedAt,
			expiresAt: k.expiresAt
		})),
		devices: devices.map((d) => ({
			id: d.id,
			tokenPrefix: d.token.slice(0, 8),
			platform: d.platform,
			deviceName: d.deviceName,
			createdAt: d.createdAt,
			lastSeenAt: d.lastSeenAt
		}))
	};
};

async function field(event: RequestEvent, name: string): Promise<string> {
	return String((await event.request.formData()).get(name) ?? '').trim();
}

/** One of the caller's own keys, or null (someone else's answers like a missing one). */
async function ownKey(id: string, userId: string) {
	const key = id ? await getApiKey(id) : null;
	return key && key.userId === userId ? key : null;
}

export const actions: Actions = {
	keyCreate: async (event) => {
		const me = requireUser(event.locals);
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const expiry = String(form.get('expiry') ?? '').trim();
		if (!name || name.length > 120) return fail(400, { message: m.api_keys_err_name_required() });
		if (!EXPIRY_DAYS.has(expiry)) return fail(400, { message: m.api_keys_err_save_failed() });
		const expiresAt = expiry ? new Date(Date.now() + Number(expiry) * 86_400_000) : null;
		// Admin-issued: a plain user is refused here (createApiKey re-checks it).
		if (!canCreateApiKeyFor(me, me)) return fail(403, { message: m.api_keys_err_user_forbidden() });
		const { key, plaintext } = await createApiKey({ userId: me.id, name, expiresAt }, me);
		void recordAudit(
			{
				type: 'api_key.create',
				actorId: me.id,
				targetType: 'api_key',
				targetId: key.id,
				targetLabel: key.name,
				meta: { userId: me.id, userName: me.name, keyPrefix: key.keyPrefix, expiresAt, self: true }
			},
			event
		);
		return { success: true, id: key.id, secret: plaintext };
	},

	keyRevoke: async (event) => {
		const me = requireUser(event.locals);
		const id = await field(event, 'id');
		const existing = await ownKey(id, me.id);
		if (!existing || !(await revokeApiKey(id, me))) {
			return fail(404, { message: m.api_keys_err_not_found() });
		}
		void recordAudit(
			{
				type: 'api_key.revoke',
				actorId: me.id,
				targetType: 'api_key',
				targetId: id,
				targetLabel: existing.name,
				meta: { userId: me.id, userName: me.name, keyPrefix: existing.keyPrefix, self: true }
			},
			event
		);
		return { success: true, revoked: id };
	},

	keyDelete: async (event) => {
		const me = requireUser(event.locals);
		const id = await field(event, 'id');
		const existing = await ownKey(id, me.id);
		if (!existing) return fail(404, { message: m.api_keys_err_not_found() });
		await deleteApiKey(id, me);
		void recordAudit(
			{
				type: 'api_key.delete',
				actorId: me.id,
				targetType: 'api_key',
				targetId: id,
				targetLabel: existing.name,
				meta: { userId: me.id, userName: me.name, keyPrefix: existing.keyPrefix, self: true }
			},
			event
		);
		return { success: true, deleted: id };
	},

	connectionRevoke: async (event) => {
		const me = requireUser(event.locals);
		const id = await field(event, 'id');
		const existing = id ? await getMcpConnection(id) : null;
		if (!existing || existing.userId !== me.id || !(await revokeOwnMcpConnection(id, me.id))) {
			return fail(404, { message: m.mcp_err_not_found() });
		}
		void recordAudit(
			{
				type: 'mcp_connection.revoke',
				actorId: me.id,
				targetType: 'mcp_connection',
				targetId: id,
				targetLabel: existing.clientName ?? existing.clientId ?? null,
				meta: {
					userId: me.id,
					userName: me.name,
					clientId: existing.clientId,
					clientName: existing.clientName,
					self: true
				}
			},
			event
		);
		return { success: true, revoked: id };
	},

	deviceRemove: async (event) => {
		const me = requireUser(event.locals);
		const id = await field(event, 'id');
		if (!id) return fail(400, { message: m.devices_action_error() });
		// Ownership is part of the delete itself: someone else's row is simply
		// not matched and answers like a missing one.
		const deleted = await db
			.delete(pushToken)
			.where(and(eq(pushToken.id, id), eq(pushToken.userId, me.id)))
			.returning({ id: pushToken.id });
		if (!deleted.length) {
			return fail(404, { message: m.devices_action_error() });
		}
		return { success: true, removed: id };
	}
};
