<script lang="ts">
	import type { Snippet } from 'svelte';
	interface Props {
		variant?: 'default' | 'primary' | 'ghost';
		size?: 'sm' | 'md';
		type?: 'button' | 'submit';
		disabled?: boolean;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
		class?: string;
	}
	let {
		variant = 'default',
		size = 'md',
		type = 'button',
		disabled = false,
		onclick,
		children,
		class: cls = ''
	}: Props = $props();
</script>

<button
	{type}
	{disabled}
	{onclick}
	class="inline-flex items-center gap-1.5 rounded-lg text-[14px] font-medium whitespace-nowrap transition-[background,border-color,transform] duration-150 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50
	{size === 'sm' ? 'px-2 py-1' : 'px-[12px] py-[8px]'}
	{variant === 'primary'
		? 'border border-transparent bg-accent text-white shadow-btn hover:bg-accent-strong'
		: variant === 'ghost'
			? 'border border-transparent bg-transparent text-text-2 hover:bg-surface hover:text-text'
			: 'border border-border bg-surface text-text hover:bg-surface-2'}
	{cls}"
>
	{@render children()}
</button>
