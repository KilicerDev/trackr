<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	// Clamps its content to `maxHeight` px with a fade-out and a "Show more"
	// toggle. The toggle only appears when the content meaningfully overflows —
	// content within one extra line of the limit is shown in full instead of
	// hiding a single line behind a button.
	let {
		maxHeight = 240,
		children
	}: {
		maxHeight?: number;
		children: Snippet;
	} = $props();

	// Don't clamp for less than ~1.5 lines of hidden text.
	const SLACK = 36;

	let el = $state<HTMLDivElement>();
	let expanded = $state(false);
	let overflowing = $state(false);

	$effect(() => {
		if (!el) return;
		const node = el;
		const check = () => {
			overflowing = node.scrollHeight > maxHeight + SLACK;
		};
		check();
		const ro = new ResizeObserver(check);
		ro.observe(node);
		return () => ro.disconnect();
	});
</script>

<div
	bind:this={el}
	class="relative overflow-hidden"
	style:max-height={overflowing && !expanded ? `${maxHeight}px` : undefined}
>
	{@render children()}
	{#if overflowing && !expanded}
		<div
			class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface"
		></div>
	{/if}
</div>
{#if overflowing}
	<button
		type="button"
		onclick={() => (expanded = !expanded)}
		class="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-strong"
	>
		<span>{expanded ? m.chat_show_less() : m.chat_show_more()}</span>
		<span class="transition-transform {expanded ? 'rotate-180' : ''}">
			<Icon name="chevron" size={12} />
		</span>
	</button>
{/if}
