<script lang="ts">
	import PortalSidebar from './PortalSidebar.svelte';
	import SidebarDrawer from './SidebarDrawer.svelte';
	import { setSidebar } from '$lib/stores/sidebar.svelte';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();

	// Provide the shared shell state so the Topbar's toggle lights up for
	// portal users too. The portal rail has no collapse mode (collapsible:
	// false) — only the mobile drawer applies.
	setSidebar(false, false);
</script>

<div class="grid h-full grid-cols-1 overflow-hidden md:grid-cols-[var(--sidebar-w)_1fr]">
	<SidebarDrawer>
		<PortalSidebar />
	</SidebarDrawer>
	<main class="flex min-h-0 min-w-0 flex-col overflow-hidden bg-bg">
		{@render children()}
	</main>
</div>
