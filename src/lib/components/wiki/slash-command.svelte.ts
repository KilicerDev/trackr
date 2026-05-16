import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { mount, unmount } from 'svelte';
import SlashMenu, { type SlashItem } from './SlashMenu.svelte';

type RunArgs = { editor: Editor; range: Range };

const ITEMS: (SlashItem & { run: (args: RunArgs) => void })[] = [
	{
		id: 'h1',
		label: 'Heading 1',
		hint: 'Big section heading',
		icon: 'H1',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
	},
	{
		id: 'h2',
		label: 'Heading 2',
		hint: 'Medium section heading',
		icon: 'H2',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
	},
	{
		id: 'h3',
		label: 'Heading 3',
		hint: 'Small section heading',
		icon: 'H3',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
	},
	{
		id: 'p',
		label: 'Text',
		hint: 'Plain paragraph',
		icon: '¶',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setParagraph().run()
	},
	{
		id: 'ul',
		label: 'Bullet list',
		hint: 'Simple bulleted list',
		icon: '•',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleBulletList().run()
	},
	{
		id: 'ol',
		label: 'Numbered list',
		hint: 'Ordered list',
		icon: '1.',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleOrderedList().run()
	},
	{
		id: 'task',
		label: 'To-do list',
		hint: 'Track tasks with checkboxes',
		icon: '☐',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleTaskList().run()
	},
	{
		id: 'quote',
		label: 'Quote',
		hint: 'Set apart a block of text',
		icon: '“',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setBlockquote().run()
	},
	{
		id: 'code',
		label: 'Code block',
		hint: 'Multi-line code with monospace',
		icon: '</>',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setCodeBlock().run()
	},
	{
		id: 'hr',
		label: 'Divider',
		hint: 'Horizontal rule',
		icon: '—',
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setHorizontalRule().run()
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
							target = document.createElement('div');
							document.body.appendChild(target);
							state.items = props.items;
							state.activeIndex = 0;
							state.onSelect = (i) => {
								const it = state.items[i];
								if (it) props.command(it);
							};
							setRect(props);
							component = mount(SlashMenu, { target, props: { state } });
						},
						onUpdate: (props: Props) => {
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
