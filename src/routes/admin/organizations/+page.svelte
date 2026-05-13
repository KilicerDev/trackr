<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
</script>

<svelte:head><title>Trackr · Organizations</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Organizations' }]} />

<div class="flex-1 min-h-0 grid place-items-center">
	<EmptyState
		icon="org"
		title="Organizations"
		hint="Tenant-level configuration lives here once enterprise mode is enabled."
	/>
</div>
