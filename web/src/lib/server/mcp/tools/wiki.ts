// Wiki tools — internal team only (mirrors the /wiki route guard and
// /api/v1/wiki). Bodies are markdown on the wire: html→md on read
// (`docHtmlToMarkdown`), md→html on write (`markdownToDocHtml`), and body
// writes go through `updateWikiBody` so a live collaborative document is
// updated via the collab layer rather than a stale `body_html` mirror.

import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import { isTrackrTeam } from '$lib/server/permissions';
import {
	createWikiPage,
	deleteWikiPage,
	getWikiPage,
	getWikiPageWithBody,
	loadWikiTree,
	moveWikiPage,
	updateWikiBody,
	updateWikiPage,
	type WikiTreeNode
} from '$lib/server/wiki'; // W2: getWikiPageWithBody, updateWikiBody
import { docHtmlToMarkdown, markdownToDocHtml } from '$lib/server/content/markdown'; // W2
import { iso } from '../format';
import { isUuid } from '../ids';
import {
	DESTRUCTIVE,
	fail,
	guarded,
	READ_ONLY,
	text,
	WRITE,
	WRITE_IDEMPOTENT,
	type McpContext
} from './shared';

const pageIdSchema = z.string().describe('Wiki page/folder uuid (from `wiki_tree` or `search`).');

function requireStaff(ctx: McpContext): void {
	if (!isTrackrTeam(ctx.locals)) fail(403, 'The wiki is restricted to the internal team.');
}

function requireUuid(id: string, what: string): string {
	const v = id.trim();
	if (!isUuid(v)) fail(400, `${what} must be a uuid.`);
	return v;
}

export function wikiTreeMd(nodes: readonly WikiTreeNode[]): string {
	const children = new Map<string | null, WikiTreeNode[]>();
	for (const n of nodes) {
		const list = children.get(n.parentId) ?? [];
		list.push(n);
		children.set(n.parentId, list);
	}
	const lines: string[] = [];
	const walk = (parentId: string | null, depth: number) => {
		for (const n of children.get(parentId) ?? []) {
			const indent = '  '.repeat(depth);
			lines.push(`${indent}- ${n.isFolder ? '📁' : '📄'} ${n.title} — id \`${n.id}\``);
			walk(n.id, depth + 1);
		}
	};
	walk(null, 0);
	return lines.length ? lines.join('\n') : '_the wiki is empty_';
}

/** Page (not folder) as markdown — shared by `wiki_get_page` and the resource. */
export async function loadWikiPageMarkdown(
	ctx: McpContext,
	id: string
): Promise<{
	id: string;
	title: string;
	icon: string;
	isFolder: boolean;
	updatedAt: string | null;
	markdown: string;
}> {
	requireStaff(ctx);
	const pageId = requireUuid(id, 'Page id');
	const page = await getWikiPageWithBody(pageId);
	if (!page) fail(404, 'Wiki page not found.');
	const body = page.bodyHtml ? docHtmlToMarkdown(page.bodyHtml) : '';
	const markdown = [`# ${page.title}`, '', body.trim() || '_empty page_'].join('\n');
	return {
		id: page.id,
		title: page.title,
		icon: page.icon,
		isFolder: page.isFolder,
		updatedAt: iso(page.updatedAt),
		markdown
	};
}

