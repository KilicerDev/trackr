<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../Icon.svelte';

	interface Props {
		/** Called with the dropped files. The parent decides what to stage. */
		onfiles: (files: File[]) => void;
		children: Snippet;
		disabled?: boolean;
		label?: string;
	}

	let { onfiles, children, disabled = false, label = 'Drop files to attach' }: Props = $props();

	// dragenter/dragleave fire for every descendant the pointer crosses, so a
	// naive boolean flickers. Counting enters minus leaves tracks "is the pointer
	// anywhere inside" robustly.
	let dragDepth = $state(0);
	const dragging = $derived(dragDepth > 0);

	function hasFiles(e: DragEvent): boolean {
		return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
	}

	function onDragEnter(e: DragEvent) {
		if (disabled || !hasFiles(e)) return;
		e.preventDefault();
		dragDepth++;
	}

	function onDragOver(e: DragEvent) {
		if (disabled || !hasFiles(e)) return;
		// Required for the drop event to fire.
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}

	function onDragLeave(e: DragEvent) {
		if (disabled || !hasFiles(e)) return;
		dragDepth = Math.max(0, dragDepth - 1);
	}

	function onDrop(e: DragEvent) {
		dragDepth = 0;
		if (disabled || !e.dataTransfer) return;
		e.preventDefault();
		const files = Array.from(e.dataTransfer.files);
		if (files.length) onfiles(files);
	}
</script>

<div
	class="relative"
	role="presentation"
	ondragenter={onDragEnter}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
>
	{@render children()}

	{#if dragging}
		<div
			class="absolute inset-0 z-50 grid place-items-center rounded-2xl bg-accent/8 backdrop-blur-[1px] pointer-events-none"
			style:box-shadow="inset 0 0 0 2px var(--color-accent, #ef7a6d)"
		>
			<div
				class="flex flex-col items-center gap-2 px-4 py-3 rounded-xl bg-bg-elev border border-accent/40 text-accent"
				style:box-shadow="var(--shadow-lg)"
			>
				<Icon name="paperclip" size={20} />
				<span class="text-[13px] font-medium">{label}</span>
			</div>
		</div>
	{/if}
</div>
