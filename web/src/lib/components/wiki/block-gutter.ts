// Notion-style block gutter for the live editor: hovering a block reveals a
// "+" that inserts a block below and opens the slash menu. Presentation-only —
// a plugin view, no schema — so it stays client-side, never in the shared
// collab extensions.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

const key = new PluginKey('blockGutter');
const LIST_ITEMS = new Set(['listItem', 'taskItem']);
const GUTTER_WIDTH = 30;
const HIDE_DELAY = 120;

const PLUS_SVG =
	'<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>';

type Block = { pos: number; node: PMNode; dom: HTMLElement };

export type BlockGutterOptions = {
	addLabel: string;
};

class GutterView {
	private el: HTMLDivElement;
	private add: HTMLButtonElement;
	private host: HTMLElement;
	private block: Block | null = null;
	private hideTimer: ReturnType<typeof setTimeout> | undefined;
	private raf = 0;

	constructor(
		private view: EditorView,
		private opts: BlockGutterOptions
	) {
		this.host = view.dom.parentElement ?? view.dom;
		this.el = document.createElement('div');
		this.el.className = 'block-gutter';
		this.el.setAttribute('contenteditable', 'false');
		this.add = document.createElement('button');
		this.add.type = 'button';
		this.add.className = 'block-gutter__btn block-gutter__add';
		this.add.title = opts.addLabel;
		this.add.setAttribute('aria-label', opts.addLabel);
		this.add.innerHTML = PLUS_SVG;
		this.el.append(this.add);
		this.host.appendChild(this.el);

		this.host.addEventListener('mousemove', this.onMove);
		this.host.addEventListener('mouseleave', this.scheduleHide);
		this.el.addEventListener('mouseenter', this.cancelHide);
		this.el.addEventListener('mouseleave', this.scheduleHide);
		this.view.dom.addEventListener('keydown', this.hide);
		this.add.addEventListener('mousedown', (e) => e.preventDefault());
		this.add.addEventListener('click', this.onAdd);
		window.addEventListener('scroll', this.hide, true);
	}

	update() {
		// Content changed under the pointer (typing, collab): keep the gutter
		// glued to its block or drop it if the block is gone.
		if (this.block) this.place();
	}

	destroy() {
		this.cancelHide();
		cancelAnimationFrame(this.raf);
		this.host.removeEventListener('mousemove', this.onMove);
		this.host.removeEventListener('mouseleave', this.scheduleHide);
		this.view.dom.removeEventListener('keydown', this.hide);
		window.removeEventListener('scroll', this.hide, true);
		this.el.remove();
	}

	private onMove = (e: MouseEvent) => {
		if (!this.view.editable || this.el.contains(e.target as Node)) return;
		cancelAnimationFrame(this.raf);
		this.raf = requestAnimationFrame(() => {
			const block = this.blockAt(e.clientX, e.clientY);
			if (!block) return this.hide();
			this.cancelHide();
			this.block = block;
			this.place();
		});
	};

	/**
	 * The block on the row under the pointer: the innermost list item when the
	 * row is inside a list, otherwise the top-level block. Resolved from the DOM
	 * element at that point — probing the left edge would land in a list's
	 * padding and pick the whole list. Pointers in the margin are pulled onto
	 * the row's text column so the gutter still follows the row.
	 */
	private blockAt(clientX: number, clientY: number): Block | null {
		const root = this.view.dom.getBoundingClientRect();
		if (clientY < root.top || clientY > root.bottom) return null;
		const x = Math.min(Math.max(clientX, root.left + 40), root.right - 4);
		const hit = document.elementFromPoint(x, clientY);
		if (!hit || !this.view.dom.contains(hit) || hit === this.view.dom) return null;
		const dom = hit.closest('li, .ProseMirror > *') as HTMLElement | null;
		if (!dom || !this.view.dom.contains(dom)) return null;
		try {
			const inner = this.view.posAtDOM(dom, 0);
			const $pos = this.view.state.doc.resolve(inner);
			if ($pos.depth === 0) {
				// Leaf block (rule, image): the position is the node itself.
				const node = this.view.state.doc.nodeAt(inner);
				return node ? { pos: inner, node, dom } : null;
			}
			return { pos: $pos.before(), node: $pos.parent, dom };
		} catch {
			return null;
		}
	}

	private place() {
		const b = this.block;
		if (!b || !b.dom.isConnected) return this.hide();
		const rect = b.dom.getBoundingClientRect();
		const host = this.host.getBoundingClientRect();
		const root = this.view.dom.getBoundingClientRect();
		const line = parseFloat(getComputedStyle(b.dom).lineHeight) || 24;
		const padTop = parseFloat(getComputedStyle(b.dom).paddingTop) || 0;
		this.el.style.top = `${rect.top - host.top + padTop + Math.max(0, (line - 24) / 2)}px`;
		this.el.style.left = `${root.left - host.left - GUTTER_WIDTH}px`;
		this.el.classList.add('is-visible');
	}

	private hide = () => {
		this.cancelHide();
		this.block = null;
		this.el.classList.remove('is-visible');
	};
	private scheduleHide = () => {
		this.cancelHide();
		this.hideTimer = setTimeout(this.hide, HIDE_DELAY);
	};
	private cancelHide = () => {
		if (this.hideTimer) clearTimeout(this.hideTimer);
		this.hideTimer = undefined;
	};

	/** "+" — put the caret in a fresh block after this one and open "/" commands. */
	private onAdd = (e: MouseEvent) => {
		e.preventDefault();
		const b = this.block;
		if (!b) return;
		const { state } = this.view;
		const tr = state.tr;
		const isList = LIST_ITEMS.has(b.node.type.name);
		const emptyPara = b.node.type.name === 'paragraph' && b.node.content.size === 0;
		let caret: number;
		if (emptyPara) {
			caret = b.pos + 1;
		} else {
			// Lists only accept items, so add a sibling item; elsewhere a paragraph.
			const fresh = isList
				? b.node.type.createAndFill()
				: state.schema.nodes.paragraph.createAndFill();
			if (!fresh) return;
			const at = b.pos + b.node.nodeSize;
			tr.insert(at, fresh);
			// First text position inside the new block.
			caret = at + (isList ? 2 : 1);
		}
		tr.setSelection(TextSelection.create(tr.doc, caret)).insertText('/').scrollIntoView();
		this.view.dispatch(tr);
		this.view.focus();
		this.hide();
	};
}

export const BlockGutter = Extension.create<BlockGutterOptions>({
	name: 'blockGutter',
	addOptions() {
		return { addLabel: 'Add a block below' };
	},
	addProseMirrorPlugins() {
		const opts = this.options;
		return [new Plugin({ key, view: (view) => new GutterView(view, opts) })];
	}
});
