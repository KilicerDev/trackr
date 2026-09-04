// Builds the per-request MCP server for an authenticated principal.
//
// `createMcpHandler` (routes/api/mcp/+server.ts) calls `buildServer` once per
// HTTP request, so registration is cheap and the closure captures the caller's
// `Locals` — every tool then runs through the same permission engine and
// `$lib/server` helpers as the web app and /api/v1.

import { McpServer } from '@modelcontextprotocol/server';
import type { McpPrincipal } from './auth';
import { localsFromPrincipal, type McpContext } from './tools/shared';
import { registerGeneralTools } from './tools/general';
import { registerTicketTools } from './tools/tickets';
import { registerTaskTools } from './tools/tasks';
import { registerChecklistTools } from './tools/checklist';
import { registerProjectTools } from './tools/projects';
import { registerWikiTools } from './tools/wiki';
import { registerNoteTools } from './tools/notes';
import { registerResources } from './tools/resources';
import { registerPrompts } from './tools/prompts';

export const MCP_SERVER_NAME = 'trackr';
export const MCP_SERVER_VERSION = '1.0.0';

const INSTRUCTIONS = `trackr is a work tracker for a small agency: support tickets per client organization, project tasks, an internal wiki, and quick/meeting notes.

You act as the signed-in user — every read and write is checked against their roles, and writes notify people, fire webhooks and are audited exactly as if done in the app. Start with \`whoami\` to learn the org and project keys you can use.

Identifiers:
- Tickets: ORGKEY-<n> (e.g. TRACK-108). Tasks: PROJECTKEY-<n> (e.g. WEB-12). Projects and organizations by key. Users by id or email (\`list_users\`). Wiki pages, notes and attachments by uuid.
- Resources mirror the read tools: trackr://ticket/{key}, trackr://task/{key}, trackr://wiki/{id}, trackr://note/{id}, trackr://attachment/{id}.

Content: all bodies are markdown, both in and out (ticket/task descriptions, wiki pages, notes). Checklists on update are whole-array replaces — use \`checklist_toggle\` for a single item. Lists are compact and capped (\`limit\`, max 200) and report \`total\`; use the \`get_*\` tool for details.

Not available here: posting ticket replies or task comments, chat, share links — tell the user to do those in the app.`;

export function buildServer(principal: McpPrincipal, origin: string): McpServer {
	const ctx: McpContext = { locals: localsFromPrincipal(principal), origin, principal };
	const server = new McpServer(
		{ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
		{ instructions: INSTRUCTIONS }
	);
	registerGeneralTools(server, ctx);
	registerTicketTools(server, ctx);
	registerTaskTools(server, ctx);
	registerChecklistTools(server, ctx);
	registerProjectTools(server, ctx);
	registerWikiTools(server, ctx);
	registerNoteTools(server, ctx);
	registerResources(server, ctx);
	registerPrompts(server, ctx);
	return server;
}
