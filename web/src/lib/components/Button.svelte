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
	class="inline-flex items-center gap-1.5 rounded-lg font-medium text-[13px] transition-[background,border-color,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px]
	{size === 'sm' ? 'px-2 py-1' : 'px-[11px] py-[7px]'}
	{variant === 'primary'
		? 'bg-accent text-white border border-transparent hover:bg-accent-strong shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_4px_12px_rgba(239,122,109,0.25)]'
		: variant === 'ghost'
			? 'bg-transparent text-text-2 hover:bg-surface hover:text-text border border-transparent'
			: 'bg-surface text-text border border-border hover:bg-surface-2'}
	{cls}"
>
	{@render children()}
</button>
