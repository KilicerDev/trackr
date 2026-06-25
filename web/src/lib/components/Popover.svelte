<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import type { Snippet } from 'svelte';
	interface Props {
		open: boolean;
		onclose: () => void;
		align?: 'left' | 'right';
		minWidth?: number;
		// Open upward (for triggers near the bottom of the viewport).
		dropUp?: boolean;
		children: Snippet;
	}
	let { open, onclose, align = 'left', minWidth = 200, dropUp = false, children }: Props = $props();
</script>

{#if open}
	<div
		use:clickOutside={onclose}
		in:fly={POPOVER_IN}
		class="absolute z-50 rounded-[10px] border border-border bg-bg-elev p-1.5 text-[13px] shadow-lg
		{dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}
		{align === 'right' ? 'right-0' : 'left-0'}"
		style:min-width="{minWidth}px"
	>
		{@render children()}
	</div>
{/if}
