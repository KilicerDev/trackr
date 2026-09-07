// Smoke tests for the user-management policy (TRACK-124) against a live
// server — see helpers.ts and `bun run test:smoke:authz`. Proves, through the
// real entry points, that:
//   - the better-auth admin API is refused over HTTP for everyone,
//   - impersonation is superadmin-only, never root, never oneself,
//   - API keys and internal-org roles follow the hierarchy,
//   - root is untouchable and nobody changes their own role.
// Acts as the demo admins (Max, Maja), the demo user (Leon) and — when
// ROOT_EMAIL / ROOT_PASSWORD are in the repo-root .env — the root account.
// Every row it creates is removed again; demo roles are restored.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	api,
	BASE_URL,
	DEMO,
	formAction,
	idOf,
	joinCookies,
	requireServer,
	signInForBearerToken,
	signInForCookie,
	SMOKE_PREFIX,
	stamp
} from './helpers';

const INTERNAL_ORG = 'org_trackr_internal';
const hasRoot = !!(DEMO.root.email && DEMO.root.password);
const rootOnly = test.skipIf(!hasRoot);

const run = stamp();
let adminCookie: string;
let adminToken: string;
let admin2Cookie: string;
let rootCookie: string;
let adminId: string;
let admin2Id: string;
let userId: string;
let rootId: string;

// Keys created below (id → creator cookie), deleted in afterAll.
const createdKeys: { id: string; cookie: string }[] = [];

beforeAll(async () => {
	await requireServer();
	[adminCookie, adminToken, admin2Cookie, adminId, admin2Id, userId] = await Promise.all([
		signInForCookie(DEMO.admin.email, DEMO.admin.password),
		signInForBearerToken(DEMO.admin.email, DEMO.admin.password),
		signInForCookie(DEMO.admin2.email, DEMO.admin2.password),
		idOf(DEMO.admin.email, DEMO.admin.password),
		idOf(DEMO.admin2.email, DEMO.admin2.password),
		idOf(DEMO.user.email, DEMO.user.password)
	]);
	if (hasRoot) {
		[rootCookie, rootId] = await Promise.all([
			signInForCookie(DEMO.root.email, DEMO.root.password),
			idOf(DEMO.root.email, DEMO.root.password)
		]);
	}
});

afterAll(async () => {
	for (const k of createdKeys) {
		await formAction('/admin/settings/api-keys', 'delete', { id: k.id }, { cookie: k.cookie });
	}
});

