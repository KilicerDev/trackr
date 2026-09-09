// POST /api/mcp — the Streamable HTTP MCP endpoint (stateless, one JSON-RPC
// message per request; both the 2025-11-25 and 2026-07-28 protocol eras).
//
// Auth is resolved before the SDK sees the request (`authenticateMcpRequest`:
// trk_ API key via hooks, or an OAuth token from better-auth's mcp plugin, both
// gated by the mcp_access allow-list) and handed to the per-request server
// factory through `authInfo.extra`. GET/DELETE are session operations we do
// not serve — 405, like the SDK's own stateless fallback.

import { createMcpHandler } from '@modelcontextprotocol/server';
import { authenticateMcpRequest, type McpPrincipal } from '$lib/server/mcp/auth';
import { buildServer } from '$lib/server/mcp/server';
import { loadGuidance } from '$lib/server/mcp/guidance';
import type { RequestHandler } from './$types';

type Extra = { principal: McpPrincipal; origin: string };

const handler = createMcpHandler(
	async ({ authInfo }) => {
		const extra = authInfo?.extra as Extra | undefined;
		if (!extra?.principal) {
			// Only reachable if the route below is bypassed — never serve unauthenticated.
			throw new Error('MCP request without an authenticated principal');
		}
		// Workspace + personal instructions and guide index (memoised per user; see guidance.ts).
		return buildServer(
			extra.principal,
			extra.origin,
			await loadGuidance(extra.principal.locals.user.id)
		);
	},
	{ responseMode: 'json' }
);

export const POST: RequestHandler = async (event) => {
	const p = await authenticateMcpRequest(event);
	if (p instanceof Response) return p;
	const extra: Extra = { principal: p, origin: event.url.origin };
	return handler.fetch(event.request, {
		authInfo: {
			token: '',
			clientId: p.locals.oauthClientId ?? 'api-key',
			scopes: [],
			extra
		}
	});
};

function methodNotAllowed(): Response {
	return new Response(
		JSON.stringify({
			jsonrpc: '2.0',
			error: { code: -32000, message: 'Method not allowed. Use POST.' },
			id: null
		}),
		{
			status: 405,
			headers: { 'Content-Type': 'application/json', Allow: 'POST', 'Cache-Control': 'no-store' }
		}
	);
}

export const GET: RequestHandler = async () => methodNotAllowed();
export const DELETE: RequestHandler = async () => methodNotAllowed();
