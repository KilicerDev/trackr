<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Sidebar from './Sidebar.svelte';
	import SidebarDrawer from './SidebarDrawer.svelte';
	import { setSidebar } from '$lib/stores/sidebar.svelte';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();

	// Seed from the server-persisted preference so SSR renders the right width
	// immediately (no flash). Provided to descendants (Sidebar, Topbar) via context.
	const initialCollapsed = !!(
		page.data?.preferences as { viewState?: { shell?: { collapsed?: boolean } } } | undefined
	)?.viewState?.shell?.collapsed;
	const sidebar = setSidebar(initialCollapsed);
	onMount(() => sidebar.hydrate());

	const width = $derived(sidebar.collapsed ? '64px' : '260px');
</script>

<div
	class="grid h-full grid-cols-1 overflow-hidden md:grid-cols-[var(--sidebar-w)_1fr]"
	class:shell-animate={sidebar.animate}
	style:--sidebar-w={width}
>
	<SidebarDrawer>
		<Sidebar />
	</SidebarDrawer>
	<main class="flex min-h-0 min-w-0 flex-col overflow-hidden bg-bg">
		{@render children()}
	</main>
</div>

<style>
	/* Smoothly interpolate the rail width on toggle. */
	.shell-animate {
		transition: grid-template-columns 220ms cubic-bezier(0.4, 0, 0.2, 1);
	}
</style>
