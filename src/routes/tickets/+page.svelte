<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
</script>

<svelte:head><title>Trackr · Support Tickets</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Support Tickets' }]} />

<div class="flex-1 min-h-0 grid place-items-center">
	<EmptyState
		icon="ticket"
		title="Support tickets coming soon"
		hint="External customer-facing inbox. Wire up your help-desk integration to populate it."
	/>
</div>
