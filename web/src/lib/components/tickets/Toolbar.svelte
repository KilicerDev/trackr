<script lang="ts">
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import Avatar from '../Avatar.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import type { FilterField } from '../view-panel/FilterSection.svelte';
	import ViewsMenu from '../ViewsMenu.svelte';
	import type { SavedViewEntry } from '../ViewsMenu.svelte';
	import ViewPanel from '../view-panel/ViewPanel.svelte';
	import PanelSection from '../view-panel/PanelSection.svelte';
	import SelectRow from '../view-panel/SelectRow.svelte';
	import SortRow from '../view-panel/SortRow.svelte';
	import FilterSection from '../view-panel/FilterSection.svelte';
	import FilterTrigger from '../view-panel/FilterTrigger.svelte';
	import { page } from '$app/state';
	import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '$lib/config/taxonomy';
	import { labelMeta } from '$lib/utils/label-meta';
	import { m } from '$lib/paraglide/messages';
	import { ticketStatusLabel, ticketCategoryLabel, priorityLabel } from '$lib/utils/labels';
	import { DEFAULT_TICKET_LIST_SORT, type TicketSort, type TicketSortBy } from '$lib/utils/sort';

	type GroupBy = 'status' | 'priority' | 'category' | 'org' | 'assignee' | 'none';
	type SubBy = 'none' | 'status' | 'priority' | 'category' | 'assignee';

	type TicketsViewConfig = {
		view: 'list' | 'board';
		listGroup: GroupBy;
		boardGroup: GroupBy;
		sub: SubBy;
		filters: Record<string, string[]>;
		listSort: TicketSort;
		boardSort: TicketSort;
	};

	type LayoutData = {
		users?: {
			id: string;
			name: string;
			initials: string;
			color: string;
			status: string;
			internal?: boolean;
		}[];
		tickets?: { tags?: string[] }[];
	};

	interface Props {
		view: 'list' | 'board';
		setView: (v: 'list' | 'board') => void;
		filters: Record<string, string[]>;
		setFilters: (f: Record<string, string[]>) => void;
		search: string;
		setSearch: (s: string) => void;
		group: GroupBy;
		setGroup: (g: GroupBy) => void;
		sub?: SubBy;
		setSub?: (s: SubBy) => void;
		sort?: TicketSort;
		setSort?: (s: TicketSort) => void;
		onNew?: () => void;
		canCreate?: boolean;
		orgs?: { id: string; name: string; color: string }[];
		// Portal (client) mode: hide agent-oriented dimensions like assignee.
		portal?: boolean;
		// Minimal (portal member) mode: strip board/group/sub/filter chrome and
		// leave only search + New. The member sees a plain list of their own tickets.
		minimal?: boolean;
		viewsMenu?: {
			views: SavedViewEntry<TicketsViewConfig>[];
			current: TicketsViewConfig;
			onApply: (config: TicketsViewConfig) => void;
			onChange: (views: SavedViewEntry<TicketsViewConfig>[]) => void;
		};
	}
	let {
		view,
		setView,
		filters,
		setFilters,
		search,
		setSearch,
		group,
		setGroup,
		sub = 'none',
		setSub,
		sort = DEFAULT_TICKET_LIST_SORT,
		setSort,
		onNew,
		canCreate = true,
		orgs = [],
		portal = false,
		minimal = false,
		viewsMenu
	}: Props = $props();

	// Assignees offered for grouping/filtering: internal agents only (tickets are
	// assigned to staff, not clients).
	const agents = $derived(
		((page.data as LayoutData).users ?? []).filter((u) => u.internal && u.status !== 'disabled')
	);

	// Every tag actually in use across the loaded (org-wide) tickets — the
	// org-defined tag vocabulary. Deduped.
	const allTags = $derived.by(() => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const t of (page.data as LayoutData).tickets ?? []) {
			for (const l of t.tags ?? []) {
				if (!seen.has(l)) {
					seen.add(l);
					out.push(l);
				}
			}
		}
		return out;
	});

	// Assignee is an agent-facing dimension — dropped in portal (client) mode.
	const GROUP_OPTIONS = $derived<{ id: GroupBy; label: string }[]>([
		{ id: 'status', label: m.tickets_group_status() },
		{ id: 'priority', label: m.tickets_group_priority() },
		{ id: 'category', label: m.tickets_group_category() },
		{ id: 'org', label: m.tickets_group_org() },
		...(portal ? [] : [{ id: 'assignee' as const, label: m.tickets_group_assignee() }]),
		{ id: 'none', label: m.tickets_group_none() }
	]);
	const SUB_OPTIONS = $derived<{ id: SubBy; label: string }[]>([
		{ id: 'status', label: m.tickets_group_status() },
		{ id: 'priority', label: m.tickets_group_priority() },
		{ id: 'category', label: m.tickets_group_category() },
		...(portal ? [] : [{ id: 'assignee' as const, label: m.tickets_group_assignee() }]),
		{ id: 'none', label: m.tickets_group_none() }
	]);
	const SORT_OPTIONS = $derived<{ id: TicketSortBy; label: string }[]>([
		{ id: 'priority', label: m.sort_priority() },
		{ id: 'activity', label: m.sort_activity() },
		{ id: 'created', label: m.sort_created() },
		{ id: 'subject', label: m.sort_subject() }
	]);

	const FIELDS = $derived<FilterField[]>([
		{ id: 'status', label: m.tickets_field_status(), icon: 'check' },
		{ id: 'priority', label: m.tickets_field_priority(), icon: 'filter' },
		{ id: 'category', label: m.tickets_field_category(), icon: 'bookmark' },
		{ id: 'tags', label: m.tasks_tags(), icon: 'star', searchable: true },
		...(portal
			? []
			: [
					{
						id: 'assignee',
						label: m.tickets_field_assignee(),
						icon: 'users',
						searchable: true
					} as FilterField
				]),
		{ id: 'org', label: m.tickets_field_org(), icon: 'org', searchable: true }
	]);

	let panelOpen = $state(false);
	const activeFilterCount = $derived(
		Object.values(filters).reduce((n, v) => n + (v?.length ?? 0), 0)
	);

	// Search inside a long value list (query arrives lower-cased and trimmed).
	const hit = (label: string, query: string) => !query || label.toLowerCase().includes(query);

	function toggleValue(field: string, value: string) {
		const cur = filters[field] ?? [];
		const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
		const merged = { ...filters, [field]: next };
		if (next.length === 0) delete merged[field];
		setFilters(merged);
	}

	function valueLabel(field: string, v: string): string {
		if (field === 'status')
			return TICKET_STATUSES.some((s) => s.id === v) ? ticketStatusLabel(v) : v;
		if (field === 'priority')
			return TICKET_PRIORITIES.some((p) => p.id === v) ? priorityLabel(v) : v;
		if (field === 'category')
			return TICKET_CATEGORIES.some((c) => c.id === v) ? ticketCategoryLabel(v) : v;
		if (field === 'assignee')
			return v === '__unassigned__'
				? m.common_unassigned()
				: (agents.find((u) => u.id === v)?.name ?? v);
		if (field === 'tags') return labelMeta(v).label;
		if (field === 'org') return orgs.find((o) => o.id === v)?.name ?? v;
		return v;
	}
