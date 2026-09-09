<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import type { Snippet } from 'svelte';
	interface Props {
		open: boolean;
		onclose: () => void;
		align?: 'left' | 'right';
		minWidth?: number;
		maxWidth?: number;
		// Open upward (for triggers near the bottom of the viewport).
		dropUp?: boolean;
		children: Snippet;
	}
	let {
		open,
		onclose,
		align = 'left',
		minWidth = 200,
		maxWidth,
		dropUp = false,
		children
	}: Props = $props();

	// Keep the panel inside the viewport: a right-aligned popover under a
	// topbar button would otherwise run off the left edge on narrow screens.
	// Nudges via the anchoring offset (not transform, which the fly-in owns).
	const EDGE = 8;
	function keepOnScreen(node: HTMLElement) {
		function place() {
			node.style.left = '';
			node.style.right = '';
			const r = node.getBoundingClientRect();
			let dx = 0;
			if (r.left < EDGE) dx = EDGE - r.left;
			else if (r.right > window.innerWidth - EDGE) dx = window.innerWidth - EDGE - r.right;
			if (!dx) return;
			if (align === 'right') node.style.right = `${-dx}px`;
			else node.style.left = `${dx}px`;
		}
		place();
		const ro = new ResizeObserver(place);
		ro.observe(node);
		window.addEventListener('resize', place);
		return {
			destroy() {
				ro.disconnect();
				window.removeEventListener('resize', place);
			}
		};
	}
</script>

{#if open}
	<div
		use:clickOutside={onclose}
		use:keepOnScreen
		in:fly={POPOVER_IN}
		class="absolute z-50 max-w-[calc(100vw-16px)] rounded-[10px] border border-border bg-bg-elev p-1.5 text-[14px] shadow-lg
		{dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}
		{align === 'right' ? 'right-0' : 'left-0'}"
		style:min-width="min({minWidth}px, calc(100vw - 16px))"
		style:max-width={maxWidth ? `${maxWidth}px` : undefined}
	>
		{@render children()}
	</div>
{/if}
