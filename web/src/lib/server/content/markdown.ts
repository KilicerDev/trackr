// Markdown <-> document HTML for wiki pages and notes.
//
// Tickets/tasks store markdown natively; wiki pages and notes store the Tiptap
// document HTML (derived from the Yjs doc). The MCP surface speaks markdown
// everywhere, so writes go md -> HTML (marked, GFM, then task-list adoption to
// the `ul[data-type=taskList]` markup Tiptap's TaskList/TaskItem parse — the
// same rewrite the client paste handler does) and reads go HTML -> md
// (turndown + the GFM plugin, with Tiptap's task items and file chips mapped
// back to `- [x]` / links).

import { marked } from 'marked';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const DROP_ELEMENTS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'meta', 'link'];

/**
 * Render markdown to the HTML the collaborative editor stores: GFM (tables,
 * strikethrough, task lists), no hard line breaks on single newlines, task
 * lists adopted to Tiptap markup, and defanged (no scripts, event handlers or
 * javascript: URLs).
 */
export function markdownToDocHtml(md: string): string {
	const rendered = marked.parse(md ?? '', { async: false, gfm: true, breaks: false });
	const html = typeof rendered === 'string' ? rendered : '';
	const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
	const doc = dom.window.document;

	for (const sel of DROP_ELEMENTS) for (const el of doc.querySelectorAll(sel)) el.remove();
	for (const el of doc.body.querySelectorAll('*')) {
		for (const attr of [...el.attributes]) {
			const name = attr.name.toLowerCase();
			if (name.startsWith('on')) el.removeAttribute(attr.name);
			else if (
				(name === 'href' || name === 'src' || name === 'xlink:href') &&
				/^\s*(javascript|data|vbscript):/i.test(attr.value) &&
				!(name === 'src' && /^\s*data:image\//i.test(attr.value))
			) {
				el.removeAttribute(attr.name);
			}
		}
	}

	// `marked` renders GFM task items as `<li><input type=checkbox> …`, which
	// Tiptap treats as an ordinary bullet. Rewrite any list holding checkbox
	// items into TaskList/TaskItem markup, dropping the input and wrapping the
	// text in a <p> to satisfy taskItem's `paragraph+` content.
	for (const ul of doc.querySelectorAll('ul')) {
		const items = [...ul.children].filter((el) => el.tagName === 'LI');
		const hasCheckbox = items.some((li) => li.querySelector(':scope > input[type="checkbox"]'));
		if (!hasCheckbox) continue;
		ul.setAttribute('data-type', 'taskList');
		for (const li of items) {
			const box = li.querySelector(':scope > input[type="checkbox"]');
			li.setAttribute('data-type', 'taskItem');
			li.setAttribute('data-checked', box?.hasAttribute('checked') ? 'true' : 'false');
			box?.remove();
			// marked leaves the space that followed the checkbox; drop it.
			const first = li.firstChild;
			if (first && first.nodeType === 3)
				first.textContent = (first.textContent ?? '').replace(/^\s+/, '');
			// Keep nested lists as siblings of the paragraph (Tiptap: paragraph+ block*).
			const p = doc.createElement('p');
			const nested: Element[] = [];
			while (li.firstChild) {
				const child = li.firstChild;
				if (child.nodeType === 1 && /^(UL|OL)$/.test((child as Element).tagName)) {
					nested.push(child as Element);
					li.removeChild(child);
				} else {
					p.appendChild(child);
				}
			}
			li.appendChild(p);
			for (const n of nested) li.appendChild(n);
		}
	}

	return doc.body.innerHTML;
}

let turndown: TurndownService | null = null;

function service(): TurndownService {
	if (turndown) return turndown;
	const td = new TurndownService({
		headingStyle: 'atx',
		codeBlockStyle: 'fenced',
		bulletListMarker: '-',
		emDelimiter: '_',
		strongDelimiter: '**'
	});
	td.use(gfm);

	// One item body: no leading/trailing blank lines, paragraphs collapsed to
	// single line breaks, continuation lines indented under the marker.
	const itemBody = (content: string, indent: string) =>
		content
			.replace(/^\n+/, '')
			.replace(/\n+$/, '')
			.replace(/\n{2,}/g, '\n')
			.replace(/\n/g, `\n${indent}`);

	// Plain list items with a 2-space pad (turndown's default pads to 4).
	td.addRule('compactListItem', {
		filter: 'li',
		replacement: (content, node, options) => {
			const parent = node.parentNode as HTMLElement;
			let prefix = `${options.bulletListMarker} `;
			if (parent.nodeName === 'OL') {
				const start = Number(parent.getAttribute('start') ?? 1);
				const index = Array.prototype.indexOf.call(parent.children, node);
				prefix = `${start + index}. `;
			}
			return `${prefix}${itemBody(content, ' '.repeat(prefix.length))}\n`;
		}
	});
	// Tiptap task items: <li data-type="taskItem" data-checked="true|false">
	// <label><input type=checkbox><span></span></label><div><p>…</p></div></li>
	td.addRule('tiptapTaskItem', {
		filter: (node) =>
			node.nodeName === 'LI' && (node as HTMLElement).getAttribute('data-type') === 'taskItem',
		replacement: (content, node) => {
			const checked = (node as HTMLElement).getAttribute('data-checked') === 'true';
			return `- [${checked ? 'x' : ' '}] ${itemBody(content, '      ')}\n`;
		}
	});
	// The checkbox/label chrome inside a task item carries no content.
	td.addRule('tiptapTaskChrome', {
		filter: (node) =>
			(node.nodeName === 'LABEL' || node.nodeName === 'INPUT') &&
			!!(node.parentNode as HTMLElement | null)?.getAttribute?.('data-type')?.startsWith('task'),
		replacement: () => ''
	});
	// Inline file chips -> plain links to the stable download URL.
	td.addRule('fileAttachment', {
		filter: (node) =>
			node.nodeName === 'A' && (node as HTMLElement).hasAttribute('data-file-attachment'),
		replacement: (_content, node) => {
			const el = node as HTMLElement;
			const id = el.getAttribute('data-file-attachment') ?? '';
			const name = el.getAttribute('data-filename') || el.getAttribute('download') || 'file';
			const href = el.getAttribute('href') || `/api/attachments/${id}/download`;
			return `[${name}](${href})`;
		}
	});
	turndown = td;
	return td;
}

/** Convert stored document HTML back to GFM markdown. Images keep their src. */
export function docHtmlToMarkdown(html: string): string {
	if (!html || !html.trim()) return '';
	return service()
		.turndown(html)
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}
