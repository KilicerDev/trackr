<script lang="ts">
	import type { WikiBlock } from '$lib/types';
	interface Props {
		block: WikiBlock;
	}
	let { block }: Props = $props();
</script>

{#if block.kind === 'h1'}
	<h1 class="mt-7 mb-3 text-[35px] font-semibold tracking-[-0.012em] text-text first:mt-0">
		{block.text}
	</h1>
{:else if block.kind === 'h2'}
	<h2 class="mt-6 mb-2.5 text-[22px] font-semibold tracking-[-0.008em] text-text">{block.text}</h2>
{:else if block.kind === 'p'}
	<p class="mb-3 text-[15px] leading-[1.65] text-text-2">{block.text}</p>
{:else if block.kind === 'list'}
	<ul class="my-3 space-y-1.5 pl-5">
		{#each block.items as item (item)}
			<li class="text-[15px] leading-[1.65] text-text-2 marker:text-text-4">{item}</li>
		{/each}
	</ul>
{:else if block.kind === 'callout'}
	{@const color = block.tone === 'warn' ? '#e9c46a' : '#7a9cf0'}
	<div
		class="my-4 flex items-start gap-3 rounded-xl border p-3"
		style:border-color={color + '50'}
		style:background={color + '10'}
	>
		<span
			class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white"
			style:background={color}
		>
			{block.tone === 'warn' ? '!' : 'i'}
		</span>
		<p class="text-[14px] leading-relaxed text-text-2">{block.text}</p>
	</div>
{/if}
