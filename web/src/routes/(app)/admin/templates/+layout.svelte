<script lang="ts">
	import { brandName } from '$lib/brand';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import { m } from '$lib/paraglide/messages';

	let { children } = $props();
</script>

<Topbar
	crumbs={[
		{ label: m.admin_crumb_workspace({ brand: brandName() }), href: '/tasks' },
		{ label: m.templates_title() }
	]}
/>

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="px-6 py-6">
		{@render children?.()}
	</div>
</div>
