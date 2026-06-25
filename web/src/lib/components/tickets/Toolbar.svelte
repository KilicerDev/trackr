<script lang="ts">
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import FilterBar from '../FilterBar.svelte';
	import type { FilterField } from '../FilterBar.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '$lib/config/taxonomy';
	import { m } from '$lib/paraglide/messages';
	import { ticketStatusLabel, ticketCategoryLabel, priorityLabel } from '$lib/utils/labels';

	type GroupBy = 'status' | 'priority' | 'category' | 'org' | 'none';

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
		{ id: 'status', label: m.tickets_group_status() },
		{ id: 'priority', label: m.tickets_group_priority() },
		{ id: 'category', label: m.tickets_group_category() },
		{ id: 'org', label: m.tickets_group_org() },
		{ id: 'none', label: m.tickets_group_none() }
	];

	const FIELDS: FilterField[] = [
		{ id: 'status', label: m.tickets_field_status(), icon: 'check' },
		{ id: 'priority', label: m.tickets_field_priority(), icon: 'filter' },
		{ id: 'category', label: m.tickets_field_category(), icon: 'bookmark' },
		{ id: 'org', label: m.tickets_field_org(), icon: 'org' }
	];

	let pop = $state<'group' | null>(null);

	function toggleValue(field: string, value: string) {
		const cur = filters[field] ?? [];
		const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
		const merged = { ...filters, [field]: next };
		if (next.length === 0) delete merged[field];
		setFilters(merged);
	}

	const groupLabel = (id: GroupBy) => GROUP_OPTIONS.find((g) => g.id === id)?.label ?? '';

	function valueLabel(field: string, v: string) {
		if (field === 'status')
			return TICKET_STATUSES.some((s) => s.id === v) ? ticketStatusLabel(v) : v;
		if (field === 'priority')
			return TICKET_PRIORITIES.some((p) => p.id === v) ? priorityLabel(v) : v;
		if (field === 'category')
			return TICKET_CATEGORIES.some((c) => c.id === v) ? ticketCategoryLabel(v) : v;
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
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={s.dot}></span>
				<span class="text-[13px]">{ticketStatusLabel(s.id)}</span>
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
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<PriorityBars priority={p.id} />
				<span class="text-[13px]">{priorityLabel(p.id)}</span>
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
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={c.color}></span>
				<span class="text-[13px]">{ticketCategoryLabel(c.id)}</span>
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
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={o.color}></span>
				<span class="truncate text-[13px]">{o.name}</span>
				<span class="ml-auto text-accent {values.includes(o.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
		{#if orgs.length === 0}
			<div class="px-2 py-2 text-[11.5px] text-text-3">{m.tickets_no_orgs()}</div>
		{/if}
	{/if}
{/snippet}

<div class="flex shrink-0 items-center gap-2 border-b border-border bg-bg px-5 py-2.5">
	<!-- Group -->
	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'group' ? null : 'group')}
			class="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] transition-colors hover:bg-surface-2"
		>
			<span class="text-text-3">{m.tickets_group()}</span>
			<span class="font-medium text-text">{groupLabel(group)}</span>
			<Icon name="chevron" size={10} class="text-text-3" />
		</button>
		{#if pop === 'group'}
			<div
				use:clickOutside={() => (pop = null)}
				use:autoPlace
				in:fly={POPOVER_IN}
				class="absolute top-full z-50 mt-1.5 min-w-[170px] rounded-[10px] border border-border bg-bg-elev p-1.5"
				style:box-shadow="var(--shadow-lg)"
			>
				{#each GROUP_OPTIONS as o (o.id)}
					<button
						type="button"
						onclick={() => {
							setGroup(o.id);
							pop = null;
						}}
						class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
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

	<div class="h-5 w-px bg-border"></div>

	<FilterBar fields={FIELDS} {filters} {setFilters} {valueLabel} {valuesList} />

	<div class="ml-auto flex shrink-0 items-center gap-2">
		<div class="relative">
			<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3">
				<Icon name="search" size={13} />
			</span>
			<input
				type="text"
				placeholder={m.tickets_search_placeholder()}
				value={search}
				oninput={(e) => setSearch((e.target as HTMLInputElement).value)}
				class="h-7 w-56 rounded-lg border border-border bg-surface pr-2.5 pl-7 text-[12.5px] text-text outline-none placeholder:text-text-3 focus:border-border-strong"
			/>
		</div>
		{#if canCreate}
			<Button variant="primary" size="sm" onclick={() => onNew?.()}>
				<Icon name="plus" size={13} />
				{m.tickets_new_title()}
			</Button>
		{/if}
	</div>
</div>
