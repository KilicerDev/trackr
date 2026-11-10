<script lang="ts">
	// Section title in the task/ticket panel: a small muted label (the same
	// tone as the property labels) so the content under it reads as the
	// brighter, primary text; a fainter count; an optional icon action.
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		count?: number | string | null;
		action?: Snippet;
	}
	let { label, count = null, action }: Props = $props();
</script>

<div class="mb-2 flex min-h-7 items-center gap-2">
	<h3 class="text-[12px] font-medium text-text-3">
		{label}{#if count !== null && count !== 0 && count !== ''}<span
				class="ml-1.5 font-mono text-[12px] font-normal text-text-4">{count}</span
			>{/if}
	</h3>
	{#if action}
		<div class="relative ml-auto">{@render action()}</div>
	{/if}
</div>
