<script lang="ts">
	// Section title in the task panel: a plain label, a muted count and an
	// optional icon action on the right.
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		count?: number | string | null;
		action?: Snippet;
	}
	let { label, count = null, action }: Props = $props();
</script>

<div class="mb-1.5 flex min-h-7 items-center gap-2">
	<h3 class="text-[13px] font-medium text-text-2">
		{label}{#if count !== null && count !== 0 && count !== ''}<span
				class="ml-1.5 font-mono text-[12px] font-normal text-text-4">{count}</span
			>{/if}
	</h3>
	{#if action}
		<div class="relative ml-auto">{@render action()}</div>
	{/if}
</div>
