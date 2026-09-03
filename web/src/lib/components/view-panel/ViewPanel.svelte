<script lang="ts">
	// Right-hand "view options" sheet shared by the tasks / tickets / projects
	// toolbars. Holds everything that used to be a chip in the toolbar strip
	// (group, subgroup, sort, time window, filters) as a stack of cards, so the
	// strip itself stays short: saved views, layout toggle, one Filter button,
	// search, and the primary action.
	//
	// Non-modal on purpose: the page behind stays live so filter and sort
	// changes are visible immediately. Any click outside closes it, and so
	// does Escape (unless a dialog above owns the key). It sits at z-40 so an
	// Inspector drawer opened from a row still layers above it.
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		onclose: () => void;
		title: string;
		// Active filter count shown next to the title; 0 hides the badge.
		count?: number;
		children: Snippet;
	}
	let { open, onclose, title, count = 0, children }: Props = $props();

	const WIDTH = 352;

	function onKeydown(e: KeyboardEvent) {
		if (!open || e.key !== 'Escape') return;
		if (e.defaultPrevented) return;
		if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
		onclose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<aside
		use:clickOutside={onclose}
		transition:fly={{ x: WIDTH + 24, duration: 260, easing: cubicOut, opacity: 1 }}
		aria-label={title}
		class="fixed top-0 right-0 bottom-0 z-40 flex max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-bg-elev shadow-lg"
		style:width="{WIDTH}px"
	>
		<div class="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-4">
			<span class="text-text-3"><Icon name="sliders" size={15} /></span>
			<h2 class="text-[15px] font-semibold text-text">{title}</h2>
			{#if count > 0}
				<span
					class="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 font-mono text-[11px] font-semibold text-white"
				>
					{count}
				</span>
			{/if}
			<div class="ml-auto">
				<IconButton size={31} ariaLabel={m.common_close()} onclick={onclose}>
					<Icon name="x" size={15} />
				</IconButton>
			</div>
		</div>
		<div class="panel-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
			{@render children()}
		</div>
	</aside>
{/if}

<style>
	.panel-scroll {
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}
</style>
