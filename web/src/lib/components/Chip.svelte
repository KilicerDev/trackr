<script lang="ts">
	import type { Snippet } from 'svelte';
	interface Props {
		variant?: 'default' | 'filter' | 'add' | 'ghost';
		active?: boolean;
		onclick?: (e: MouseEvent) => void;
		onremove?: (e: MouseEvent) => void;
		children: Snippet;
	}
	let { variant = 'default', active = false, onclick, onremove, children }: Props = $props();
</script>

<div
	class="inline-flex items-stretch rounded-lg h-7 text-[12.5px] font-medium select-none transition-[background,border-color] duration-150
	{variant === 'filter'
		? 'border border-accent/40 bg-[var(--accent-soft)] text-text'
		: variant === 'add'
			? 'border border-dashed border-border bg-transparent text-text-3 hover:text-text hover:border-border-strong'
			: variant === 'ghost'
				? 'border border-transparent bg-transparent text-text-3 hover:bg-surface hover:text-text'
				: active
					? 'bg-surface-2 border border-border text-text'
					: 'bg-surface border border-border text-text hover:bg-surface-2'}"
>
	<button
		type="button"
		class="inline-flex items-center gap-1.5 px-2.5 cursor-pointer h-full {onremove ? 'pr-2' : ''}"
		{onclick}
	>
		{@render children()}
	</button>
	{#if onremove}
		<button
			type="button"
			onclick={onremove}
			class="grid place-items-center px-1.5 border-l border-border/60 hover:text-text text-text-3 transition-colors"
			aria-label="Remove"
		>
			<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
		</button>
	{/if}
</div>
