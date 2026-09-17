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

import type { McpServer } from '@modelcontextprotocol/server';
import listHtml from './dist/list/index.html?raw';
import detailHtml from './dist/detail/index.html?raw';

/** MIME type that marks a resource as an MCP App. */
export const UI_RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

// `ui://<server>/<file>.html` is the convention every official example uses
// and Claude Desktop only mounts the frame when the path has the extension.
/** Grouped list of the tasks / tickets / projects passed to show_items. */
export const LIST_UI_URI = 'ui://trackr/list.html';
/** One task or ticket in full, explicitly requested via show_task / show_ticket. */
export const DETAIL_UI_URI = 'ui://trackr/detail.html';

/**
 * `_meta` for a tool that has a widget. Both the spec key (`ui.resourceUri`)
 * and the legacy flat key are written, like the ext-apps helper does.
 */
export function uiToolMeta(resourceUri: string): Record<string, unknown> {
	return { ui: { resourceUri }, 'ui/resourceUri': resourceUri };
}

const WIDGETS: { uri: string; name: string; title: string; description: string; html: string }[] = [
	{
		uri: LIST_UI_URI,
		name: 'list',
		title: 'List',
		description:
			'Grouped list of the items passed to show_items, styled like the trackr list views (tasks under their project, tickets under their organization, then projects); click a row to open it in trackr.',
		html: listHtml
	},
	{
		uri: DETAIL_UI_URI,
		name: 'detail',
		title: 'Task / ticket detail',
		description:
			'One task or ticket in full: description, checklist (toggle), status, assignees, attachments, comments / timeline, time logs.',
		html: detailHtml
	}
];

/**
 * Register every widget resource. Deliberately no `_meta.ui.domain`: that
 * field names a host-provisioned sandbox origin (claude.ai derives one per
 * remote connector); advertising one for a server reached over stdio /
 * mcp-remote made Claude Desktop try to load the frame from a host that
 * doesn't exist ("Unable to reach …"). Hosts pick their own sandbox when it
 * is absent, which is what the official examples do.
 */
export function registerUiResources(server: McpServer): void {
	for (const w of WIDGETS) {
		server.registerResource(
			w.name,
			w.uri,
			{
				title: w.title,
				description: w.description,
				mimeType: UI_RESOURCE_MIME_TYPE,
				_meta: { ui: { prefersBorder: true } }
			},
			async () => ({
				contents: [{ uri: w.uri, mimeType: UI_RESOURCE_MIME_TYPE, text: w.html }]
			})
		);
	}
}
