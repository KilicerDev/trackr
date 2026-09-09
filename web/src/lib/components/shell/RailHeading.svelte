<script lang="ts">
	// Section heading for a shell rail. Fixed height in every state and only
	// the text fades, so the rows below never shift when the rail folds or
	// peeks. Folded, `divider` shows a hairline in the same slot instead.
	import type { Rail } from './rail.svelte';
	let { rail, label, divider = false }: { rail: Rail; label: string; divider?: boolean } = $props();
</script>

<div
	class="relative flex h-[34px] items-end px-3 pb-1.5 text-[12px] leading-[18px] font-medium tracking-[0.08em] text-text-4 uppercase"
>
	<span class={rail.fade}>{label}</span>
	{#if divider}
		<span
			class="absolute inset-x-2 top-1/2 border-t border-border transition-opacity duration-150 {rail.rail
				? 'opacity-100'
				: 'opacity-0'}"
		></span>
	{/if}
</div>
