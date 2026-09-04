// MCP resources — read-only URIs over the same loaders the tools use:
//   trackr://ticket/{key}      text/markdown  (TRACK-108)
//   trackr://task/{key}        text/markdown  (WEB-12)
//   trackr://wiki/{id}         text/markdown  (uuid; listable, staff only)
//   trackr://note/{id}         text/markdown  (uuid)
//   trackr://attachment/{id}   blob           (uuid; original bytes)
// Errors surface as thrown exceptions (the SDK turns them into JSON-RPC
// errors) — resources have no `isError` envelope.

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { isTrackrTeam } from '$lib/server/permissions';
import { loadWikiTree } from '$lib/server/wiki';
import {
	authorizeAttachmentAccess,
	getAttachment,
	originalKey,
	resolveEntityContext
} from '$lib/server/attachments';
import { storage } from '$lib/server/storage';
import { isUuid } from '../ids';
import { ToolError, type McpContext } from './shared';
import { loadTicketDetail } from './tickets';
import { loadTaskDetail } from './tasks';
import { loadWikiPageMarkdown } from './wiki';
import { loadNoteMarkdown } from './notes';

const WIKI_LIST_CAP = 200;

function variable(v: string | string[] | undefined): string {
	const s = Array.isArray(v) ? v[0] : v;
	if (!s) throw new ToolError(400, 'Missing identifier in resource URI.');
	return decodeURIComponent(s);
}

function markdown(uri: URL, text: string) {
	return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
}

export function registerResources(server: McpServer, ctx: McpContext): void {
	server.registerResource(
		'ticket',
		new ResourceTemplate('trackr://ticket/{key}', { list: undefined }),
		{
			title: 'Ticket',
			description: 'A support ticket by display id (e.g. trackr://ticket/TRACK-108) as markdown.',
			mimeType: 'text/markdown'
		},
		async (uri, vars) => markdown(uri, (await loadTicketDetail(ctx, variable(vars.key))).markdown)
	);

	server.registerResource(
		'task',
		new ResourceTemplate('trackr://task/{key}', { list: undefined }),
		{
			title: 'Task',
			description: 'A project task by display id (e.g. trackr://task/WEB-12) as markdown.',
			mimeType: 'text/markdown'
		},
		async (uri, vars) => markdown(uri, (await loadTaskDetail(ctx, variable(vars.key))).markdown)
	);

	server.registerResource(
		'wiki',
		new ResourceTemplate('trackr://wiki/{id}', {
			list: async () => {
				if (!isTrackrTeam(ctx.locals)) return { resources: [] };
				const pages = (await loadWikiTree()).filter((n) => !n.isFolder).slice(0, WIKI_LIST_CAP);
				return {
					resources: pages.map((p) => ({
						uri: `trackr://wiki/${p.id}`,
						name: p.title,
						mimeType: 'text/markdown'
					}))
				};
			}
		}),
		{
			title: 'Wiki page',
			description: 'An internal wiki page by uuid as markdown (staff only).',
			mimeType: 'text/markdown'
		},
		async (uri, vars) =>
			markdown(uri, (await loadWikiPageMarkdown(ctx, variable(vars.id))).markdown)
	);

	server.registerResource(
		'note',
		new ResourceTemplate('trackr://note/{id}', { list: undefined }),
		{
			title: 'Note',
			description: 'A quick or meeting note by uuid as markdown (staff only).',
			mimeType: 'text/markdown'
		},
		async (uri, vars) => markdown(uri, (await loadNoteMarkdown(ctx, variable(vars.id))).markdown)
	);

	server.registerResource(
		'attachment',
		new ResourceTemplate('trackr://attachment/{id}', { list: undefined }),
		{
			title: 'Attachment',
			description: 'The original bytes of an attachment by uuid (access follows its parent).'
		},
		async (uri, vars) => {
			const id = variable(vars.id);
			if (!isUuid(id)) throw new ToolError(400, 'Attachment id must be a uuid.');
			const row = await getAttachment(id);
			const entityCtx = row ? await resolveEntityContext(row.entityType, row.entityId) : null;
			if (
				!row ||
				!entityCtx ||
				!(await authorizeAttachmentAccess(ctx.locals, row.entityType, entityCtx, 'read'))
			) {
				throw new ToolError(404, 'Attachment not found.');
			}
			const bytes = await storage.get(originalKey(row));
			return {
				contents: [{ uri: uri.href, mimeType: row.mimeType, blob: bytes.toString('base64') }]
			};
		}
	);
}
