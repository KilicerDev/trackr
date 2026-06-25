<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	interface Props {
		open: boolean;
		onclose: () => void;
		width?: number;
		children: Snippet;
	}
	let { open, onclose, width = 460, children }: Props = $props();

	function onKeydown(e: KeyboardEvent) {
		if (!open || e.key !== 'Escape') return;
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
		class="fixed top-0 right-0 bottom-0 z-50 flex flex-col overflow-hidden border-l border-border bg-bg-elev shadow-lg"
		style:width="{width}px"
	>
		{@render children()}
	</aside>
{/if}
