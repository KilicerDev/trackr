<script lang="ts">
	// The one toolbar button that opens the ViewPanel. Turns accent-tinted
	// with a count badge while filters are hiding rows, so the strip still
	// tells you that what you see isn't everything.
	import Icon from '../Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		count: number;
		onclick: () => void;
	}
	let { open, count, onclick }: Props = $props();
</script>

<button
	type="button"
	{onclick}
	aria-expanded={open}
	class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[14px] whitespace-nowrap transition-colors {count >
	0
		? 'border-accent/40 bg-accent/10 hover:bg-accent/15'
		: open
			? 'border-border-strong bg-surface-2'
			: 'border-border bg-surface hover:bg-surface-2'}"
>
	<Icon name="sliders" size={14} class={count > 0 ? 'text-accent' : 'text-text-3'} />
	<span class="font-medium {count > 0 ? 'text-accent' : 'text-text'}">{m.tasks_filter()}</span>
	{#if count > 0}
		<span
			class="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 font-mono text-[11px] font-semibold text-white"
		>
			{count}
		</span>
	{/if}
</button>
