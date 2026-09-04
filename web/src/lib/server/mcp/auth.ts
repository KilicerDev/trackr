/**
 * Bearer authentication for POST /api/mcp.
 *
 * Two credential kinds land here:
 *   1. `trk_` personal API keys — hooks.server.ts has already resolved them
 *      into `event.locals` (authKind 'api_key'); we just adopt that.
 *   2. Opaque OAuth access tokens issued by better-auth's `mcp` plugin —
 *      looked up via `auth.api.getMcpSession`, then turned into the same
 *      `Locals` shape (user + memberships + isAdmin) the /api/v1 handlers
 *      pass to the permission engine.
 *
 * Both kinds must additionally be on the `mcp_access` allow-list. Failures
 * come back as ready-to-send JSON-RPC error Responses; the 401 carries the
 * `WWW-Authenticate` challenge MCP clients use to discover the OAuth server.
 *
 * Deliberately free of MCP SDK imports — the route wires the two together.
 */

import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { deriveIsAdmin, loadMemberships } from '$lib/server/permissions';
import type { Memberships } from '$lib/permissions';
import { isMcpEnabled } from './access';

export type McpPrincipal = {
	locals: {
		user: NonNullable<App.Locals['user']>;
		memberships: Memberships;
		isAdmin: boolean;
		authKind: 'api_key' | 'oauth';
		apiKeyId?: string;
		oauthClientId?: string;
	};
};

export const MCP_NOT_ENABLED_MESSAGE =
	'MCP access is not enabled for this account. Ask a trackr admin to enable it.';

function jsonRpcError(
	status: number,
	code: number,
	message: string,
	headers: Record<string, string> = {}
): Response {
	return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
	});
}

function unauthorized(event: RequestEvent): Response {
	const metadata = `${event.url.origin}/.well-known/oauth-protected-resource/api/mcp`;
	return jsonRpcError(401, -32001, 'Unauthorized', {
		'WWW-Authenticate': `Bearer resource_metadata="${metadata}"`,
		'Access-Control-Expose-Headers': 'WWW-Authenticate'
	});
}

function notEnabled(): Response {
	return jsonRpcError(403, -32003, MCP_NOT_ENABLED_MESSAGE);
}

function bearerToken(event: RequestEvent): string | null {
	const header = event.request.headers.get('authorization');
	if (!header) return null;
	const [scheme, ...rest] = header.trim().split(/\s+/);
	if (scheme?.toLowerCase() !== 'bearer') return null;
	const token = rest.join(' ').trim();
	return token.length > 0 ? token : null;
}

type OAuthTokenRow = {
	userId?: string | null;
	clientId?: string | null;
	accessTokenExpiresAt?: Date | string | null;
};

export async function authenticateMcpRequest(
	event: RequestEvent
): Promise<McpPrincipal | Response> {
	// 1. API key — hooks.server.ts already validated it and built locals.
	if (event.locals.authKind === 'api_key' && event.locals.user) {
		if (!(await isMcpEnabled(event.locals.user.id))) return notEnabled();
		return {
			locals: {
				user: event.locals.user,
				memberships: event.locals.memberships ?? { orgs: [], projects: [] },
				isAdmin: event.locals.isAdmin ?? false,
				authKind: 'api_key',
				apiKeyId: event.locals.apiKeyId
			}
		};
	}

	// 2. OAuth access token from the better-auth mcp plugin.
	if (!bearerToken(event)) return unauthorized(event);

	// Only the bearer header: handing better-auth the full request headers makes
	// it treat the call as a cookie session lookup and emit cookie-clearing
	// Set-Cookie headers on our response.
	const token = (await auth.api
		.getMcpSession({
			headers: new Headers({ authorization: event.request.headers.get('authorization') ?? '' })
		})
		.catch(() => null)) as OAuthTokenRow | null;
	if (!token?.userId) return unauthorized(event);
	const expiresAt = token.accessTokenExpiresAt ? new Date(token.accessTokenExpiresAt) : null;
	if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
		return unauthorized(event);
	}

	const [row] = await db.select().from(userTable).where(eq(userTable.id, token.userId)).limit(1);
	if (!row || row.banned) return unauthorized(event);

	if (!(await isMcpEnabled(row.id))) return notEnabled();

	const memberships = await loadMemberships(row.id);
	const isAdmin = await deriveIsAdmin(memberships);
	return {
		locals: {
			// Same columns better-auth exposes on `session.user` (admin plugin
			// fields included) — identical shape to what hooks.server.ts builds.
			user: row as unknown as NonNullable<App.Locals['user']>,
			memberships,
			isAdmin,
			authKind: 'oauth',
			oauthClientId: token.clientId ?? undefined
		}
	};
}
