<script lang="ts">
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import ImpersonationBanner from '$lib/components/shell/ImpersonationBanner.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<div class="flex flex-col h-screen overflow-hidden">
	{#if data.impersonator}
		<ImpersonationBanner
			targetName={data.user?.name ?? null}
			targetEmail={data.user?.email ?? ''}
			impersonatorName={data.impersonator.name}
			impersonatorEmail={data.impersonator.email}
		/>
	{/if}
	<div class="flex-1 min-h-0">
		<AppShell>
			{@render children()}
		</AppShell>
	</div>
</div>
