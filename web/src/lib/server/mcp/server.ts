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
import { registerShowTools } from './tools/show';
import { registerTicketTools } from './tools/tickets';
import { registerTaskTools } from './tools/tasks';
import { registerChecklistTools } from './tools/checklist';
import { registerProjectTools } from './tools/projects';
import { registerWikiTools } from './tools/wiki';
import { registerNoteTools } from './tools/notes';
import { registerResources } from './tools/resources';
import { registerPrompts } from './tools/prompts';
import { registerUiResources } from './ui';
import { registerGuideTools, guideIndexLines } from './tools/guides';
import type { Guidance } from './guidance';

export const MCP_SERVER_NAME = 'trackr';
export const MCP_SERVER_VERSION = '1.0.0';

const INSTRUCTIONS = `trackr is a work tracker for a small agency: support tickets per client organization, project tasks, an internal wiki, and quick/meeting notes.

You act as the signed-in user — every read and write is checked against their roles, and writes notify people, fire webhooks and are audited exactly as if done in the app. Start with \`whoami\` to learn the org and project keys you can use.

Identifiers:
- Tickets: ORGKEY-<n> (e.g. TRACK-108). Tasks: PROJECTKEY-<n> (e.g. WEB-12). Projects and organizations by key. Users by id or email (\`list_users\`). Wiki pages, notes and attachments by uuid.
- Resources mirror the read tools: trackr://ticket/{key}, trackr://task/{key}, trackr://wiki/{id}, trackr://note/{id}, trackr://attachment/{id}.

Content: all bodies are markdown, both in and out (ticket/task descriptions, wiki pages, notes). Checklists on update are whole-array replaces — use \`checklist_toggle\` for a single item. Lists are compact and capped (\`limit\`, max 200) and report \`total\`; use the \`get_*\` tool for details.

Showing results: \`list_*\`, \`search\` and \`get_*\` are for finding and reading — use them as often as you need, they are text only. When you have your answer and the user should see the items, call \`show_items\` once with exactly those task/ticket ids or project keys; it is the one list tool that renders as an inline widget. Do not call it while you are still searching, and do not use it to dump everything you looked at.

Writing tasks and tickets — record what the user said, do not expand it:
- Title: the user's own words, trimmed to one line. Do not reword what they meant.
- Description: only what the user actually told you (context, links, error text, constraints). If the title already says it all, leave the description empty. Never add background, motivation, "acceptance criteria" or how-to steps the user did not give you.
- Checklist: only when the user listed steps themselves, or asked you to break the work down. Never invent steps like "open the editor", "read the documentation", "test it" — the user knows their job. Reading a guide or existing task to learn the real steps is fine; guessing is not.
- Tags, priority, due date, estimate, assignees: set only when the user said so or it is unambiguous from the request. Otherwise keep the defaults; an empty field is correct, not a gap to fill.
- Updates: pass only the fields the user asked to change. Do not "improve" the rest of the task while you are there.
- When unsure whether something belongs in the task, ask or leave it out. A short task the user recognises beats a complete one they have to clean up.

Not available here: posting ticket replies or task comments, chat, share links — tell the user to do those in the app.`;

/**
 * Built-in instructions + the admin's additions (Settings → MCP) + an index
 * of enabled guides. Exported for tests; `buildServer` is the only caller.
 */
export function composeInstructions(guidance: Guidance): string {
	const parts = [INSTRUCTIONS];
	if (guidance.guides.length) {
		parts.push(
			[
				'Guides — reference documents the admins wrote for you. Read the relevant one with `get_guide` (or trackr://guide/{slug}) BEFORE planning or breaking down work on a topic it covers; take the steps from the guide, not from memory:',
				...guideIndexLines(guidance.guides)
			].join('\n')
		);
	}
	if (guidance.instructions) {
		parts.push(`Workspace instructions from the admins:\n\n${guidance.instructions}`);
	}
	return parts.join('\n\n');
}

export function buildServer(
	principal: McpPrincipal,
	origin: string,
	guidance: Guidance = { instructions: '', guides: [] }
): McpServer {
	const ctx: McpContext = { locals: localsFromPrincipal(principal), origin, principal };
	const server = new McpServer(
		{ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
		{ instructions: composeInstructions(guidance) }
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
	registerGuideTools(server, guidance.guides);
	registerShowTools(server, ctx);
	registerUiResources(server);
	return server;
}
