<script lang="ts">
	// Section title in the task panel: label, optional count, optional action
	// on the right (always rendered with SECTION_ACTION).
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		count?: number | string | null;
		action?: Snippet;
	}
	let { label, count = null, action }: Props = $props();
</script>

<div class="mb-2.5 flex min-h-7 items-center gap-2">
	<h3 class="text-[12px] font-medium tracking-[0.08em] text-text-4 uppercase">
		{label}{#if count !== null && count !== 0 && count !== ''}<span
				class="ml-1.5 font-mono tracking-normal text-text-3">{count}</span
			>{/if}
	</h3>
	{#if action}
		<div class="relative ml-auto">{@render action()}</div>
	{/if}
</div>