export function registerWikiTools(server: McpServer, ctx: McpContext): void {
	server.registerTool(
		'wiki_tree',
		{
			title: 'Wiki tree',
			description:
				'The whole internal wiki as an indented tree of folders and pages with their uuids (staff only). Pass a page id to `wiki_get_page`; pass a folder id as `parentId` when creating or moving.',
			inputSchema: z.object({}),
			annotations: READ_ONLY
		},
		guarded(async () => {
			requireStaff(ctx);
			const nodes = await loadWikiTree();
			return text(`## Wiki (${nodes.length} items)\n\n${wikiTreeMd(nodes)}`, {
				total: nodes.length,
				pages: nodes
			});
		})
	);

	server.registerTool(
		'wiki_get_page',
		{
			title: 'Get wiki page',
			description:
				'Read one wiki page by uuid as markdown (staff only). Embedded images and file links are kept as markdown links to their download URLs.',
			inputSchema: z.object({ id: pageIdSchema }),
			annotations: READ_ONLY
		},
		guarded(async ({ id }) => {
			const page = await loadWikiPageMarkdown(ctx, id);
			return text(page.markdown, { ...page, markdown: undefined });
		})
	);

	server.registerTool(
		'wiki_create_folder',
		{
			title: 'Create wiki folder',
			description:
				'Create a wiki folder (staff only) at the root or inside another folder (`parentId`). Returns the new folder id.',
			inputSchema: z.object({
				title: z.string().min(1).max(200).describe('Folder title.'),
				parentId: z.string().optional().describe('Parent folder uuid (omit for root).')
			}),
			annotations: WRITE
		},
		guarded(async ({ title, parentId }) => {
			requireStaff(ctx);
			const parent = parentId ? await requireFolder(parentId) : null;
			const id = await createWikiPage({
				title: title.trim(),
				parentId: parent?.id ?? null,
				isFolder: true,
				authorId: ctx.locals.user.id
			});
			return text(
				`Created wiki folder **${title.trim()}** — id \`${id}\`${parent ? ` inside ${parent.title}` : ' at the root'}.`,
				{
					id,
					title: title.trim(),
					parentId: parent?.id ?? null
				}
			);
		})
	);

	server.registerTool(
		'wiki_create_page',
		{
			title: 'Create wiki page',
			description:
				'Create a wiki page (staff only) with a markdown `body` (headings, lists, task lists `- [ ]`, code, tables, links, images by URL). Optional `parentId` folder. Returns the new page id.',
			inputSchema: z.object({
				title: z.string().min(1).max(200).describe('Page title.'),
				body: z.string().default('').describe('Page body in markdown.'),
				parentId: z.string().optional().describe('Parent folder uuid (omit for root).')
			}),
			annotations: WRITE
		},
		guarded(async ({ title, body, parentId }) => {
			requireStaff(ctx);
			const parent = parentId ? await requireFolder(parentId) : null;
			const html = body.trim() ? markdownToDocHtml(body) : '';
			const id = await createWikiPage({
				title: title.trim(),
				parentId: parent?.id ?? null,
				isFolder: false,
				body: html,
				authorId: ctx.locals.user.id
			});
			return text(
				`Created wiki page **${title.trim()}** — id \`${id}\`${parent ? ` inside ${parent.title}` : ' at the root'}.`,
				{
					id,
					title: title.trim(),
					parentId: parent?.id ?? null
				}
			);
		})
	);

	server.registerTool(
		'wiki_update_page',
		{
			title: 'Update wiki page',
			description:
				'Update a wiki page or folder (staff only): `title`, `icon` (lucide icon name), `body` (markdown — REPLACES the whole page, also for pages someone has open), or `parentId` to move it (null = root; only folders can contain items). Pass only the fields to change.',
			inputSchema: z.object({
				id: pageIdSchema,
				title: z.string().min(1).max(200).optional().describe('New title.'),
				body: z.string().optional().describe('New body in markdown (full replace).'),
				icon: z.string().max(64).optional().describe('Icon name.'),
				parentId: z
					.string()
					.nullable()
					.optional()
					.describe('Move into this folder uuid, or null for root.')
			}),
			annotations: WRITE_IDEMPOTENT
		},
		guarded(async ({ id, title, body, icon, parentId }) => {
			requireStaff(ctx);
			const pageId = requireUuid(id, 'Page id');
			const page = await getWikiPage(pageId);
			if (!page) fail(404, 'Wiki page not found.');
			const uid = ctx.locals.user.id;
			const changed: string[] = [];

			const meta: Parameters<typeof updateWikiPage>[1] = {};
			if (title !== undefined) meta.title = title.trim();
			if (icon !== undefined) meta.icon = icon.trim();
			if (Object.keys(meta).length) {
				await updateWikiPage(pageId, meta, uid);
				changed.push(...Object.keys(meta));
			}

			if (parentId !== undefined && parentId !== page.parentId) {
				const target = parentId ? await requireFolder(parentId) : null;
				const siblings = (await loadWikiTree())
					.filter((n) => n.parentId === (target?.id ?? null) && n.id !== pageId)
					.map((n) => n.id);
				try {
					await moveWikiPage({
						id: pageId,
						parentId: target?.id ?? null,
						orderedIds: [...siblings, pageId],
						updatedById: uid
					});
				} catch (err) {
					fail(400, err instanceof Error ? err.message : 'Move failed.');
				}
				changed.push('parentId');
			}

			if (body !== undefined) {
				if (page.isFolder) fail(400, 'Folders have no body.');
				await updateWikiBody(pageId, markdownToDocHtml(body), uid);
				changed.push('body');
			}

			if (changed.length === 0) fail(400, 'Nothing to update — pass at least one field.');
			return text(
				`Updated wiki ${page.isFolder ? 'folder' : 'page'} **${meta.title ?? page.title}** (${changed.join(', ')}).`,
				{
					id: pageId,
					fields: changed
				}
			);
		})
	);

	server.registerTool(
		'wiki_delete_page',
		{
			title: 'Delete wiki page',
			description:
				'Permanently delete a wiki page or folder (staff only). Deleting a folder deletes everything inside it. Cannot be undone.',
			inputSchema: z.object({ id: pageIdSchema }),
			annotations: DESTRUCTIVE
		},
		guarded(async ({ id }) => {
			requireStaff(ctx);
			const pageId = requireUuid(id, 'Page id');
			const page = await getWikiPage(pageId);
			if (!page) fail(404, 'Wiki page not found.');
			const descendants = page.isFolder
				? (await loadWikiTree()).filter((n) => n.parentId === pageId).length
				: 0;
			await deleteWikiPage(pageId);
			return text(
				`Deleted wiki ${page.isFolder ? 'folder' : 'page'} **${page.title}**${descendants ? ` and its ${descendants} direct children` : ''}.`,
				{ id: pageId, deleted: true }
			);
		})
	);
}

async function requireFolder(id: string): Promise<{ id: string; title: string }> {
	const folderId = requireUuid(id, 'parentId');
	const parent = await getWikiPage(folderId);
	if (!parent) fail(404, `Folder ${folderId} not found.`);
	if (!parent.isFolder) fail(400, `${parent.title} is a page, not a folder.`);
	return { id: parent.id, title: parent.title };
}
