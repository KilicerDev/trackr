<script lang="ts">
	// Section heading for a shell rail. Expanded: the label in a 34px slot.
	// Folded: just a short hairline in a 16px slot, so sections stay visibly
	// apart without the tall empty gap a hidden label would leave (the first
	// section's line also sets the nav apart from the notifications row).
	import type { Rail } from './rail.svelte';
	let { rail, label }: { rail: Rail; label: string } = $props();
</script>

<div
	class="relative flex items-end px-3 text-[12px] leading-[18px] font-medium text-text-4 transition-[height,padding] duration-200 {rail.rail
		? 'h-4 pb-0'
		: 'h-[34px] pb-1.5'}"
>
	<span class={rail.fade}>{label}</span>
	<span
		class="absolute inset-x-3 top-1/2 border-t border-border transition-opacity duration-150 {rail.rail
			? 'opacity-100'
			: 'opacity-0'}"
		aria-hidden="true"
	></span>
</div>
