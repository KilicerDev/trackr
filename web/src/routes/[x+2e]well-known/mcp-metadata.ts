// OAuth discovery documents for the MCP endpoint (RFC 8414 + RFC 9728).
//
// better-auth's mcp plugin can render these, but with `ORIGIN` unset (host-
// based routing) it only learns its baseURL from the first request that hits
// `auth.handler` — `auth.api.*` calls see whatever that happened to be, or
// nothing at all. Clients compare these URLs against the one they were given,
// so every URL here is rebuilt from the *current* request origin; the plugin's
// output is only used for the non-URL fields it knows better.

import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';

const SCOPES = ['openid', 'profile', 'email', 'offline_access'];

export const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
	'Access-Control-Max-Age': '86400'
};

export function preflight(): Response {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function metadataJson(body: Record<string, unknown>): Response {
	return json(body, { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } });
}

async function pluginAuthorizationServerMetadata(
	headers: Headers
): Promise<Record<string, unknown> | null> {
	try {
		const res = (await auth.api.getMcpOAuthConfig({ headers })) as Record<string, unknown> | null;
		return res && typeof res === 'object' ? res : null;
	} catch {
		return null;
	}
}

async function pluginProtectedResourceMetadata(
	headers: Headers
): Promise<Record<string, unknown> | null> {
	try {
		const res = (await auth.api.getMCPProtectedResource({ headers })) as Record<
			string,
			unknown
		> | null;
		return res && typeof res === 'object' ? res : null;
	} catch {
		// Throws `new URL('')` when baseURL is still unknown — fall back to defaults.
		return null;
	}
}

export async function authorizationServerMetadata(
	origin: string,
	headers: Headers
): Promise<Response> {
	const base = `${origin}/api/auth`;
	const fromPlugin = await pluginAuthorizationServerMetadata(headers);
	return metadataJson({
		scopes_supported: SCOPES,
		response_types_supported: ['code'],
		response_modes_supported: ['query'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		subject_types_supported: ['public'],
		id_token_signing_alg_values_supported: ['RS256', 'none'],
		token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
		claims_supported: [
			'sub',
			'iss',
			'aud',
			'exp',
			'nbf',
			'iat',
			'jti',
			'email',
			'email_verified',
			'name'
		],
		...fromPlugin,
		// PKCE is mandatory and plain is disabled (see auth.ts mcp options).
		code_challenge_methods_supported: ['S256'],
		issuer: origin,
		authorization_endpoint: `${base}/mcp/authorize`,
		token_endpoint: `${base}/mcp/token`,
		userinfo_endpoint: `${base}/mcp/userinfo`,
		jwks_uri: `${base}/mcp/jwks`,
		registration_endpoint: `${base}/mcp/register`
	});
}

export async function protectedResourceMetadata(
	origin: string,
	headers: Headers
): Promise<Response> {
	const fromPlugin = await pluginProtectedResourceMetadata(headers);
	return metadataJson({
		scopes_supported: SCOPES,
		bearer_methods_supported: ['header'],
		resource_signing_alg_values_supported: ['RS256', 'none'],
		...fromPlugin,
		// Must equal the URL users paste into their MCP client, byte for byte.
		resource: `${origin}/api/mcp`,
		authorization_servers: [origin],
		jwks_uri: `${origin}/api/auth/mcp/jwks`
	});
}
