<script lang="ts">
	import type { Snippet } from 'svelte';
	interface Props {
		onclick?: (e: MouseEvent) => void;
		dot?: boolean;
		size?: number;
		ariaLabel?: string;
		children: Snippet;
		class?: string;
	}
	let { onclick, dot = false, size = 32, ariaLabel, children, class: cls = '' }: Props = $props();
</script>

<button
	type="button"
	{onclick}
	aria-label={ariaLabel}
	class="relative grid place-items-center rounded-lg border border-transparent bg-transparent text-text-2 transition-[background,color,border-color] duration-150 hover:bg-surface hover:text-text hover:border-border {cls}"
	style:width="{size}px"
	style:height="{size}px"
>
	{@render children()}
	{#if dot}
		<span
			class="absolute top-[6px] right-[6px] w-[7px] h-[7px] rounded-full bg-accent"
			style:box-shadow="0 0 0 2px var(--bg)"
		></span>
	{/if}
</button>
