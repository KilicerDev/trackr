// Markdown → safe HTML for the detail widget. `marked` renders; then the
// result is defanged the same way the server does for wiki/notes
// ($lib/server/content/markdown.ts): no scripts/embeds/forms, no event
// handlers, no javascript:/data: URLs (data:image/ is allowed for pasted
// images). Links open through the host (see detail/main.ts), never in-frame.

import { marked } from 'marked';

const DROP = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'meta', 'link', 'base'];

// trackr's inline tokens (src/lib/utils/mentions.ts, refs.ts): `@[Name](userId)`
// and `~[KEY](type:id)`. Flatten them to their display form — the ids mean
// nothing here and `marked` would otherwise turn them into dead links.
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;
const REF_RE = /~\[([^\]]+)\]\((ticket|task|project):([^)]+)\)/g;
function plainify(md: string): string {
	return md
		.replace(MENTION_RE, (_m, name: string) => `**@${name}**`)
		.replace(REF_RE, (_m, display: string) => `**${display}**`);
}

export function renderMarkdown(md: string): DocumentFragment {
	const html = marked.parse(plainify(md ?? ''), {
		async: false,
		gfm: true,
		breaks: true
	}) as string;
	const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
	for (const sel of DROP) for (const node of doc.querySelectorAll(sel)) node.remove();
	for (const node of doc.body.querySelectorAll('*')) {
		for (const attr of [...node.attributes]) {
			const name = attr.name.toLowerCase();
			if (name.startsWith('on')) node.removeAttribute(attr.name);
			else if (
				(name === 'href' || name === 'src' || name === 'xlink:href') &&
				/^\s*(javascript|data|vbscript):/i.test(attr.value) &&
				!(name === 'src' && /^\s*data:image\//i.test(attr.value))
			) {
				node.removeAttribute(attr.name);
			}
		}
		if (node.tagName === 'A') node.setAttribute('rel', 'noopener');
		// GFM task lists render as disabled checkboxes; keep them inert.
		if (node.tagName === 'INPUT') node.setAttribute('disabled', '');
	}
	const frag = document.createDocumentFragment();
	frag.append(...doc.body.childNodes);
	return frag;
}
