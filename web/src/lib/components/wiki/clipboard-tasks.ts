// Copy/cut task lists in markup other apps understand.
//
// Tiptap's TaskItem serializes as
//   <li data-type="taskItem" data-checked><label><input …><span></span></label><div><p>text</p></div></li>
// Notion (and friends) read the nested <div><p> as a child block, so a pasted
// checklist arrives as empty "To-do" rows with the text underneath. On copy we
// flatten each item to <li data-type="taskItem" data-checked><input type=checkbox> text …</li>
// (nested lists stay as children) and write a markdown-style plain-text
// fallback (`- [ ] text`). Our own parser still reads the flattened form back.
//
// Presentation-only plugin (no schema) — client editor only.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Fragment, Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

const key = new PluginKey('clipboardTaskLists');

/** Rewrite every serialized task item under `root` in place. Exported for tests. */
export function flattenTaskItems(root: ParentNode): boolean {
	const items = root.querySelectorAll<HTMLElement>('li[data-type="taskItem"]');
	for (const li of items) {
		const doc = li.ownerDocument;
		const checked = li.getAttribute('data-checked') === 'true';
		li.querySelector(':scope > label')?.remove();
		const content = li.querySelector(':scope > div');
		const input = doc.createElement('input');
		input.type = 'checkbox';
		if (checked) input.setAttribute('checked', '');
		if (content) {
			const first = content.firstElementChild;
			if (first?.tagName === 'P') first.replaceWith(...first.childNodes);
			while (content.firstChild) li.appendChild(content.firstChild);
			content.remove();
		}
		li.prepend(input, doc.createTextNode(' '));
	}
	return items.length > 0;
}

/** Markdown-flavoured plain text: task/list items get their markers back. */
export function fragmentToText(fragment: Fragment, indent = ''): string {
	const lines: string[] = [];
	fragment.forEach((node) => lines.push(nodeToText(node, indent)));
	return lines.filter((l) => l.length).join('\n');
}

function nodeToText(node: PMNode, indent: string): string {
	const name = node.type.name;
	if (name === 'taskList' || name === 'bulletList' || name === 'orderedList') {
		const out: string[] = [];
		node.forEach((item, _off, i) => {
			const marker =
				item.type.name === 'taskItem'
					? `- [${item.attrs.checked ? 'x' : ' '}] `
					: name === 'orderedList'
						? `${i + 1}. `
						: '- ';
			const [first, ...rest] = itemParts(item, indent + '  ');
			out.push(`${indent}${marker}${first ?? ''}`, ...rest);
		});
		return out.filter((l) => l.length).join('\n');
	}
	if (node.isTextblock) return indent + node.textContent;
	if (node.isBlock) return fragmentToText(node.content, indent);
	return indent + node.textContent;
}

/** First line = the item's own text; the rest = nested blocks, already indented. */
function itemParts(item: PMNode, indent: string): string[] {
	const parts: string[] = [];
	item.forEach((child, _off, i) => {
		if (i === 0 && child.isTextblock) parts.push(child.textContent);
		else parts.push(nodeToText(child, indent));
	});
	return parts;
}

function handle(view: EditorView, event: ClipboardEvent, cut: boolean): boolean {
	const { selection } = view.state;
	if (selection.empty || !event.clipboardData) return false;
	const slice = selection.content();
	const { dom, text } = view.serializeForClipboard(slice);
	// Plain copies keep ProseMirror's own handling (and its lossless markers).
	if (!flattenTaskItems(dom)) return false;
	event.clipboardData.clearData();
	event.clipboardData.setData('text/html', dom.innerHTML);
	event.clipboardData.setData('text/plain', fragmentToText(slice.content) || text);
	event.preventDefault();
	if (cut && view.editable) view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
	return true;
}

export const ClipboardTaskLists = Extension.create({
	name: 'clipboardTaskLists',
	addProseMirrorPlugins() {
		return [
			new Plugin({
				key,
				props: {
					handleDOMEvents: {
						copy: (view, event) => handle(view, event, false),
						cut: (view, event) => handle(view, event, true)
					}
				}
			})
		];
	}
});
