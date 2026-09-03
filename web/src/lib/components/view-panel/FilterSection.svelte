<script lang="ts">
	// "Filters" card: one collapsible row per filterable field. Each page
	// still owns its value rendering (the `valuesList` snippet, which now also
	// receives the search query so it can narrow its own list); this component
	// owns the accordion, the per-row summary, the search box, and the clear
	// buttons.
	//
	// Only one row is open at a time and an open list is capped in height with
	// its own scroll, so a field with dozens of values (tags, people, orgs)
	// never turns the panel into one long scroll. Active rows stay collapsed
	// when the panel opens — the accent tint and summary already say what's
	// applied.
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from '../Icon.svelte';
	import PanelSection from './PanelSection.svelte';
	import { m } from '$lib/paraglide/messages';

	export interface FilterField {
		id: string;
		label: string;
		icon: string;
		// Always show a search box (open-ended lists: people, projects, tags, orgs).
		// Fixed taxonomies leave it unset and only get one past SEARCH_THRESHOLD.
		searchable?: boolean;
	}
	interface Props {
		fields: FilterField[];
		filters: Record<string, string[]>;
		setFilters: (f: Record<string, string[]>) => void;
		valueLabel: (field: string, value: string) => string;
		valuesList: Snippet<[string, string]>;
	}
	let { fields, filters, setFilters, valueLabel, valuesList }: Props = $props();

	// Non-searchable lists longer than this still get a search box above them.
	const SEARCH_THRESHOLD = 8;

	let expanded = $state<string | null>(null);
	let query = $state('');
	let listEl = $state<HTMLDivElement | null>(null);
	// Measured off the rendered list (the snippet owns the items), only while
	// the query is empty so the box doesn't vanish once it has narrowed things.
	let itemCount = $state(0);
	let matchCount = $state(0);

	$effect(() => {
		void expanded;
		void query;
		const el = listEl;
		if (!el) return;
		const n = el.querySelectorAll('button').length;
		if (query === '') itemCount = n;
		matchCount = n;
	});

	function toggle(id: string) {
		expanded = expanded === id ? null : id;
		query = '';
	}
	function clearField(id: string) {
		const next = { ...filters };
		delete next[id];
		setFilters(next);
	}
	const activeCount = $derived(Object.values(filters).filter((v) => v.length > 0).length);

	function summary(id: string): string {
		const values = filters[id] ?? [];
		if (values.length === 0) return '';
		if (values.length === 1) return valueLabel(id, values[0]);
		return m.tasks_n_selected({ n: values.length });
	}

	const focusOnMount = (el: HTMLInputElement) => {
		el.focus();
	};
</script>

<PanelSection title={m.view_filters()}>
	{#snippet action()}
		{#if activeCount > 0}
			<button
				type="button"
				onclick={() => setFilters({})}
				class="h-6 rounded-md px-1.5 text-[12px] text-text-3 transition-colors hover:bg-surface hover:text-text"
			>
				{m.tasks_clear()}
			</button>
		{/if}
	{/snippet}

	<div class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
		{#each fields as f (f.id)}
			{@const open = expanded === f.id}
			{@const active = (filters[f.id] ?? []).length > 0}
			<div>
				<div class="flex items-center">
					<button
						type="button"
						onclick={() => toggle(f.id)}
						aria-expanded={open}
						class="flex h-9 min-w-0 flex-1 items-center gap-2.5 px-2.5 text-left transition-colors hover:bg-surface-2"
					>
						<span class={active ? 'text-accent' : 'text-text-3'}
							><Icon name={f.icon} size={14} /></span
						>
						<span class="text-[14px] {active ? 'font-medium text-text' : 'text-text-2'}"
							>{f.label}</span
						>
						<span
							class="ml-auto min-w-0 truncate pl-3 text-[13px] {active
								? 'text-text'
								: 'text-text-4'}"
						>
							{active ? summary(f.id) : m.view_filter_any()}
						</span>
						<span class="text-text-4 transition-transform duration-200 {open ? 'rotate-180' : ''}">
							<Icon name="chevron" size={12} />
						</span>
					</button>
					{#if active}
						<button
							type="button"
							onclick={() => clearField(f.id)}
							aria-label="{m.tasks_clear()} {f.label}"
							class="grid h-9 w-8 shrink-0 place-items-center border-l border-border text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
						>
							<Icon name="x" size={12} />
						</button>
					{/if}
				</div>
				{#if open}
					<div
						transition:slide={{ duration: 180, easing: cubicOut }}
						class="border-t border-border bg-bg-elev/60"
					>
						{#if f.searchable || itemCount > SEARCH_THRESHOLD}
							<div class="relative border-b border-border p-1.5">
								<span
									class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text-3"
								>
									<Icon name="search" size={13} />
								</span>
								<input
									use:focusOnMount
									type="text"
									bind:value={query}
									placeholder={m.common_search()}
									class="h-7 w-full rounded-md border border-border bg-surface pr-2 pl-7 text-[13px] text-text outline-none placeholder:text-text-4 focus:border-border-strong"
								/>
							</div>
						{/if}
						<div bind:this={listEl} class="list-scroll max-h-[264px] overflow-y-auto p-1.5">
							{@render valuesList(f.id, query.trim().toLowerCase())}
							{#if query && matchCount === 0}
								<div class="px-2 py-2 text-[12px] text-text-3">{m.view_filter_no_matches()}</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</PanelSection>

<style>
	.list-scroll {
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}
</style>
