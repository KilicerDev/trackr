<script lang="ts">
	import type { WikiBlock } from '$lib/types';
	interface Props {
		block: WikiBlock;
	}
	let { block }: Props = $props();
</script>

{#if block.kind === 'h1'}
	<h1 class="text-[28px] font-semibold tracking-[-0.012em] text-text mt-7 mb-3 first:mt-0">{block.text}</h1>
{:else if block.kind === 'h2'}
	<h2 class="text-[19px] font-semibold tracking-[-0.008em] text-text mt-6 mb-2.5">{block.text}</h2>
{:else if block.kind === 'p'}
	<p class="text-[14px] leading-[1.65] text-text-2 mb-3">{block.text}</p>
{:else if block.kind === 'list'}
	<ul class="my-3 pl-5 space-y-1.5">
		{#each block.items as item (item)}
			<li class="text-[14px] leading-[1.65] text-text-2 marker:text-text-4">{item}</li>
		{/each}
	</ul>
{:else if block.kind === 'callout'}
	{@const color = block.tone === 'warn' ? '#e9c46a' : '#7a9cf0'}
	<div
		class="flex items-start gap-3 my-4 p-3 rounded-xl border"
		style:border-color={color + '50'}
		style:background={color + '10'}
	>
		<span
			class="w-5 h-5 rounded-full grid place-items-center text-[12px] font-semibold text-white shrink-0 mt-0.5"
			style:background={color}
		>
			{block.tone === 'warn' ? '!' : 'i'}
		</span>
		<p class="text-[13.5px] leading-relaxed text-text-2">{block.text}</p>
	</div>
{/if}
