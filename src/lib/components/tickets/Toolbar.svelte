<script lang="ts">
	import Icon from '../Icon.svelte';
	import Chip from '../Chip.svelte';
	import Button from '../Button.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '$lib/data';

	type GroupBy = 'status' | 'priority' | 'category' | 'org' | 'none';
	type FieldId = 'status' | 'priority' | 'category' | 'org';

	interface Props {
		filters: Record<string, string[]>;
		setFilters: (f: Record<string, string[]>) => void;
		search: string;
		setSearch: (s: string) => void;
		group: GroupBy;
		setGroup: (g: GroupBy) => void;
		onNew?: () => void;
		canCreate?: boolean;
		orgs?: { id: string; name: string; color: string }[];
	}
	let {
		filters,
		setFilters,
		search,
		setSearch,
		group,
		setGroup,
		onNew,
		canCreate = true,
		orgs = []
	}: Props = $props();

	const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
		{ id: 'status', label: 'Status' },
		{ id: 'priority', label: 'Priority' },
		{ id: 'category', label: 'Category' },
		{ id: 'org', label: 'Org' },
		{ id: 'none', label: 'None' }
	];

	const FIELDS: { id: FieldId; label: string; icon: string }[] = [
		{ id: 'status', label: 'Status', icon: 'check' },
		{ id: 'priority', label: 'Priority', icon: 'filter' },
		{ id: 'category', label: 'Category', icon: 'bookmark' },
		{ id: 'org', label: 'Org', icon: 'org' }
	];

	// State machine — mirrors tasks Toolbar:
	//   'group'         — group-by pop
	//   'add:fields'    — "+ Filter" first step (pick field)
	//   'add:<field>'   — values pop for newly-chosen field
	//   'chip:<field>'  — values pop from clicking an existing chip
	let pop = $state<string | null>(null);

	function toggleValue(field: string, value: string) {
		const cur = filters[field] ?? [];
		const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
		const merged = { ...filters, [field]: next };
		if (next.length === 0) delete merged[field];
		setFilters(merged);
	}

	function clearAll() {
		setFilters({});
	}

	const groupLabel = (id: GroupBy) => GROUP_OPTIONS.find((g) => g.id === id)?.label ?? '';
	const fieldLabel = (id: string) => FIELDS.find((f) => f.id === id)?.label ?? id;

	let activeFilters = $derived(Object.entries(filters).filter(([, v]) => v.length > 0));

	function valueLabel(field: string, v: string) {
		if (field === 'status') return TICKET_STATUSES.find((s) => s.id === v)?.label ?? v;
		if (field === 'priority') return TICKET_PRIORITIES.find((p) => p.id === v)?.label ?? v;
		if (field === 'category') return TICKET_CATEGORIES.find((c) => c.id === v)?.label ?? v;
		if (field === 'org') return orgs.find((o) => o.id === v)?.name ?? v;
		return v;
	}
</script>

