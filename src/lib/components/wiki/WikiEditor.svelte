<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';
	import Link from '@tiptap/extension-link';
	import TaskList from '@tiptap/extension-task-list';
	import TaskItem from '@tiptap/extension-task-item';
	import { SlashCommand } from './slash-command.svelte';

	interface Props {
		content: string;
		editable?: boolean;
		placeholder?: string;
		onUpdate?: (html: string) => void;
		onReady?: (editor: Editor) => void;
	}
	let {
		content,
		editable = false,
		placeholder = "Type '/' for commands…",
		onUpdate,
		onReady
	}: Props = $props();

	let host: HTMLDivElement | undefined = $state();
	let editor: Editor | undefined;
	let lastSeenContent = content;

	onMount(() => {
		if (!host) return;
		editor = new Editor({
			element: host,
			editable,
			content,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] }
				}),
				Placeholder.configure({ placeholder }),
				Link.configure({
					openOnClick: !editable,
					autolink: true,
					HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
				}),
				TaskList,
				TaskItem.configure({ nested: true }),
				SlashCommand
			],
			onUpdate: ({ editor }) => {
				const html = editor.getHTML();
				lastSeenContent = html;
				onUpdate?.(html);
			}
		});
		onReady?.(editor);
	});

	onDestroy(() => {
		editor?.destroy();
		editor = undefined;
	});

	$effect(() => {
		if (!editor) return;
		if (editor.isEditable !== editable) editor.setEditable(editable);
	});

	$effect(() => {
		if (!editor) return;
		// Only push external content changes (e.g. cancelled edit, route nav)
		// — never replace what the user is currently typing.
		if (content !== lastSeenContent) {
			lastSeenContent = content;
			editor.commands.setContent(content || '<p></p>', { emitUpdate: false });
		}
	});
</script>

<div bind:this={host} class="wiki-editor"></div>

<style>
	:global(.wiki-editor) {
		color: var(--text-2);
		font-size: 14.5px;
		line-height: 1.7;
	}
	:global(.wiki-editor .ProseMirror) {
		outline: none;
		min-height: 200px;
	}
	:global(.wiki-editor .ProseMirror > * + *) {
		margin-top: 0.6em;
	}
	:global(.wiki-editor .ProseMirror h1) {
		font-size: 26px;
		font-weight: 600;
		letter-spacing: -0.012em;
		color: var(--text);
		margin: 1.2em 0 0.4em;
		line-height: 1.25;
	}
	:global(.wiki-editor .ProseMirror h1:first-child) {
		margin-top: 0;
	}
	:global(.wiki-editor .ProseMirror h2) {
		font-size: 19px;
		font-weight: 600;
		letter-spacing: -0.008em;
		color: var(--text);
		margin: 1.1em 0 0.35em;
		line-height: 1.3;
	}
	:global(.wiki-editor .ProseMirror h3) {
		font-size: 16px;
		font-weight: 600;
		color: var(--text);
		margin: 1em 0 0.3em;
	}
	:global(.wiki-editor .ProseMirror p) {
		margin: 0.4em 0;
	}
	:global(.wiki-editor .ProseMirror ul) {
		padding-left: 1.4em;
		margin: 0.4em 0;
		list-style-type: disc;
	}
	:global(.wiki-editor .ProseMirror ol) {
		padding-left: 1.4em;
		margin: 0.4em 0;
		list-style-type: decimal;
	}
	:global(.wiki-editor .ProseMirror li) {
		margin: 0.15em 0;
	}
	:global(.wiki-editor .ProseMirror li > p) {
		margin: 0;
	}
	:global(.wiki-editor .ProseMirror ul li::marker, .wiki-editor .ProseMirror ol li::marker) {
		color: var(--text-4);
	}
	:global(.wiki-editor ul[data-type='taskList']) {
		list-style: none !important;
		padding-left: 0.2em;
	}
	:global(.wiki-editor ul[data-type='taskList'] li) {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		margin: 0.15em 0;
	}
	:global(.wiki-editor ul[data-type='taskList'] li > label) {
		flex: 0 0 auto;
		margin: 0;
		user-select: none;
		display: inline-flex;
		align-items: center;
		/* Match text line height so the checkbox vertically centers with the first text line. */
		height: 1.7em;
	}
	:global(.wiki-editor ul[data-type='taskList'] li > div) {
		flex: 1 1 auto;
		min-width: 0;
	}
	:global(.wiki-editor ul[data-type='taskList'] li > div > p) {
		margin: 0;
	}
	:global(.wiki-editor ul[data-type='taskList'] li[data-checked='true'] > div) {
		color: var(--text-4);
		text-decoration: line-through;
	}
	:global(.wiki-editor input[type='checkbox']) {
		-webkit-appearance: none !important;
		appearance: none !important;
		width: 15px;
		height: 15px;
		margin: 0;
		padding: 0;
		border: 1.5px solid var(--border-strong);
		border-radius: 4px;
		background: var(--surface);
		cursor: pointer;
		position: relative;
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	:global(.wiki-editor input[type='checkbox']:hover) {
		border-color: var(--text-3);
	}
	:global(.wiki-editor input[type='checkbox']:checked) {
		background-color: var(--accent);
		border-color: var(--accent);
		background-image: url("data:image/svg+xml;utf8,<svg viewBox='0 0 14 14' xmlns='http://www.w3.org/2000/svg'><path d='M3 7.5l2.8 2.8L11 5' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>");
		background-repeat: no-repeat;
		background-position: center;
		background-size: 11px 11px;
	}
	:global(.wiki-editor .ProseMirror a) {
		color: var(--accent);
		text-decoration: underline;
		text-decoration-color: color-mix(in oklab, var(--accent) 35%, transparent);
		text-underline-offset: 3px;
		cursor: pointer;
	}
	:global(.wiki-editor .ProseMirror a:hover) {
		text-decoration-color: var(--accent);
	}
	:global(.wiki-editor .ProseMirror code) {
		background: var(--surface);
		border: 1px solid var(--border);
		padding: 1px 5px;
		border-radius: 5px;
		font-size: 12.5px;
		font-family: var(--font-mono);
	}
	:global(.wiki-editor .ProseMirror pre) {
		background: var(--surface);
		border: 1px solid var(--border);
		padding: 12px 14px;
		border-radius: 10px;
		overflow-x: auto;
		margin: 0.7em 0;
	}
	:global(.wiki-editor .ProseMirror pre code) {
		background: transparent;
		border: 0;
		padding: 0;
		font-size: 12.5px;
		color: var(--text);
	}
	:global(.wiki-editor .ProseMirror blockquote) {
		border-left: 3px solid var(--border-strong);
		padding-left: 12px;
		color: var(--text-3);
		margin: 0.7em 0;
	}
	:global(.wiki-editor .ProseMirror hr) {
		border: 0;
		border-top: 1px solid var(--border);
		margin: 1.4em 0;
	}
	:global(.wiki-editor .ProseMirror p.is-editor-empty:first-child::before) {
		color: var(--text-4);
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
	}
</style>
