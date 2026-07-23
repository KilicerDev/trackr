<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import { getSidebar } from '$lib/stores/sidebar.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Snippet } from 'svelte';

	// Mobile slide-over container for the shell sidebars. At ≥md it renders as
	// `display: contents`, so the sidebar stays a direct grid child and desktop
	// layout is untouched; below md it becomes a fixed left drawer. The sidebar
	// is never unmounted, so its state and scroll position survive viewport
	// changes and SSR renders the closed state (no hydration flash).
	let { children }: { children: Snippet } = $props();
	const sidebar = getSidebar()!;

	afterNavigate(() => sidebar.closeMobile());
	$effect(() => {
		if (sidebar.isDesktop) sidebar.closeMobile();
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !sidebar.mobileOpen) return;
		// Defer to any dialog stacked on top (same guard as Drawer.svelte).
		if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
		sidebar.closeMobile();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if sidebar.mobileOpen}
	<button
		type="button"
		aria-label={m.shell_close_menu()}
		onclick={() => sidebar.closeMobile()}
		transition:fade={{ duration: 180 }}
		class="fixed inset-0 z-40 bg-black/40 md:hidden"
	></button>
{/if}

<div
	class="max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:flex max-md:w-[280px] max-md:-translate-x-full max-md:overscroll-contain max-md:shadow-lg max-md:transition-transform max-md:duration-200 max-md:ease-out md:contents {sidebar.mobileOpen
		? 'max-md:translate-x-0'
		: ''}"
>
	{@render children()}
</div>
