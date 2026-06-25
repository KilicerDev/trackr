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
		children: Snippet;
	}
	let { open, onclose, align = 'left', minWidth = 200, children }: Props = $props();
</script>

{#if open}
	<div
		use:clickOutside={onclose}
		in:fly={POPOVER_IN}
		class="absolute top-full z-50 mt-1.5 rounded-[10px] border border-border bg-bg-elev p-1.5 text-[13px]
		{align === 'right' ? 'right-0' : 'left-0'} shadow-lg"
		style:min-width="{minWidth}px"
	>
		{@render children()}
	</div>
{/if}
