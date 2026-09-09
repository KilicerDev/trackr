import { error, fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { assertCan } from '$lib/server/permissions';
import { recordAudit } from '$lib/server/audit';
import { isSuperadmin } from '$lib/roles';
import {
	canCreateApiKeyFor,
	canManageApiKeyFor,
	canViewUser,
	isRoot
} from '$lib/server/user-policy';
import { m } from '$lib/paraglide/messages';
import {
	createApiKey,
	deleteApiKey,
	getApiKey,
	listApiKeys,
	revokeApiKey
} from '$lib/server/api-keys';

// Expiry choices offered by the create form, in days. '' = never.
const EXPIRY_DAYS = new Set(['', '30', '90', '365']);

async function guard(locals: App.Locals) {
	await assertCan(locals, 'admin.settings.manage');
	if (!locals.user) throw error(401, m.settings_err_not_authenticated());
	return locals.user;
}

/** Audit a refused key operation (the policy said no). */
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
		meta: { path: '/admin/settings/api-keys', reason }
	});
}

export const load: PageServerLoad = async ({ locals }) => {
	const me = await guard(locals);
	const [keys, users] = await Promise.all([
		listApiKeys(),
		db
			.select({
				id: userTable.id,
				name: userTable.name,
				email: userTable.email,
				role: userTable.role,
				banned: userTable.banned
			})
			.from(userTable)
			.where(eq(userTable.banned, false))
			.orderBy(asc(userTable.name))
	]);
	// Same tier or below only (admins never see superadmins) — same rule as
	// user management. Root's keys are listed for superadmins but can only be
	// managed by root (policy).
	return {
		keys: keys.filter((k) => canViewUser(me, k.user)),
		users: users
			.filter((u) => canViewUser(me, u))
			.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
		isSuperadmin: isSuperadmin(me.role)
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const me = await guard(locals);
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();
		const name = String(form.get('name') ?? '').trim();
		const expiry = String(form.get('expiry') ?? '').trim();

		if (!userId) return fail(400, { message: m.api_keys_err_user_required() });
		if (!name) return fail(400, { message: m.api_keys_err_name_required() });
		if (name.length > 120) return fail(400, { message: m.api_keys_err_name_required() });
		if (!EXPIRY_DAYS.has(expiry)) return fail(400, { message: m.api_keys_err_save_failed() });

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
			return fail(400, { message: m.api_keys_err_user_required() });
		}
		if (!canCreateApiKeyFor(me, target)) {
			denied(me, 'api_key_create', target);
			return fail(403, {
				message: isRoot(target) ? m.admin_err_root_untouchable() : m.api_keys_err_user_forbidden()
			});
		}

		const expiresAt = expiry ? new Date(Date.now() + Number(expiry) * 86_400_000) : null;
		// createApiKey re-checks the policy itself (backstop for other callers).
		const { key, plaintext } = await createApiKey({ userId, name, expiresAt }, me);
		void recordAudit({
			type: 'api_key.create',
			actorId: me.id,
			targetType: 'api_key',
			targetId: key.id,
			targetLabel: key.name,
			meta: { userId: target.id, userName: target.name, keyPrefix: key.keyPrefix, expiresAt }
		});
		return { success: true, id: key.id, secret: plaintext };
	},

	revoke: async ({ request, locals }) => {
		const me = await guard(locals);
		const id = String((await request.formData()).get('id') ?? '').trim();
		const existing = id ? await getApiKey(id) : null;
		if (!existing || !canViewUser(me, existing.user))
			return fail(404, { message: m.api_keys_err_not_found() });
		if (!canManageApiKeyFor(me, existing.user)) {
			denied(me, 'api_key_revoke', existing.user);
			return fail(403, { message: m.admin_err_root_untouchable() });
		}
		if (!(await revokeApiKey(id, me))) return fail(404, { message: m.api_keys_err_not_found() });
		void recordAudit({
			type: 'api_key.revoke',
			actorId: me.id,
			targetType: 'api_key',
			targetId: id,
			targetLabel: existing.name,
			meta: {
				userId: existing.user.id,
				userName: existing.user.name,
				keyPrefix: existing.keyPrefix
			}
		});
		return { success: true, revoked: id };
	},

	delete: async ({ request, locals }) => {
		const me = await guard(locals);
		const id = String((await request.formData()).get('id') ?? '').trim();
		const existing = id ? await getApiKey(id) : null;
		if (!existing || !canViewUser(me, existing.user))
			return fail(404, { message: m.api_keys_err_not_found() });
		if (!canManageApiKeyFor(me, existing.user)) {
			denied(me, 'api_key_delete', existing.user);
			return fail(403, { message: m.admin_err_root_untouchable() });
		}
		await deleteApiKey(id, me);
		void recordAudit({
			type: 'api_key.delete',
			actorId: me.id,
			targetType: 'api_key',
			targetId: id,
			targetLabel: existing.name,
			meta: {
				userId: existing.user.id,
				userName: existing.user.name,
				keyPrefix: existing.keyPrefix
			}
		});
		return { success: true, deleted: id };
	}
};
