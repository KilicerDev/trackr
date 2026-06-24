// Client-side PDF export for wiki pages.
//
// Converts a TipTap / ProseMirror document (as produced by `editor.getJSON()`)
// into a pdfmake document definition and triggers a browser download. The output
// is a real vector PDF with selectable, searchable text — no headless browser and
// no rasterization. The mapping below covers the wiki's full schema
// (see src/lib/collab/extensions.ts): StarterKit nodes/marks + TaskList/TaskItem.

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

// Minimal structural types for the slice of ProseMirror JSON we consume. Kept
// local so this module stays decoupled from TipTap internals.
type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = {
	type: string;
	attrs?: Record<string, unknown>;
	content?: Node[];
	marks?: Mark[];
	text?: string;
};
type Doc = { type: string; content?: Node[] };

const PAGE_CONTENT_WIDTH = 515; // A4 width (595pt) minus default 40pt margins.

/** Flatten a node's text content into a single plain string (for code blocks). */
function plainText(nodes: Node[] | undefined): string {
	if (!nodes) return '';
	return nodes.map((n) => (n.type === 'text' ? (n.text ?? '') : plainText(n.content))).join('');
}

/** Map inline content (text nodes + marks, hard breaks) to pdfmake text runs. */
function mapInline(nodes: Node[] | undefined): Content[] {
	if (!nodes) return [];
	const runs: Content[] = [];
	for (const n of nodes) {
		if (n.type === 'hardBreak') {
			runs.push({ text: '\n' });
			continue;
		}
		if (n.type !== 'text') {
			// Defensive: unexpected inline node — recurse for any text within.
			runs.push(...mapInline(n.content));
			continue;
		}
		const run: Record<string, unknown> = { text: n.text ?? '' };
		for (const mark of n.marks ?? []) {
			switch (mark.type) {
				case 'bold':
					run.bold = true;
					break;
				case 'italic':
					run.italics = true;
					break;
				case 'strike':
					run.decoration = 'lineThrough';
					break;
				case 'underline':
					run.decoration = 'underline';
					break;
				case 'code':
					run.background = '#f1f3f5';
					run.color = '#b4255b';
					break;
				case 'link': {
					const href = mark.attrs?.href;
					if (typeof href === 'string') {
						run.link = href;
						run.color = '#2563eb';
						run.decoration = 'underline';
					}
					break;
				}
			}
		}
		runs.push(run as unknown as Content);
	}
	return runs;
}

/** Unwrap a listItem's block children into pdfmake content for a list entry. */
function listItemContent(item: Node): Content {
	const blocks = mapNodes(item.content);
	// A single paragraph collapses to its inline run so list bullets sit tight;
	// anything richer (nested lists, multiple blocks) becomes a stack.
	return blocks.length === 1 ? blocks[0] : { stack: blocks };
}

/**
 * Map a taskItem to a row with a vector-drawn checkbox + label, mirroring the
 * editor. We draw the box with `canvas` instead of a Unicode glyph because
 * pdfmake's bundled Roboto font has no checkbox glyphs (they render as tofu).
 */
function taskItemContent(item: Node): Content {
	const checked = item.attrs?.checked === true;
	const paragraph = (item.content ?? []).find((c) => c.type === 'paragraph');
	const label = mapInline(paragraph?.content);
	// A nested taskList/bulletList lives alongside the paragraph; render indented.
	const nested = (item.content ?? []).filter((c) => c.type !== 'paragraph');

	const box: Content = {
		width: 16,
		canvas: checked
			? [
					{ type: 'rect', x: 0, y: 1.5, w: 11, h: 11, r: 2.5, color: '#2563eb' },
					{ type: 'line', x1: 2.5, y1: 7.5, x2: 4.7, y2: 10, lineWidth: 1.3, lineColor: '#ffffff' },
					{ type: 'line', x1: 4.7, y1: 10, x2: 8.7, y2: 4.5, lineWidth: 1.3, lineColor: '#ffffff' }
				]
			: [
					{
						type: 'rect',
						x: 0,
						y: 1.5,
						w: 11,
						h: 11,
						r: 2.5,
						lineWidth: 1,
						lineColor: '#c0c6cc',
						color: '#f6f8fa'
					}
				]
	} as Content;

	const row: Content = {
		columns: [box, { width: '*', text: label, margin: [0, 0.5, 0, 0] }],
		columnGap: 4,
		margin: [0, 0, 0, nested.length ? 2 : 4]
	};
	if (nested.length) {
		return { stack: [row, { stack: mapNodes(nested), margin: [16, 0, 0, 4] }] };
	}
	return row;
}

