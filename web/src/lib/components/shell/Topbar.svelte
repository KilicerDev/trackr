<script lang="ts">
	// The page's own slim header row, for pages without a view toolbar (the
	// list pages start with their toolbar instead). Mobile menu, an optional
	// back button (detail pages), then where you are: the title, after its
	// ancestors when it's nested (notes, directory). It matches the toolbar
	// rows (px-5 py-2.5, 28px controls), so every page opens with one bar of
	// the same height.
	import Icon from '../Icon.svelte';
	import MobileMenuButton from './MobileMenuButton.svelte';
	import type { Snippet } from 'svelte';

	interface Crumb {
		label: string;
		href?: string;
	}
	interface Props {
		crumbs: Crumb[];
		actions?: Snippet;
		/** A back button before the title (detail pages). */
		back?: { href: string; label: string };
	}
	let { crumbs, actions, back }: Props = $props();
</script>

<header class="flex shrink-0 items-center gap-2 border-b border-border bg-bg px-5 py-2.5">
	<MobileMenuButton />
	{#if back}
		<a
			href={back.href}
			title={back.label}
			aria-label={back.label}
			class="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-surface text-text-2 transition-colors hover:border-border-strong hover:bg-surface-2 hover:text-text"
		>
			<Icon name="arrow-left" size={15} />
		</a>
	{/if}
	<!-- Narrow screens keep the title and its parent (the way back). -->
	<div
		class="flex h-7 min-w-0 items-center gap-2 overflow-hidden text-[14px] whitespace-nowrap {back
			? 'ml-1'
			: ''}"
	>
		{#each crumbs as c, i (`${i}:${c.label}`)}
			{@const last = crumbs.length - 1}
			{@const trail = i >= last - 1 ? '' : 'max-md:hidden'}
			{#if i > 0}<span class="text-text-4 {i === last ? '' : 'max-md:hidden'}">/</span>{/if}
			{#if c.href}
				<a href={c.href} class="shrink-0 text-text-3 hover:text-text {trail}">{c.label}</a>
			{:else}
				<span class="min-w-0 truncate font-medium text-text {trail}">{c.label}</span>
			{/if}
		{/each}
	</div>
	{#if actions}
		<div class="ml-auto flex items-center gap-2">{@render actions()}</div>
	{/if}
</header>
