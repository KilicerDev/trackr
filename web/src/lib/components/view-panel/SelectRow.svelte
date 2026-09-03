<script lang="ts" generics="K extends string">
	// One-line setting row for the view panel: label on the left, a compact
	// dropdown on the right showing the current value. An optional `leading`
	// snippet renders controls just left of the dropdown (the sort direction
	// toggle uses it).
	//
	// The menu is position:fixed so the panel's own scroll container can't
	// clip it; it flips upward when there's no room below.
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import Icon from '../Icon.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { POPOVER_IN } from '$lib/config/motion';

	interface Option {
		id: K;
		label: string;
	}
	interface Props {
		label: string;
		options: Option[];
		value: K;
		onchange: (id: K) => void;
		leading?: Snippet;
	}
	let { label, options, value, onchange, leading }: Props = $props();

	const MENU_W = 200;
	const ROW_H = 32;

	let open = $state(false);
	let anchor = $state<HTMLButtonElement | null>(null);
	let pos = $state<{ left: number; top: number } | null>(null);

	const current = $derived(options.find((o) => o.id === value)?.label ?? '');

	function place() {
		if (!anchor) {
			pos = null;
			return;
		}
		const r = anchor.getBoundingClientRect();
		const h = options.length * ROW_H + 12;
		const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
		const below = r.bottom + 4;
		const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : below;
		pos = { left, top };
	}

	function toggle() {
		open = !open;
		if (open) queueMicrotask(place);
	}

	$effect(() => {
		if (!open) return;
		const on = () => place();
		window.addEventListener('resize', on);
		window.addEventListener('scroll', on, true);
		return () => {
			window.removeEventListener('resize', on);
			window.removeEventListener('scroll', on, true);
		};
	});
</script>

<div class="flex h-10 items-center gap-2 px-3">
	<span class="text-[14px] text-text-2">{label}</span>
	<div class="ml-auto flex items-center gap-1.5">
		{#if leading}
			{@render leading()}
		{/if}
		<button
			bind:this={anchor}
			type="button"
			onclick={toggle}
			aria-haspopup="listbox"
			aria-expanded={open}
			class="inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded-md border border-border bg-bg-elev px-2.5 text-[13px] font-medium whitespace-nowrap text-text transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
		>
			<span class="truncate">{current}</span>
			<Icon name="chevron" size={11} class="shrink-0 text-text-3" />
		</button>
	</div>
</div>

{#if open && pos}
	<div
		use:clickOutside={() => (open = false)}
		in:fly={POPOVER_IN}
		role="listbox"
		aria-label={label}
		class="fixed z-50 rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
		style:width="{MENU_W}px"
		style:left="{pos.left}px"
		style:top="{pos.top}px"
	>
		{#each options as o (o.id)}
			<button
				type="button"
				role="option"
				aria-selected={o.id === value}
				onclick={() => {
					onchange(o.id);
					open = false;
				}}
				class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="truncate">{o.label}</span>
				<span class="ml-auto text-accent {o.id === value ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	</div>
{/if}
