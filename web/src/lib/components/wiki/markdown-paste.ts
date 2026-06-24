// Client-only Markdown-on-paste for the wiki/note editor.
//
// Tiptap has no built-in Markdown parsing: pasting raw Markdown source (`# x`,
// `- y`, `**z**`) would otherwise land as literal characters. This extension
// intercepts *plain-text* pastes that look like Markdown, renders them to HTML
// with `marked`, and hands that HTML to ProseMirror so it becomes real nodes
// (headings, lists, bold, links, …).
//
// Presentation-only (a paste plugin, no schema): added client-side alongside
// SlashCommand/WikiImageUpload — never in the shared collab schema, which must
// stay identical on the Node server for the Yjs<->ProseMirror conversion.
//
// Rich pastes (from another doc/browser) carry `text/html` and are left alone;
// image pastes are handled earlier by WikiImageUpload. Only genuine plain text
// reaches the Markdown path, and even then a heuristic gate avoids mangling
// ordinary prose that happens to contain a stray `*` or `_`.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { marked } from 'marked';

/** Block- or inline-level markers that signal the text is really Markdown. */
function looksLikeMarkdown(text: string): boolean {
	return (
		/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.*\|.*\|)/m.test(text) || // headings, lists, quotes, fences, tables
		/\[[^\]]+\]\([^)]+\)/.test(text) || // links / images
		/\*\*[^*]+\*\*|__[^_]+__/.test(text) || // bold
		/~~[^~]+~~/.test(text) // strikethrough
	);
}

// `marked` renders GFM task items as a plain `<ul><li><input type=checkbox> …`,
// which Tiptap treats as an ordinary bullet list. Rewrite any list that holds
// checkbox items into the markup TaskList/TaskItem actually parse
// (`ul[data-type=taskList]` / `li[data-type=taskItem][data-checked]`), dropping
// the input and wrapping the text in a <p> to satisfy taskItem's `paragraph+`.
function adoptTaskLists(html: string): string {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	for (const ul of doc.querySelectorAll('ul')) {
		const items = [...ul.children].filter((el): el is HTMLLIElement => el.tagName === 'LI');
		const hasCheckbox = items.some((li) => li.querySelector(':scope > input[type="checkbox"]'));
		if (!hasCheckbox) continue;
		ul.setAttribute('data-type', 'taskList');
		for (const li of items) {
			const box = li.querySelector(':scope > input[type="checkbox"]');
			li.setAttribute('data-type', 'taskItem');
			li.setAttribute('data-checked', box?.hasAttribute('checked') ? 'true' : 'false');
			box?.remove();
			const p = doc.createElement('p');
			while (li.firstChild) p.appendChild(li.firstChild);
			li.appendChild(p);
		}
	}
	return doc.body.innerHTML;
}

export const MarkdownPaste = Extension.create({
	name: 'markdownPaste',

	addProseMirrorPlugins() {
		const editor = this.editor;
		return [
			new Plugin({
				key: new PluginKey('markdownPaste'),
				props: {
					handlePaste: (_view, event) => {
						const data = event.clipboardData;
						if (!data) return false;
						// A real rich-text paste brings HTML — let Tiptap handle it.
						if (data.getData('text/html')) return false;
						const text = data.getData('text/plain');
						if (!text || !looksLikeMarkdown(text)) return false;

						const rendered = marked.parse(text, { async: false, gfm: true, breaks: false });
						if (typeof rendered !== 'string') return false;
						const html = adoptTaskLists(rendered);

						event.preventDefault();
						// insertContent parses the HTML against the editor schema and
						// replaces the current selection, i.e. normal paste behaviour.
						editor.commands.insertContent(html, {
							parseOptions: { preserveWhitespace: false }
						});
						return true;
					}
				}
			})
		];
	}
});
