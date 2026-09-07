// Policy enforcement for better-auth's admin plugin, transport-independent.
//
// Registered as the `hooks.before` handler for every `/admin/*` auth path
// (auth.ts). better-auth runs it for HTTP requests AND for in-process
// `auth.api.*` calls (api/to-auth-endpoints.mjs registers user hooks with a
// match-all matcher), so this is the one choke point through which every
// impersonation, role change, ban, deletion or password set passes —
// regardless of whether a form action, a script, or a raw request started it.
//
// The plugin's own checks only ask `hasPermission(role)`; the hierarchy
// (peers and below, root untouchable, no self role changes, superadmin-only
// impersonation) lives in $lib/server/user-policy and is applied here to the
// actor's session and the target user row. Denials are audited.

import { APIError, getSessionFromCtx } from 'better-auth/api';
import { recordAudit } from '$lib/server/audit';
import { isAdminLike } from '$lib/roles';
import {
	canAssignRole,
	canChangeRole,
	canImpersonate,
	canManageUser,
	isRoot,
	type PolicySubject
} from '$lib/server/user-policy';

/** The slice of better-auth's hook context this guard reads. */
export type AdminGuardContext = {
	path?: string;
	/** Set for HTTP requests only (the router builds it); absent for `auth.api.*`. */
	request?: Request;
	/** better-auth's own HTTP marker, set by better-call's router. */
	_flag?: string;
	body?: unknown;
	headers?: Headers;
	context: {
		internalAdapter: {
			findUserById(id: string): Promise<unknown>;
			findSession(token: string): Promise<unknown>;
		};
	};
};

type UserRow = PolicySubject & { email?: string | null };
type SessionResult = {
	user: UserRow;
	session: { impersonatedBy?: string | null };
} | null;

/** Paths that only read; any admin-like role may call them (results are filtered by the caller). */
const READ_ONLY = new Set(['/admin/list-users', '/admin/get-user', '/admin/has-permission']);

export const ADMIN_API_HTTP_DISABLED = 'ADMIN_API_HTTP_DISABLED';
export const ADMIN_POLICY_DENIED = 'ADMIN_POLICY_DENIED';

function ipOf(headers: Headers | undefined): string | null {
	if (!headers) return null;
	const fwd = headers.get('x-forwarded-for');
	if (fwd) return fwd.split(',')[0]?.trim() ?? null;
	return headers.get('x-real-ip');
}

function deny(
	ctx: AdminGuardContext,
	actor: UserRow | null,
	target: UserRow | null,
	reason: string,
	code = ADMIN_POLICY_DENIED
): never {
	void recordAudit({
		type: 'authz.denied',
		actorId: actor?.id ?? null,
		actorLabel: actor?.email ?? null,
		targetType: target ? 'user' : null,
		targetId: target?.id ?? null,
		targetLabel: target?.email ?? null,
		ipAddress: ipOf(ctx.headers),
		userAgent: ctx.headers?.get('user-agent') ?? null,
		meta: {
			path: ctx.path ?? null,
			transport: code === ADMIN_API_HTTP_DISABLED ? 'http' : 'api',
			reason
		}
	});
	const message =
		code === ADMIN_API_HTTP_DISABLED
			? 'The admin API is not available over HTTP.'
			: target && isRoot(target)
				? 'The root account cannot be modified.'
				: 'You are not allowed to perform this action on this user.';
	throw new APIError('FORBIDDEN', { message, code });
}

function bodyOf(ctx: AdminGuardContext): Record<string, unknown> {
	return ctx.body && typeof ctx.body === 'object' ? (ctx.body as Record<string, unknown>) : {};
}

export async function adminGuard(ctx: AdminGuardContext): Promise<void> {
	const path = ctx.path ?? '';

	// 1. Transport. Nothing in the app drives the admin plugin over HTTP; the
	//    form actions call auth.api.* in-process. hooks.server.ts already
	//    answers 403 for /api/auth/admin/*; this catches anything that gets
	//    past it (e.g. a differently mounted handler).
	if (ctx.request || ctx._flag === 'router') {
		deny(ctx, null, null, 'http_transport', ADMIN_API_HTTP_DISABLED);
	}

	// Ending an impersonation is bound to the caller's own session cookie.
	if (path === '/admin/stop-impersonating') return;

	// 2. Actor. Fail closed: better-auth lets create-user run without any
	//    session when called in-process — we don't.
	const session = (await getSessionFromCtx(
		ctx as unknown as Parameters<typeof getSessionFromCtx>[0]
	)) as SessionResult;
	if (!session) throw new APIError('UNAUTHORIZED', { message: 'Not authenticated.' });
	const actor = session.user;
	if (!isAdminLike(actor.role)) deny(ctx, actor, null, 'not_admin');

	// Reads are fine for any admin-like caller, impersonated or not — a
	// superadmin impersonating an admin must see what that admin sees (the
	// users page lists through /admin/list-users).
	if (READ_ONLY.has(path)) return;

	// No admin MUTATIONS from inside an impersonated session — the audit trail
	// would name the impersonated user, not the person acting.
	if (session.session.impersonatedBy) deny(ctx, actor, null, 'impersonated_session');

	const body = bodyOf(ctx);

	// 3. Creating a user: the requested role must be within the actor's reach.
	if (path === '/admin/create-user') {
		if (Array.isArray(body.role)) deny(ctx, actor, null, 'multi_role');
		const data = body.data;
		if (data && typeof data === 'object' && 'isRoot' in data)
			deny(ctx, actor, null, 'is_root_write');
		if (!canAssignRole(actor, typeof body.role === 'string' ? body.role : 'user')) {
			deny(ctx, actor, null, 'rank');
		}
		return;
	}

	// 4. Target user.
	let target: UserRow | null = null;
	if (path === '/admin/revoke-user-session') {
		const token = typeof body.sessionToken === 'string' ? body.sessionToken : '';
		const found = (await ctx.context.internalAdapter.findSession(token)) as {
			user?: UserRow;
		} | null;
		target = found?.user ?? null;
	} else if (typeof body.userId === 'string' && body.userId) {
		target = (await ctx.context.internalAdapter.findUserById(body.userId)) as UserRow | null;
	}
	// Unknown target: let the endpoint answer its own 404/400.
	if (!target) return;

	// 5. Per-endpoint rule.
	switch (path) {
		case '/admin/impersonate-user':
			if (!canImpersonate(actor, target)) deny(ctx, actor, target, 'impersonate');
			return;
		case '/admin/set-role': {
			if (Array.isArray(body.role)) deny(ctx, actor, target, 'multi_role');
			const role = typeof body.role === 'string' ? body.role : 'user';
			if (!canChangeRole(actor, target, role)) deny(ctx, actor, target, 'role_change');
			return;
		}
		case '/admin/update-user': {
			const data =
				body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : {};
			if ('isRoot' in data) deny(ctx, actor, target, 'is_root_write');
			if ('role' in data) {
				if (Array.isArray(data.role)) deny(ctx, actor, target, 'multi_role');
				const role = typeof data.role === 'string' ? data.role : 'user';
				if (!canChangeRole(actor, target, role)) deny(ctx, actor, target, 'role_change');
			} else if (!canManageUser(actor, target)) {
				deny(ctx, actor, target, 'manage');
			}
			return;
		}
		default:
			// ban-user, unban-user, remove-user, set-user-password,
			// revoke-user-session(s), list-user-sessions — and anything new.
			if (!canManageUser(actor, target)) deny(ctx, actor, target, 'manage');
	}
}
