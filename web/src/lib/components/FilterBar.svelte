<script lang="ts">
	// Reusable filter chip strip + add/edit popovers.
	//
	// Each page (tasks, tickets, …) owns its own filter shape and value
	// rendering — passed in via the `valuesList` snippet which receives the
	// field id and renders the appropriate checkbox-style list. Everything
	// else (state machine, horizontal scroll behavior, popover positioning,
	// Clear button) lives here so the consuming Toolbar stays small.
	//
	// Popovers use `position: fixed` rather than absolute because the chip
	// strip is horizontally scrollable, and an absolute popover anchored
	// inside it would clip on the scroller's y-overflow.

	import type { Snippet } from 'svelte';
	import Chip from './Chip.svelte';
	import Icon from './Icon.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { m } from '$lib/paraglide/messages';

	export interface FilterField {
		id: string;
		label: string;
		icon: string;
	}

	interface Props {
		fields: FilterField[];
		filters: Record<string, string[]>;
		setFilters: (f: Record<string, string[]>) => void;
		valueLabel: (field: string, value: string) => string;
		valuesList: Snippet<[string]>;
	}
	let { fields, filters, setFilters, valueLabel, valuesList }: Props = $props();

	// State machine — same shape as before:
	//   'add:fields'   — initial "+ Filter" pop showing the list of fields
	//   'add:<field>'  — nested values pop for a freshly-picked field
	//   'chip:<field>' — values pop opened by clicking an existing chip
	let pop = $state<string | null>(null);
	let scroller = $state<HTMLDivElement | null>(null);
	let popPos = $state<{ left: number; top: number } | null>(null);

	const fieldLabel = (id: string) => fields.find((f) => f.id === id)?.label ?? id;
	let activeFilters = $derived(Object.entries(filters).filter(([, v]) => v.length > 0));

	function popTriggerKey(p: string | null): string | null {
		if (!p) return null;
		if (p.startsWith('add:')) return 'add';
		if (p.startsWith('chip:')) return p;
		return null;
	}

	function updatePopPos() {
		const key = popTriggerKey(pop);
		if (!key || !scroller) {
			popPos = null;
			return;
		}
		const el = scroller.querySelector<HTMLElement>(`[data-pop-trigger="${key}"]`);
		if (!el) return;
		const r = el.getBoundingClientRect();
		// Clamp left so the popover never spills past the right viewport edge —
		// replaces the old `use:autoPlace` flip with a simpler shift.
		const POPOVER_MAX = 260;
		const maxLeft = Math.max(8, window.innerWidth - POPOVER_MAX - 8);
		popPos = { left: Math.min(r.left, maxLeft), top: r.bottom + 6 };
	}

	$effect(() => {
		void pop;
		queueMicrotask(updatePopPos);
	});

	$effect(() => {
		if (!popTriggerKey(pop)) return;
		const onMove = () => updatePopPos();
		scroller?.addEventListener('scroll', onMove, { passive: true });
		window.addEventListener('resize', onMove);
		window.addEventListener('scroll', onMove, { passive: true });
		return () => {
			scroller?.removeEventListener('scroll', onMove);
			window.removeEventListener('resize', onMove);
			window.removeEventListener('scroll', onMove);
		};
	});

	function clearAll() {
		setFilters({});
	}
</script>

<div
	bind:this={scroller}
	class="filter-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto"
>
	<div data-pop-trigger="add" class="shrink-0">
		<Chip variant="add" onclick={() => (pop = pop?.startsWith('add:') ? null : 'add:fields')}>
			<Icon name="plus" size={13} />
			{m.tasks_filter()}
		</Chip>
	</div>

	{#each activeFilters as [field, values] (field)}
		<div data-pop-trigger="chip:{field}" class="shrink-0 whitespace-nowrap">
			<Chip
				variant="filter"
				onclick={() => (pop = pop === `chip:${field}` ? null : `chip:${field}`)}
				onremove={() => {
					const next = { ...filters };
					delete next[field];
					setFilters(next);
				}}
			>
				<span class="text-text-3">{fieldLabel(field)}:</span>
				<span class="font-medium text-text">
					{#if values.length === 1}
						{valueLabel(field, values[0])}
					{:else}
						{m.tasks_n_selected({ n: values.length })}
					{/if}
				</span>
			</Chip>
		</div>
	{/each}

	{#if activeFilters.length >= 2}
		<button onclick={clearAll} class="shrink-0 px-2 text-[13px] text-text-3 hover:text-text">
			{m.tasks_clear()}
		</button>
	{/if}
</div>

{#if popPos && pop === 'add:fields'}
	<div
		use:clickOutside={() => (pop = null)}
		in:fly={POPOVER_IN}
		class="fixed z-50 min-w-[220px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
		style:left="{popPos.left}px"
		style:top="{popPos.top}px"
	>
		{#each fields as f (f.id)}
			<button
				type="button"
				onclick={() => (pop = `add:${f.id}`)}
				class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="text-text-3"><Icon name={f.icon} size={14} /></span>
				<span class="text-[14px]">{f.label}</span>
				<span class="ml-auto text-text-4"><Icon name="chevron-r" size={12} /></span>
			</button>
		{/each}
	</div>
{:else if popPos && pop?.startsWith('add:') && pop !== 'add:fields'}
	{@const field = pop.slice(4)}
	<div
		use:clickOutside={() => (pop = null)}
		in:fly={POPOVER_IN}
		class="fixed z-50 min-w-[264px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
		style:left="{popPos.left}px"
		style:top="{popPos.top}px"
	>
		<button
			type="button"
			onclick={() => (pop = 'add:fields')}
			class="mb-1 flex w-full items-center gap-1.5 rounded-md border-b border-border px-2 py-1 pb-2 text-left text-[12px] tracking-[0.06em] text-text-3 uppercase hover:bg-surface-2 hover:text-text"
		>
			<Icon name="chevron-r" size={11} class="rotate-180" />
			{fieldLabel(field)}
		</button>
		{@render valuesList(field)}
	</div>
{:else if popPos && pop?.startsWith('chip:')}
	{@const field = pop.slice(5)}
	<div
		use:clickOutside={() => (pop = null)}
		in:fly={POPOVER_IN}
		class="fixed z-50 min-w-[242px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
		style:left="{popPos.left}px"
		style:top="{popPos.top}px"
	>
		{@render valuesList(field)}
	</div>
{/if}

<style>
	.filter-scroll {
		scrollbar-width: none;
	}
	.filter-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