async function adminApi(path: string, body: unknown, auth: { cookie: string } | { token: string }) {
	const headers: Record<string, string> = { 'content-type': 'application/json', origin: BASE_URL };
	if ('cookie' in auth) headers.cookie = auth.cookie;
	else headers.authorization = `Bearer ${auth.token}`;
	const res = await fetch(`${BASE_URL}/api/auth/admin/${path}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(30_000)
	});
	return {
		status: res.status,
		body: (await res.json().catch(() => null)) as { code?: string } | null
	};
}

describe('better-auth admin API over HTTP', () => {
	const calls = [
		['impersonate-user', () => ({ userId })],
		['set-role', () => ({ userId, role: 'admin' })],
		['set-user-password', () => ({ userId, newPassword: 'x'.repeat(16) })],
		['list-users', () => ({})]
	] as const;

	for (const [path, body] of calls) {
		test(`${path} as admin (cookie) → 403 ADMIN_API_HTTP_DISABLED`, async () => {
			const res = await adminApi(path, body(), { cookie: adminCookie });
			expect(res.status).toBe(403);
			expect(res.body?.code).toBe('ADMIN_API_HTTP_DISABLED');
		});
	}

	test('impersonate-user as admin (bearer session token) → 403', async () => {
		const res = await adminApi('impersonate-user', { userId }, { token: adminToken });
		expect(res.status).toBe(403);
		expect(res.body?.code).toBe('ADMIN_API_HTTP_DISABLED');
	});

	rootOnly('set-role as root → 403 too (no HTTP exception for anyone)', async () => {
		const res = await adminApi('set-role', { userId, role: 'admin' }, { cookie: rootCookie });
		expect(res.status).toBe(403);
		expect(res.body?.code).toBe('ADMIN_API_HTTP_DISABLED');
	});

	test('the admin pages themselves still load for an admin', async () => {
		for (const p of ['/admin/users', '/admin/settings/api-keys', '/admin/settings/mcp']) {
			const res = await fetch(`${BASE_URL}${p}`, { headers: { cookie: adminCookie } });
			expect(res.status, p).toBe(200);
		}
	});
});

describe('impersonation', () => {
	test('admin cannot impersonate anyone', async () => {
		const r = await formAction(
			'/admin/users',
			'impersonateUser',
			{ userId },
			{ cookie: adminCookie }
		);
		expect(r.type).toBe('failure');
		expect(r.status).toBe(403);
	});

	rootOnly('root impersonates a user, then stops', async () => {
		const r = await formAction(
			'/admin/users',
			'impersonateUser',
			{ userId },
			{ cookie: rootCookie }
		);
		expect(r.type).toBe('success');
		const impersonated = joinCookies(r.setCookie);
		const me = await fetch(`${BASE_URL}/api/v1/me`, { headers: { cookie: impersonated } });
		expect(((await me.json()) as { user: { email: string } }).user.email).toBe(DEMO.user.email);
		const stop = await fetch(`${BASE_URL}/stop-impersonating`, {
			method: 'POST',
			headers: { cookie: impersonated, origin: BASE_URL }
		});
		expect(stop.status).toBe(200);
	});

	rootOnly('root impersonating an admin sees the users page (reads allowed)', async () => {
		const r = await formAction(
			'/admin/users',
			'impersonateUser',
			{ userId: admin2Id },
			{ cookie: rootCookie }
		);
		expect(r.type).toBe('success');
		const impersonated = joinCookies(r.setCookie);
		const page = await fetch(`${BASE_URL}/admin/users`, { headers: { cookie: impersonated } });
		expect(page.status).toBe(200);
		// …but cannot perform admin mutations from inside the impersonation.
		const del = await formAction(
			'/admin/users',
			'deleteUser',
			{ userId },
			{ cookie: impersonated }
		);
		expect(del.type).toBe('failure');
		const stop = await fetch(`${BASE_URL}/stop-impersonating`, {
			method: 'POST',
			headers: { cookie: impersonated, origin: BASE_URL }
		});
		expect(stop.status).toBe(200);
	});

	rootOnly('root cannot impersonate itself', async () => {
		const r = await formAction(
			'/admin/users',
			'impersonateUser',
			{ userId: rootId },
			{ cookie: rootCookie }
		);
		expect(r.type).toBe('failure');
		expect(r.status).toBe(400);
	});

	rootOnly('an admin naming root gets 403 (superadmin required), never a session', async () => {
		const r = await formAction(
			'/admin/users',
			'impersonateUser',
			{ userId: rootId },
			{ cookie: admin2Cookie }
		);
		expect(r.type).toBe('failure');
		expect(r.status).toBe(403);
		expect(r.setCookie.some((c) => c.includes('session_token='))).toBe(false);
	});
});

describe('API keys', () => {
	rootOnly('admin cannot mint a key for root', async () => {
		const r = await formAction(
			'/admin/settings/api-keys',
			'create',
			{ userId: rootId, name: `${SMOKE_PREFIX} ${run}`, expiry: '' },
			{ cookie: adminCookie }
		);
		expect(r.type).toBe('failure');
		// Root is a superadmin, invisible to admins → "unknown user", not a hint.
		expect(r.status).toBe(400);
	});

	test('admin mints a key for a plain user (peers and below)', async () => {
		const r = await formAction(
			'/admin/settings/api-keys',
			'create',
			{ userId, name: `${SMOKE_PREFIX} authz ${run}`, expiry: '30' },
			{ cookie: adminCookie }
		);
		expect(r.type).toBe('success');
		const id = /"([0-9a-f-]{36})"/.exec(r.raw)?.[1];
		expect(id).toBeString();
		createdKeys.push({ id: id!, cookie: adminCookie });
		const revoke = await formAction(
			'/admin/settings/api-keys',
			'revoke',
			{ id: id! },
			{ cookie: adminCookie }
		);
		expect(revoke.type).toBe('success');
	});

	rootOnly('root mints and deletes its own key', async () => {
		const r = await formAction(
			'/admin/settings/api-keys',
			'create',
			{ userId: rootId, name: `${SMOKE_PREFIX} root ${run}`, expiry: '' },
			{ cookie: rootCookie }
		);
		expect(r.type).toBe('success');
		const id = /"([0-9a-f-]{36})"/.exec(r.raw)?.[1];
		expect(id).toBeString();
		createdKeys.push({ id: id!, cookie: rootCookie });
	});
});

describe('user management', () => {
	rootOnly('admin cannot delete or reset root (invisible → 404)', async () => {
		for (const action of ['deleteUser', 'sendPasswordReset']) {
			const r = await formAction(
				'/admin/users',
				action,
				{ userId: rootId },
				{ cookie: adminCookie }
			);
			expect(r.type, action).toBe('failure');
			expect(r.status, action).toBe(404);
		}
	});

	rootOnly('root cannot delete itself', async () => {
		const r = await formAction(
			'/admin/users',
			'deleteUser',
			{ userId: rootId },
			{ cookie: rootCookie }
		);
		expect(r.type).toBe('failure');
		expect(r.status).toBe(400);
	});
});

describe('internal-org membership', () => {
	const org = `/admin/organizations/${INTERNAL_ORG}`;

	test('admin cannot make themselves org.superadmin', async () => {
		const r = await formAction(
			org,
			'memberSetRole',
			{ userId: adminId, role: 'org.superadmin' },
			{ cookie: adminCookie }
		);
		expect(r.type).toBe('failure');
		expect(r.status).toBe(403);
	});

	test('admin cannot make a user org.superadmin', async () => {
		const r = await formAction(
			org,
			'memberSetRole',
			{ userId, role: 'org.superadmin' },
			{ cookie: adminCookie }
		);
		expect(r.type).toBe('failure');
		expect(r.status).toBe(403);
	});

	rootOnly('admin cannot remove or demote root', async () => {
		const remove = await formAction(
			org,
			'memberRemove',
			{ userId: rootId },
			{ cookie: adminCookie }
		);
		expect(remove.type).toBe('failure');
		expect(remove.status).toBe(403);
		const demote = await formAction(
			org,
			'memberSetRole',
			{ userId: rootId, role: 'org.staff' },
			{ cookie: adminCookie }
		);
		expect(demote.type).toBe('failure');
		expect(demote.status).toBe(403);
	});

	test('admin may demote a peer admin and promote them back; user.role follows', async () => {
		const down = await formAction(
			org,
			'memberSetRole',
			{ userId: admin2Id, role: 'org.staff' },
			{ cookie: adminCookie }
		);
		expect(down.type).toBe('success');
		// Maja is now tier `user`: her admin pages must be gone.
		const asMaja = await fetch(`${BASE_URL}/admin/users`, { headers: { cookie: admin2Cookie } });
		expect(asMaja.status).toBe(403);
		const up = await formAction(
			org,
			'memberSetRole',
			{ userId: admin2Id, role: 'org.admin' },
			{ cookie: adminCookie }
		);
		expect(up.type).toBe('success');
		const again = await fetch(`${BASE_URL}/admin/users`, { headers: { cookie: admin2Cookie } });
		expect(again.status).toBe(200);
	});

	rootOnly('root cannot change its own membership', async () => {
		const r = await formAction(
			org,
			'memberSetRole',
			{ userId: rootId, role: 'org.staff' },
			{ cookie: rootCookie }
		);
		expect(r.type).toBe('failure');
		expect(r.status).toBe(403);
	});

	rootOnly('root may promote a user to org.admin and back; user.role follows', async () => {
		const up = await formAction(
			org,
			'memberSetRole',
			{ userId, role: 'org.admin' },
			{ cookie: rootCookie }
		);
		expect(up.type).toBe('success');
		const me = await api<{ capabilities: { isAdmin: boolean } }>('GET', '/api/v1/me', undefined, {
			token: await signInForBearerToken(DEMO.user.email, DEMO.user.password)
		});
		expect(me.body.capabilities.isAdmin).toBe(true);
		const down = await formAction(
			org,
			'memberSetRole',
			{ userId, role: 'org.staff' },
			{ cookie: rootCookie }
		);
		expect(down.type).toBe('success');
		const after = await api<{ capabilities: { isAdmin: boolean } }>(
			'GET',
			'/api/v1/me',
			undefined,
			{
				token: await signInForBearerToken(DEMO.user.email, DEMO.user.password)
			}
		);
		expect(after.body.capabilities.isAdmin).toBe(false);
	});
});
