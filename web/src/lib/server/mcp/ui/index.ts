// MCP Apps (SEP-1865): HTML widgets the host renders inline for a tool result.
//
// A widget is an ordinary MCP resource with the `text/html;profile=mcp-app`
// MIME type. A tool opts in by carrying `_meta.ui.resourceUri` — the host
// then reads that resource through the same authenticated `/api/mcp`
// connection and shows it in a sandboxed iframe, handing it the tool's
// `structuredContent`. Hosts without the UI extension ignore the metadata and
// show the text result, so nothing changes for them.
//
// The `ui://` scheme is a naming convention the host recognises; nothing is
// served over HTTP. The HTML itself is built by vite.mcp-ui.config.ts
// (`bun run mcp:ui`) from src/lib/server/mcp/ui/<widget>/ into dist/<widget>/, and
// inlined here at build time.
//
// We set the metadata by hand instead of using `@modelcontextprotocol/ext-apps/server`:
// that helper imports the v1 MCP SDK, which this server (SDK v2) doesn't have,
// and all it does is write the keys below.

import { createHash } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/server';
import ticketsHtml from './dist/tickets/index.html?raw';

/** MIME type that marks a resource as an MCP App. */
export const UI_RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

export const TICKETS_UI_URI = 'ui://trackr/tickets';

/**
 * `_meta` for a tool that has a widget. Both the spec key (`ui.resourceUri`)
 * and the legacy flat key are written, like the ext-apps helper does.
 */
export function uiToolMeta(resourceUri: string): Record<string, unknown> {
	return { ui: { resourceUri }, 'ui/resourceUri': resourceUri };
}

/**
 * Claude serves widgets from a per-server sandbox origin derived from the
 * MCP endpoint URL (documented as sha256(url)[:32] + '.claudemcpcontent.com').
 * Advertising it lets the host validate the origin; other hosts ignore it.
 */
export function claudeSandboxDomain(mcpUrl: string): string {
	return `${createHash('sha256').update(mcpUrl).digest('hex').slice(0, 32)}.claudemcpcontent.com`;
}

const WIDGETS: { uri: string; name: string; title: string; description: string; html: string }[] = [
	{
		uri: TICKETS_UI_URI,
		name: 'tickets-table',
		title: 'Ticket table',
		description:
			'Interactive table for list_tickets results: status and priority badges, sorting, filtering, click to open in trackr.',
		html: ticketsHtml
	}
];

/** Register every widget resource. `origin` is the request origin (for the sandbox domain). */
export function registerUiResources(server: McpServer, origin: string): void {
	const domain = claudeSandboxDomain(`${origin}/api/mcp`);
	for (const w of WIDGETS) {
		server.registerResource(
			w.name,
			w.uri,
			{
				title: w.title,
				description: w.description,
				mimeType: UI_RESOURCE_MIME_TYPE,
				_meta: { ui: { domain, prefersBorder: true } }
			},
			async () => ({
				contents: [{ uri: w.uri, mimeType: UI_RESOURCE_MIME_TYPE, text: w.html }]
			})
		);
	}
}
