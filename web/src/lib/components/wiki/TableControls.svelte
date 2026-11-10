<script lang="ts">
	// Floating row/column controls for the table the caret is in (notes + wiki
	// editor). Positioned above that table inside the editor's wrapper, so it
	// scrolls with the document. Rendered only while the selection is in a table.
	import type { Editor } from '@tiptap/core';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		editor: Editor;
		/** Table position relative to the wrapper the bar is placed in. */
		top: number;
		left: number;
	}
	let { editor, top, left }: Props = $props();

	type Action = { id: string; label: () => string; run: () => boolean; danger?: boolean };
	const ACTIONS: Action[] = [
		{
			id: 'row',
			label: m.editor_table_add_row,
			run: () => editor.chain().focus().addRowAfter().run()
		},
		{
			id: 'col',
			label: m.editor_table_add_column,
			run: () => editor.chain().focus().addColumnAfter().run()
		},
		{
			id: 'header',
			label: m.editor_table_toggle_header,
			run: () => editor.chain().focus().toggleHeaderRow().run()
		},
		{
			id: 'del-row',
			label: m.editor_table_delete_row,
			run: () => editor.chain().focus().deleteRow().run()
		},
		{
			id: 'del-col',
			label: m.editor_table_delete_column,
			run: () => editor.chain().focus().deleteColumn().run()
		},
		{
			id: 'del-table',
			label: m.editor_table_delete,
			run: () => editor.chain().focus().deleteTable().run(),
			danger: true
		}
	];
</script>

<div
	role="toolbar"
	aria-label={m.editor_table_controls()}
	class="absolute z-20 flex items-center gap-0.5 rounded-lg border border-border bg-bg-elev p-0.5 text-[12px] shadow-lg"
	style:top="{top}px"
	style:left="{left}px"
>
	{#each ACTIONS as a (a.id)}
		{#if a.danger}<span class="mx-0.5 h-4 w-px bg-border"></span>{/if}
		<button
			type="button"
			onmousedown={(e) => e.preventDefault()}
			onclick={a.run}
			class="rounded-md px-2 py-1 whitespace-nowrap transition-colors {a.danger
				? 'text-prio-urgent hover:bg-prio-urgent/10'
				: 'text-text-2 hover:bg-surface-2 hover:text-text'}"
		>
			{a.label()}
		</button>
	{/each}
</div>
