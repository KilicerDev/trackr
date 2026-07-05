import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { mount, unmount } from 'svelte';
import SlashMenu, { type SlashItem } from './SlashMenu.svelte';
import { m } from '$lib/paraglide/messages';

type RunArgs = { editor: Editor; range: Range };

// Labels/hints are getters so they re-evaluate per active locale every time the
// menu reads them (item list build + per-item render).
const ITEMS: (SlashItem & { run: (args: RunArgs) => void })[] = [
	{
		id: 'h1',
		get label() {
			return m.wiki_slash_h1_label();
		},
		get hint() {
			return m.wiki_slash_h1_hint();
		},
		icon: 'H1',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
	},
	{
		id: 'h2',
		get label() {
			return m.wiki_slash_h2_label();
		},
		get hint() {
			return m.wiki_slash_h2_hint();
		},
		icon: 'H2',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
	},
	{
		id: 'h3',
		get label() {
			return m.wiki_slash_h3_label();
		},
		get hint() {
			return m.wiki_slash_h3_hint();
		},
		icon: 'H3',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
	},
	{
		id: 'p',
		get label() {
			return m.wiki_slash_text_label();
		},
		get hint() {
			return m.wiki_slash_text_hint();
		},
		icon: '¶',
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run()
	},
	{
		id: 'ul',
		get label() {
			return m.wiki_slash_ul_label();
		},
		get hint() {
			return m.wiki_slash_ul_hint();
		},
		icon: '•',
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run()
	},
	{
		id: 'ol',
		get label() {
			return m.wiki_slash_ol_label();
		},
		get hint() {
			return m.wiki_slash_ol_hint();
		},
		icon: '1.',
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run()
	},
	{
		id: 'task',
		get label() {
			return m.wiki_slash_task_label();
		},
		get hint() {
			return m.wiki_slash_task_hint();
		},
		icon: '☐',
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run()
	},
	{
		id: 'quote',
		get label() {
			return m.wiki_slash_quote_label();
		},
		get hint() {
			return m.wiki_slash_quote_hint();
		},
		icon: '“',
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setBlockquote().run()
	},
	{
		id: 'code',
		get label() {
			return m.wiki_slash_code_label();
		},
		get hint() {
			return m.wiki_slash_code_hint();
		},
		icon: '</>',
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCodeBlock().run()
	},
	{
		id: 'hr',
		get label() {
			return m.wiki_slash_hr_label();
		},
		get hint() {
			return m.wiki_slash_hr_hint();
		},
		icon: '—',
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run()
	},
	{
		id: 'image',
		get label() {
			return m.wiki_slash_image_label();
		},
		get hint() {
			return m.wiki_slash_image_hint();
		},
		icon: '🖼',
		run: ({ editor, range }) => {
			// Drop the "/image" text, then open the file picker (async upload +
			// insert is handled by the WikiImageUpload extension).
			editor.chain().focus().deleteRange(range).run();
			editor.commands.openWikiImagePicker();
		}
	}
];

type Props = SuggestionProps<(typeof ITEMS)[number]>;

export const SlashCommand = Extension.create({
	name: 'slashCommand',
	addProseMirrorPlugins() {
		return [
			Suggestion({
				editor: this.editor,
				char: '/',
				startOfLine: false,
				allowSpaces: false,

				items: ({ query }) => {
					const q = query.trim().toLowerCase();
					if (!q) return ITEMS;
					return ITEMS.filter(
						(i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)
					);
				},

				command: ({ editor, range, props }) => {
					props.run({ editor, range });
				},

				render: () => {
					let target: HTMLDivElement | null = null;
					let component: ReturnType<typeof mount> | null = null;
					// The Suggestion `props` — crucially `props.command`, which is bound to
					// the query range at the time it was created. It is refreshed on every
					// keystroke; `onSelect` must run the LATEST one, otherwise it deletes
					// only the range captured at onStart (just the "/") and leaves the query.
					let latestProps: Props | null = null;
					let state = $state<{
						items: typeof ITEMS;
						activeIndex: number;
						rect: { left: number; top: number; bottom: number };
						onSelect: (index: number) => void;
					}>({
						items: [],
						activeIndex: 0,
						rect: { left: 0, top: 0, bottom: 0 },
						onSelect: () => {}
					});

					function setRect(props: Props) {
						const r = props.clientRect?.();
						if (r) {
							// Clamp to viewport so menu doesn't escape on narrow screens.
							const menuHeight = 360;
							let top = r.top;
							let bottom = r.bottom;
							if (bottom + menuHeight + 10 > window.innerHeight) {
								// Flip above caret if not enough room below.
								bottom = r.top - menuHeight - 6;
								top = bottom;
							}
							state.rect = { left: r.left, top, bottom };
						}
					}

					return {
						onStart: (props: Props) => {
							latestProps = props;
							target = document.createElement('div');
							document.body.appendChild(target);
							state.items = props.items;
							state.activeIndex = 0;
							state.onSelect = (i) => {
								const it = state.items[i];
								if (it) latestProps?.command(it);
							};
							setRect(props);
							component = mount(SlashMenu, { target, props: { state } });
						},
						onUpdate: (props: Props) => {
							latestProps = props;
							state.items = props.items;
							state.activeIndex = 0;
							setRect(props);
						},
						onKeyDown: (props) => {
							const e = props.event;
							if (e.key === 'ArrowDown') {
								e.preventDefault();
								state.activeIndex = (state.activeIndex + 1) % Math.max(state.items.length, 1);
								return true;
							}
							if (e.key === 'ArrowUp') {
								e.preventDefault();
								state.activeIndex =
									(state.activeIndex - 1 + state.items.length) % Math.max(state.items.length, 1);
								return true;
							}
							if (e.key === 'Enter') {
								e.preventDefault();
								state.onSelect(state.activeIndex);
								return true;
							}
							if (e.key === 'Escape') {
								e.preventDefault();
								return true;
							}
							return false;
						},
						onExit: () => {
							if (component) {
								unmount(component);
								component = null;
							}
							target?.remove();
							target = null;
						}
					};
				}
			})
		];
	}
});
