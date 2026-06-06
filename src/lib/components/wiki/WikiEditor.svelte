<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';
	import Link from '@tiptap/extension-link';
	import TaskList from '@tiptap/extension-task-list';
	import TaskItem from '@tiptap/extension-task-item';
	import { SlashCommand } from './slash-command.svelte';
	import { m } from '$lib/paraglide/messages';
	import './wiki-editor.css';

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
		placeholder = m.wiki_editor_placeholder_commands(),
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
