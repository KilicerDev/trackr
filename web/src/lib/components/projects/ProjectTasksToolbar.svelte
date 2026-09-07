<script lang="ts">
	import Icon from '../Icon.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import type { FilterField } from '../view-panel/FilterSection.svelte';
	import ViewsMenu from '../ViewsMenu.svelte';
	import type { SavedViewEntry } from '../ViewsMenu.svelte';
	import ViewPanel from '../view-panel/ViewPanel.svelte';
	import PanelSection from '../view-panel/PanelSection.svelte';
	import SelectRow from '../view-panel/SelectRow.svelte';
	import SortRow from '../view-panel/SortRow.svelte';
	import FilterSection from '../view-panel/FilterSection.svelte';
	import FilterTrigger from '../view-panel/FilterTrigger.svelte';
	import { TRACKR_PRIORITIES, TRACKR_STATUSES } from '$lib/config/taxonomy';
	import { labelMeta } from '$lib/utils/label-meta';
	import { page } from '$app/state';
	import { statusLabel, priorityLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';
	import type { Task } from '$lib/types';
	import { DEFAULT_TASK_LIST_SORT, type TaskSort, type TaskSortBy } from '$lib/utils/sort';

	type GroupBy = 'status' | 'priority' | 'assignee' | 'none';

	export type ProjectTasksViewConfig = {
		group: GroupBy;
		filters: Record<string, string[]>;
		sort: TaskSort;
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
	};

	// Lean sibling of the /tasks Toolbar for the project detail page: one
	// Filter button (opening the shared view panel with group, sort and
	// filters — no project field, the page IS the project) plus search.
	interface Props {
		tasks: Task[]; // unfiltered project tasks — drives the tag vocabulary
		filters: Record<string, string[]>;
		setFilters: (f: Record<string, string[]>) => void;
		search: string;
		setSearch: (s: string) => void;
		group: GroupBy;
		setGroup: (g: GroupBy) => void;
		sort?: TaskSort;
		setSort?: (s: TaskSort) => void;
		viewsMenu?: {
			views: SavedViewEntry<ProjectTasksViewConfig>[];
			current: ProjectTasksViewConfig;
			onApply: (config: ProjectTasksViewConfig) => void;
			onChange: (views: SavedViewEntry<ProjectTasksViewConfig>[]) => void;
		};
	}
	let {
		tasks,
		filters,
		setFilters,
		search,
		setSearch,
		group,
		setGroup,
		sort = DEFAULT_TASK_LIST_SORT,
		setSort,
		viewsMenu
	}: Props = $props();

	// Every tag actually in use across this project's tasks. Deduped.
	const allTags = $derived.by(() => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const t of tasks) {
			for (const l of t.labels ?? []) {
				if (!seen.has(l)) {
					seen.add(l);
					out.push(l);
				}
			}
		}
		return out;
	});

	const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
		{ id: 'status', label: m.tasks_group_status() },
		{ id: 'priority', label: m.tasks_group_priority() },
		{ id: 'assignee', label: m.tasks_group_assignee() },
		{ id: 'none', label: m.common_none() }
	];
	const SORT_OPTIONS: { id: TaskSortBy; label: string }[] = [
		{ id: 'due', label: m.sort_due() },
		{ id: 'priority', label: m.sort_priority() },
		{ id: 'updated', label: m.sort_updated() },
		{ id: 'created', label: m.sort_created() },
		{ id: 'title', label: m.sort_title() }
	];

	const FIELDS: FilterField[] = [
		{ id: 'status', label: m.tasks_group_status(), icon: 'check' },
		{ id: 'priority', label: m.tasks_group_priority(), icon: 'filter' },
		{ id: 'assignee', label: m.tasks_group_assignee(), icon: 'users', searchable: true },
		{ id: 'tags', label: m.tasks_tags(), icon: 'bookmark', searchable: true }
	];

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

	// Resolve a raw filter value to its label; falls back to the raw value.
	function valueLabel(field: string, value: string): string {
		if (field === 'status')
			return TRACKR_STATUSES.find((s) => s.id === value) ? statusLabel(value) : value;
		if (field === 'priority')
			return TRACKR_PRIORITIES.find((p) => p.id === value) ? priorityLabel(value) : value;
		if (field === 'assignee') {
			const u = ((page.data as LayoutData).users ?? []).find((x) => x.id === value);
			return u?.name ?? value;
		}
		if (field === 'tags') return labelMeta(value).label;
		return value;
	}
</script>

{#snippet valuesList(field: string, query: string)}
	{@const values = filters[field] ?? []}
	{#if field === 'status'}
		{#each TRACKR_STATUSES.filter((s) => hit(statusLabel(s.id), query)) as s (s.id)}
			<button
				type="button"
				onclick={() => toggleValue('status', s.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<StatusDot status={s.id} />
				<span class="text-[14px]">{statusLabel(s.id)}</span>
				<span class="ml-auto text-accent {values.includes(s.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'priority'}
		{#each TRACKR_PRIORITIES.filter((p) => hit(priorityLabel(p.id), query)) as p (p.id)}
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
	{:else if field === 'assignee'}
		{@const dbUsers = ((page.data as LayoutData).users ?? []).filter(
			(u) => u.internal && u.status !== 'disabled'
		)}
		{#each dbUsers.filter((u) => hit(u.name, query)) as u (u.id)}
			<button
				type="button"
				onclick={() => toggleValue('assignee', u.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<Avatar user={u} size={22} />
				<span class="text-[14px]">{u.name}</span>
				<span class="ml-auto text-accent {values.includes(u.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
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
	{/if}
{/snippet}

<div class="flex min-w-0 items-center gap-2">
	{#if viewsMenu}
		<ViewsMenu
			views={viewsMenu.views}
			current={viewsMenu.current}
			onApply={viewsMenu.onApply}
			onChange={viewsMenu.onChange}
		/>
		<div class="h-5 w-px shrink-0 bg-border"></div>
	{/if}
	<FilterTrigger
		open={panelOpen}
		count={activeFilterCount}
		onclick={() => (panelOpen = !panelOpen)}
	/>

	<div class="relative ml-auto w-44 min-w-[132px] shrink">
		<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3">
			<Icon name="search" size={14} />
		</span>
		<input
			type="text"
			placeholder={m.common_search()}
			value={search}
			oninput={(e) => setSearch((e.target as HTMLInputElement).value)}
			class="h-7 w-full rounded-lg border border-border bg-surface pr-2.5 pl-7 text-[14px] text-text outline-none placeholder:text-text-3 focus:border-border-strong"
		/>
	</div>
</div>

<ViewPanel
	open={panelOpen}
	onclose={() => (panelOpen = false)}
	title={m.view_options_title()}
	count={activeFilterCount}
>
	<PanelSection title={m.view_layout()}>
		<div class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			<SelectRow
				label={m.tasks_group_by()}
				options={GROUP_OPTIONS}
				value={group}
				onchange={(g) => setGroup(g)}
			/>
			<SortRow options={SORT_OPTIONS} value={sort} onchange={(s) => setSort?.(s)} />
		</div>
	</PanelSection>

	<FilterSection fields={FIELDS} {filters} {setFilters} {valueLabel} {valuesList} />
</ViewPanel>
