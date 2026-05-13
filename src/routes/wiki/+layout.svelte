<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import WikiTree from '$lib/components/wiki/WikiTree.svelte';
	let { children } = $props();
</script>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Wiki' }]} />

<div class="flex flex-1 min-h-0 overflow-hidden">
	<WikiTree />
	<div class="flex-1 min-w-0 overflow-y-auto">
		{@render children()}
	</div>
</div>