</script>

{#snippet valuesList(field: string, query: string)}
	{@const values = filters[field] ?? []}
	{#if field === 'status'}
		{#each TICKET_STATUSES.filter((s) => hit(ticketStatusLabel(s.id), query)) as s (s.id)}
			<button
				type="button"
				onclick={() => toggleValue('status', s.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={s.dot}></span>
				<span class="text-[14px]">{ticketStatusLabel(s.id)}</span>
				<span class="ml-auto text-accent {values.includes(s.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'priority'}
		{#each TICKET_PRIORITIES.filter((p) => hit(priorityLabel(p.id), query)) as p (p.id)}
			<button
				type="button"
				onclick={() => toggleValue('priority', p.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<PriorityBars priority={p.id} />
				<span class="text-[14px]">{priorityLabel(p.id)}</span>
				<span class="ml-auto text-accent {values.includes(p.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'category'}
		{#each TICKET_CATEGORIES.filter((c) => hit(ticketCategoryLabel(c.id), query)) as c (c.id)}
			<button
				type="button"
				onclick={() => toggleValue('category', c.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={c.color}></span>
				<span class="text-[14px]">{ticketCategoryLabel(c.id)}</span>
				<span class="ml-auto text-accent {values.includes(c.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'assignee'}
		<!-- `__unassigned__` sentinel: matches tickets with no assignee (same key the
		     sidebar / dashboard deep-links use). -->
		{#if hit(m.common_unassigned(), query)}
			<button
				type="button"
				onclick={() => toggleValue('assignee', '__unassigned__')}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span
					class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-text-3 text-text-3"
				>
					<Icon name="user" size={12} />
				</span>
				<span class="truncate text-[14px]">{m.common_unassigned()}</span>
				<span
					class="ml-auto text-accent {values.includes('__unassigned__')
						? 'opacity-100'
						: 'opacity-0'}"
				>
					<Icon name="check" size={14} />
				</span>
			</button>
		{/if}
		{#each agents.filter((u) => hit(u.name, query)) as u (u.id)}
			<button
				type="button"
				onclick={() => toggleValue('assignee', u.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<Avatar user={u} size={22} />
				<span class="truncate text-[14px]">{u.name}</span>
				<span class="ml-auto text-accent {values.includes(u.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
		{#if agents.length === 0}
			<div class="px-2 py-2 text-[12px] text-text-3">{m.tickets_no_agents()}</div>
		{/if}
	{:else if field === 'tags'}
		{#each allTags.filter((id) => hit(labelMeta(id).label, query)) as id (id)}
			{@const l = labelMeta(id)}
			<button
				type="button"
				onclick={() => toggleValue('tags', id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={l.color}></span>
				<span class="truncate text-[14px]">{l.label}</span>
				<span class="ml-auto text-accent {values.includes(id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
		{#if allTags.length === 0}
			<div class="px-2 py-2 text-[12px] text-text-3">{m.common_none()}</div>
		{/if}
	{:else if field === 'org'}
		{#each orgs.filter((o) => hit(o.name, query)) as o (o.id)}
			<button
				type="button"
				onclick={() => toggleValue('org', o.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={o.color}></span>
				<span class="truncate text-[14px]">{o.name}</span>
				<span class="ml-auto text-accent {values.includes(o.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
		{#if orgs.length === 0}
			<div class="px-2 py-2 text-[12px] text-text-3">{m.tickets_no_orgs()}</div>
		{/if}
	{/if}
{/snippet}

<div class="flex shrink-0 items-center gap-2 border-b border-border bg-bg px-5 py-2.5">
	<div class="tb-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
		{#if viewsMenu && !minimal}
			<ViewsMenu
				views={viewsMenu.views}
				current={viewsMenu.current}
				onApply={viewsMenu.onApply}
				onChange={viewsMenu.onChange}
			/>
			<div class="h-5 w-px shrink-0 bg-border"></div>
		{/if}
		{#if !minimal}
			<!-- View toggle -->
			<div
				class="inline-flex h-7 shrink-0 items-center rounded-lg border border-border bg-surface p-0.5 text-[14px]"
			>
				<button
					type="button"
					onclick={() => setView('list')}
					class="inline-flex h-full items-center gap-1.5 rounded-md px-2 transition-colors {view ===
					'list'
						? 'bg-bg-elev text-text'
						: 'text-text-3 hover:text-text'}"
				>
					<Icon name="list" size={14} />
					{m.tasks_view_list()}
				</button>
				<button
					type="button"
					onclick={() => setView('board')}
					class="inline-flex h-full items-center gap-1.5 rounded-md px-2 transition-colors {view ===
					'board'
						? 'bg-bg-elev text-text'
						: 'text-text-3 hover:text-text'}"
				>
					<Icon name="board" size={14} />
					{m.tasks_view_board()}
				</button>
			</div>

			<div class="h-5 w-px shrink-0 bg-border"></div>

			<FilterTrigger
				open={panelOpen}
				count={activeFilterCount}
				onclick={() => (panelOpen = !panelOpen)}
			/>
		{/if}

		<div class="relative ml-auto w-44 min-w-[132px] shrink">
			<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3">
				<Icon name="search" size={14} />
			</span>
			<input
				type="text"
				placeholder={m.tickets_search_placeholder()}
				value={search}
				oninput={(e) => setSearch((e.target as HTMLInputElement).value)}
				class="h-7 w-full rounded-lg border border-border bg-surface pr-2.5 pl-7 text-[14px] text-text outline-none placeholder:text-text-3 focus:border-border-strong"
			/>
		</div>
	</div>

	{#if canCreate}
		<div class="shrink-0">
			<Button variant="primary" size="sm" onclick={() => onNew?.()}>
				<Icon name="plus" size={14} />
				{m.tickets_new_title()}
			</Button>
		</div>
	{/if}
</div>

{#if !minimal}
	<ViewPanel
		open={panelOpen}
		onclose={() => (panelOpen = false)}
		title={m.view_options_title()}
		count={activeFilterCount}
	>
		<PanelSection title={m.view_layout()}>
			<div
				class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
			>
				<SelectRow
					label={m.tasks_group_by()}
					options={GROUP_OPTIONS}
					value={group}
					onchange={(g) => setGroup(g)}
				/>
				{#if view === 'board'}
					<SelectRow
						label={m.tasks_sub_group()}
						options={SUB_OPTIONS}
						value={sub}
						onchange={(s) => setSub?.(s)}
					/>
				{/if}
				<SortRow options={SORT_OPTIONS} value={sort} onchange={(s) => setSort?.(s)} />
			</div>
		</PanelSection>

		<FilterSection fields={FIELDS} {filters} {setFilters} {valueLabel} {valuesList} />
	</ViewPanel>
{/if}

<style>
	.tb-scroll {
		scrollbar-width: none;
	}
	.tb-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
