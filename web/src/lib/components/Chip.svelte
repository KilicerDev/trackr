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
	class="inline-flex h-7 items-stretch rounded-lg text-[12.5px] font-medium transition-[background,border-color] duration-150 select-none
	{variant === 'filter'
		? 'border border-accent/40 bg-[var(--accent-soft)] text-text'
		: variant === 'add'
			? 'border border-dashed border-border bg-transparent text-text-3 hover:border-border-strong hover:text-text'
			: variant === 'ghost'
				? 'border border-transparent bg-transparent text-text-3 hover:bg-surface hover:text-text'
				: active
					? 'border border-border bg-surface-2 text-text'
					: 'border border-border bg-surface text-text hover:bg-surface-2'}"
>
	<button
		type="button"
		class="inline-flex h-full cursor-pointer items-center gap-1.5 px-2.5 {onremove ? 'pr-2' : ''}"
		{onclick}
	>
		{@render children()}
	</button>
	{#if onremove}
		<button
			type="button"
			onclick={onremove}
			class="grid place-items-center border-l border-border/60 px-1.5 text-text-3 transition-colors hover:text-text"
			aria-label="Remove"
		>
			<svg
				width="11"
				height="11"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"><path d="M6 6l12 12M18 6 6 18" /></svg
			>
		</button>
	{/if}
</div>