{#snippet valuesList(field: string)}
	{@const values = filters[field] ?? []}
	{#if field === 'status'}
		{#each TICKET_STATUSES as s (s.id)}
			<button
				type="button"
				onclick={() => toggleValue('status', s.id)}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
			>
				<span class="w-2 h-2 rounded-full" style:background={s.dot}></span>
				<span class="text-[13px]">{s.label}</span>
				<span class="ml-auto text-accent {values.includes(s.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{:else if field === 'priority'}
		{#each TICKET_PRIORITIES as p (p.id)}
			<button
				type="button"
				onclick={() => toggleValue('priority', p.id)}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
			>
				<PriorityBars priority={p.id} />
				<span class="text-[13px]">{p.label}</span>
				<span class="ml-auto text-accent {values.includes(p.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{:else if field === 'category'}
		{#each TICKET_CATEGORIES as c (c.id)}
			<button
				type="button"
				onclick={() => toggleValue('category', c.id)}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
			>
				<span class="w-2 h-2 rounded-full" style:background={c.color}></span>
				<span class="text-[13px]">{c.label}</span>
				<span class="ml-auto text-accent {values.includes(c.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{:else if field === 'org'}
		{#each orgs as o (o.id)}
			<button
				type="button"
				onclick={() => toggleValue('org', o.id)}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
			>
				<span class="w-2 h-2 rounded-full" style:background={o.color}></span>
				<span class="text-[13px] truncate">{o.name}</span>
				<span class="ml-auto text-accent {values.includes(o.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
		{#if orgs.length === 0}
			<div class="px-2 py-2 text-[11.5px] text-text-3">No organizations.</div>
		{/if}
	{/if}
{/snippet}

<div class="flex items-center gap-2 px-5 py-2.5 border-b border-border bg-bg shrink-0">
	<!-- Group -->
	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'group' ? null : 'group')}
			class="inline-flex items-center h-7 px-2.5 gap-1.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-[12.5px] transition-colors"
		>
			<span class="text-text-3">Group</span>
			<span class="text-text font-medium">{groupLabel(group)}</span>
			<Icon name="chevron" size={10} class="text-text-3" />
		</button>
		{#if pop === 'group'}
			<div
				use:clickOutside={() => (pop = null)}
				use:autoPlace
				in:fly={POPOVER_IN}
				class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[170px]"
				style:box-shadow="var(--shadow-lg)"
			>
				{#each GROUP_OPTIONS as o (o.id)}
					<button
						type="button"
						onclick={() => {
							setGroup(o.id);
							pop = null;
						}}
						class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text text-[13px]"
					>
						<span>{o.label}</span>
						<span class="ml-auto text-accent {group === o.id ? 'opacity-100' : 'opacity-0'}">
							<Icon name="check" size={12} />
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="w-px h-5 bg-border"></div>

	<!-- + Filter -->
	<div class="relative">
		<Chip variant="add" onclick={() => (pop = pop?.startsWith('add:') ? null : 'add:fields')}>
			<Icon name="plus" size={12} /> Filter
		</Chip>
		{#if pop === 'add:fields'}
			<div
				use:clickOutside={() => (pop = null)}
				use:autoPlace
				in:fly={POPOVER_IN}
				class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[200px]"
				style:box-shadow="var(--shadow-lg)"
			>
				{#each FIELDS as f (f.id)}
					<button
						type="button"
						onclick={() => (pop = `add:${f.id}`)}
						class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left"
					>
						<span class="text-text-3"><Icon name={f.icon} size={13} /></span>
						<span class="text-[13px]">{f.label}</span>
						<span class="ml-auto text-text-4"><Icon name="chevron-r" size={11} /></span>
					</button>
				{/each}
			</div>
		{:else if pop?.startsWith('add:') && pop !== 'add:fields'}
			{@const field = pop.slice(4)}
			<div
				use:clickOutside={() => (pop = null)}
				use:autoPlace
				in:fly={POPOVER_IN}
				class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[240px]"
				style:box-shadow="var(--shadow-lg)"
			>
				<button
					type="button"
					onclick={() => (pop = 'add:fields')}
					class="w-full flex items-center gap-1.5 px-2 py-1 mb-1 rounded-md hover:bg-surface-2 text-text-3 hover:text-text text-[11.5px] uppercase tracking-[0.06em] text-left border-b border-border pb-2"
				>
					<Icon name="chevron-r" size={10} class="rotate-180" />
					{fieldLabel(field)}
				</button>
				{@render valuesList(field)}
			</div>
		{/if}
	</div>

	<!-- Active filter chips -->
	{#each activeFilters as [field, values] (field)}
		<div class="relative">
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
				<span class="text-text font-medium">
					{#if values.length === 1}
						{valueLabel(field, values[0])}
					{:else}
						{values.length} selected
					{/if}
				</span>
			</Chip>
			{#if pop === `chip:${field}`}
				<div
					use:clickOutside={() => (pop = null)}
					use:autoPlace
					in:fly={POPOVER_IN}
					class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[220px]"
					style:box-shadow="var(--shadow-lg)"
				>
					{@render valuesList(field)}
				</div>
			{/if}
		</div>
	{/each}

	{#if activeFilters.length >= 2}
		<button onclick={clearAll} class="text-[12px] text-text-3 hover:text-text px-2">Clear</button>
	{/if}

	<div class="ml-auto flex items-center gap-2">
		<div class="relative">
			<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none">
				<Icon name="search" size={13} />
			</span>
			<input
				type="text"
				placeholder="Search tickets…"
				value={search}
				oninput={(e) => setSearch((e.target as HTMLInputElement).value)}
				class="h-7 pl-7 pr-2.5 rounded-lg bg-surface border border-border text-[12.5px] text-text placeholder:text-text-3 outline-none focus:border-border-strong w-56"
			/>
		</div>
		{#if canCreate}
			<Button variant="primary" size="sm" onclick={() => onNew?.()}>
				<Icon name="plus" size={13} /> New ticket
			</Button>
		{/if}
	</div>
</div>
