<script lang="ts">
	import PortalSidebar from './PortalSidebar.svelte';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="grid h-full overflow-hidden" style:grid-template-columns="var(--sidebar-w) 1fr">
	<PortalSidebar />
	<main class="flex flex-col min-w-0 min-h-0 bg-bg overflow-hidden">
		{@render children()}
	</main>
</div>
