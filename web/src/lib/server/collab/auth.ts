// Short-lived signed tokens for authenticating websocket (collab) connections.
//
// Better Auth's session cookie is httpOnly, so the browser can't read it to hand
// to the Hocuspocus provider. Instead a cookie-authenticated endpoint mints a
// short-lived HMAC token scoped to collab; Hocuspocus verifies it on connect.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { loadMemberships } from '$lib/server/permissions';
import type { Memberships } from '$lib/permissions';

const TTL_SECONDS = 5 * 60;

function secret(): string {
	const s = env.BETTER_AUTH_SECRET;
	if (!s) throw new Error('BETTER_AUTH_SECRET is not set');
	return s;
}

function b64url(buf: Buffer | string): string {
	return Buffer.from(buf).toString('base64url');
}

function sign(payload: string): string {
	return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Mint a token `{ userId, exp }` signed with the auth secret. */
export function signCollabToken(userId: string): string {
	const payload = b64url(
		JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS })
	);
	return `${payload}.${sign(payload)}`;
}

export type CollabSession = {
	userId: string;
	isTrackrTeam: boolean;
	memberships: Memberships;
};

/** Verify a collab token and resolve the user's team membership. Throws if invalid/expired. */
export async function resolveCollabSession(token: string | undefined): Promise<CollabSession> {
	if (!token) throw new Error('missing token');
	const [payload, mac] = token.split('.');
	if (!payload || !mac) throw new Error('malformed token');

	const expected = sign(payload);
	const a = Buffer.from(mac);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('bad signature');

	let data: { userId?: unknown; exp?: unknown };
	try {
		data = JSON.parse(Buffer.from(payload, 'base64url').toString());
	} catch {
		throw new Error('bad payload');
	}
	if (typeof data.userId !== 'string' || typeof data.exp !== 'number')
		throw new Error('bad payload');
	if (data.exp < Math.floor(Date.now() / 1000)) throw new Error('expired');

	const memberships = await loadMemberships(data.userId);
	return {
		userId: data.userId,
		isTrackrTeam: memberships.orgs.some((o) => o.isInternal),
		memberships
	};
}