/** Map block-level nodes to pdfmake content. */
function mapNodes(nodes: Node[] | undefined): Content[] {
	if (!nodes) return [];
	const out: Content[] = [];
	for (const n of nodes) {
		switch (n.type) {
			case 'heading': {
				const level = (n.attrs?.level as number) ?? 1;
				out.push({ text: mapInline(n.content), style: `h${level}` });
				break;
			}
			case 'paragraph':
				out.push({ text: mapInline(n.content), margin: [0, 0, 0, 6] });
				break;
			case 'blockquote':
				// A one-cell table with only a left border reproduces the editor's
				// vertical quote bar and auto-sizes to the content height.
				out.push({
					table: {
						widths: ['*'],
						body: [
							[{ stack: mapNodes(n.content), style: 'quote', border: [true, false, false, false] }]
						]
					},
					layout: {
						defaultBorder: false,
						vLineWidth: () => 2.5,
						vLineColor: () => '#d0d7de',
						paddingLeft: () => 12,
						paddingTop: () => 0,
						paddingBottom: () => 0,
						paddingRight: () => 0
					},
					margin: [0, 2, 0, 10]
				} as Content);
				break;
			case 'codeBlock':
				out.push({ text: plainText(n.content), style: 'code' });
				break;
			case 'bulletList':
				out.push({ ul: (n.content ?? []).map(listItemContent), margin: [0, 0, 0, 6] });
				break;
			case 'orderedList':
				out.push({ ol: (n.content ?? []).map(listItemContent), margin: [0, 0, 0, 6] });
				break;
			case 'taskList':
				// Plain stack (not a `ul`) so our drawn checkboxes replace bullets.
				out.push({ stack: (n.content ?? []).map(taskItemContent), margin: [0, 0, 0, 6] });
				break;
			case 'horizontalRule':
				out.push({
					canvas: [
						{
							type: 'line',
							x1: 0,
							y1: 0,
							x2: PAGE_CONTENT_WIDTH,
							y2: 0,
							lineWidth: 0.5,
							lineColor: '#d0d7de'
						}
					],
					margin: [0, 6, 0, 12]
				});
				break;
			default:
				// Unknown block — fall back to mapping any children so content isn't lost.
				if (n.content) out.push(...mapNodes(n.content));
		}
	}
	return out;
}

/** Build a pdfmake document definition from a page title and TipTap document. */
export function buildDocDefinition(title: string, doc: Doc): TDocumentDefinitions {
	const safeTitle = title.trim() || 'Untitled';
	return {
		info: { title: safeTitle },
		pageSize: 'A4',
		pageMargins: [40, 48, 40, 48],
		content: [{ text: safeTitle, style: 'docTitle' }, ...mapNodes(doc.content)],
		styles: {
			docTitle: { fontSize: 24, bold: true, margin: [0, 0, 0, 16] },
			h1: { fontSize: 18, bold: true, margin: [0, 12, 0, 6] },
			h2: { fontSize: 15, bold: true, margin: [0, 10, 0, 5] },
			h3: { fontSize: 13, bold: true, margin: [0, 8, 0, 4] },
			quote: { italics: true, color: '#57606a' },
			code: {
				font: 'Roboto',
				fontSize: 9.5,
				color: '#24292f',
				background: '#f6f8fa',
				margin: [0, 4, 0, 10],
				preserveLeadingSpaces: true
			}
		},
		defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.35, color: '#1f2328' },
		footer: (currentPage: number, pageCount: number) => ({
			text: `${currentPage} / ${pageCount}`,
			alignment: 'center',
			fontSize: 8,
			color: '#8c959f',
			margin: [0, 12, 0, 0]
		})
	};
}

function slug(title: string): string {
	const s = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return s || 'wiki-page';
}

/**
 * Generate and download a PDF for a wiki page. Browser-only: dynamically imports
 * pdfmake and its font bundle so the library never lands in the SSR/server build.
 */
export async function exportWikiPageToPdf(title: string, doc: Doc): Promise<void> {
	const [pdfMakeMod, vfsMod] = await Promise.all([
		import('pdfmake/build/pdfmake'),
		import('pdfmake/build/vfs_fonts')
	]);
	// Interop: both ship as UMD, so the usable object may be on `.default`.
	const pdfMake = ((pdfMakeMod as { default?: unknown }).default ?? pdfMakeMod) as {
		addVirtualFileSystem: (vfs: unknown) => void;
		createPdf: (def: TDocumentDefinitions) => { download: (name: string) => void };
	};
	const vfs = (vfsMod as { default?: unknown }).default ?? vfsMod;
	pdfMake.addVirtualFileSystem(vfs);
	pdfMake.createPdf(buildDocDefinition(title, doc)).download(`${slug(title)}.pdf`);
}
