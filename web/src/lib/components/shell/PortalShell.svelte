<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PortalSidebar from './PortalSidebar.svelte';
	import SidebarDrawer from './SidebarDrawer.svelte';
	import { setSidebar } from '$lib/stores/sidebar.svelte';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();

	// Same collapse mechanics as AppShell: seeded from the server-persisted
	// preference so SSR renders the right width (no flash), shared with the
	// Topbar toggle via context. The portal rail is wider than the app one.
	const initialCollapsed = !!(
		page.data?.preferences as { viewState?: { shell?: { collapsed?: boolean } } } | undefined
	)?.viewState?.shell?.collapsed;
	const sidebar = setSidebar(initialCollapsed);
	onMount(() => sidebar.hydrate());

	const width = $derived(sidebar.collapsed ? '64px' : '286px');
</script>

<div
	class="grid h-full grid-cols-1 overflow-hidden md:grid-cols-[var(--sidebar-w)_1fr]"
	class:shell-animate={sidebar.animate}
	style:--sidebar-w={width}
>
	<SidebarDrawer>
		<PortalSidebar />
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
