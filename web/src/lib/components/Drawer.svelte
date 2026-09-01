<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from './Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	interface Props {
		open: boolean;
		onclose: () => void;
		width?: number;
		children: Snippet;
		onfiles?: (files: File[]) => void;
		dropDisabled?: boolean;
		dropLabel?: string;
	}
	let {
		open,
		onclose,
		width = 460,
		children,
		onfiles,
		dropDisabled = false,
		dropLabel = m.attach_drop_files()
	}: Props = $props();

	let dragDepth = $state(0);
	const dragging = $derived(dragDepth > 0);

	function hasFiles(e: DragEvent): boolean {
		return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
	}

	function onDragEnter(e: DragEvent) {
		if (!onfiles || dropDisabled || !hasFiles(e)) return;
		e.preventDefault();
		dragDepth++;
	}

	function onDragOver(e: DragEvent) {
		if (!onfiles || dropDisabled || !hasFiles(e)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}

	function onDragLeave(e: DragEvent) {
		if (!onfiles || dropDisabled || !hasFiles(e)) return;
		dragDepth = Math.max(0, dragDepth - 1);
	}

	function onDrop(e: DragEvent) {
		dragDepth = 0;
		if (!onfiles || dropDisabled || !e.dataTransfer) return;
		e.preventDefault();
		const files = Array.from(e.dataTransfer.files);
		if (files.length) onfiles(files);
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open || e.key !== 'Escape') return;
		// A layer below already consumed this Escape (e.g. a composer's
		// suggestion dropdown closing itself) — the drawer keeps out of it.
		if (e.defaultPrevented) return;
		// Defer to any dialog/confirm/command-palette layered on top — they own
		// Escape and set their own role; closing the drawer too would be a
		// double-close. The drawer's own <aside> has no dialog role, so it won't
		// match itself here.
		if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
		onclose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<button
		type="button"
		aria-label="Close drawer"
		onclick={onclose}
		transition:fade={{ duration: 180 }}
		class="fixed inset-0 z-40 bg-black/40"
	></button>
	<aside
		transition:fly={{ x: width + 20, duration: 280, easing: cubicOut, opacity: 1 }}
		class="fixed top-0 right-0 bottom-0 z-50 flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden border-l border-border bg-bg-elev shadow-lg"
		style:width="{width}px"
		ondragenter={onDragEnter}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
	>
		{@render children()}
		{#if dragging}
			<div
				class="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-accent/8 backdrop-blur-[1px]"
				style:box-shadow="inset 0 0 0 2px var(--color-accent, #ef7a6d)"
			>
				<div
					class="flex flex-col items-center gap-2 rounded-xl border border-accent/40 bg-bg-elev px-4 py-3 text-accent shadow-lg"
				>
					<Icon name="paperclip" size={22} />
					<span class="text-[14px] font-medium">{dropLabel}</span>
				</div>
			</div>
		{/if}
	</aside>
{/if}
