<script lang="ts">
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import ViewsMenu from '../ViewsMenu.svelte';
	import type { SavedViewEntry } from '../ViewsMenu.svelte';
	import ViewPanel from '../view-panel/ViewPanel.svelte';
	import PanelSection from '../view-panel/PanelSection.svelte';
	import SelectRow from '../view-panel/SelectRow.svelte';
	import SortRow from '../view-panel/SortRow.svelte';
	import FilterTrigger from '../view-panel/FilterTrigger.svelte';
	import TaskFilterSection from './TaskFilterSection.svelte';
	import { activeFilterCount, tagsInUse } from '$lib/utils/task-filters';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import { DEFAULT_TASK_LIST_SORT, type TaskSort, type TaskSortBy } from '$lib/utils/sort';

	type LayoutData = { tasks?: { labels?: string[] }[] };

	// Every tag actually in use across the loaded tasks — the org-defined tag
	// vocabulary. Deduped.
	const allTags = $derived(tagsInUse((page.data as LayoutData).tasks ?? []));

	type GroupBy = 'status' | 'priority' | 'assignee' | 'project' | 'none';
	type SubBy = 'none' | 'status' | 'priority' | 'assignee';
	type TimeWindow = '7d' | '14d' | '30d' | '90d' | 'all';

	type TasksViewConfig = {
		view: 'list' | 'board';
		listGroup: GroupBy;
		boardGroup: GroupBy;
		sub: SubBy;
		filters: Record<string, string[]>;
		time: TimeWindow;
		listSort: TaskSort;
		boardSort: TaskSort;
	};

	interface Props {
		view: 'list' | 'board';
		setView: (v: 'list' | 'board') => void;
		filters: Record<string, string[]>;
		setFilters: (f: Record<string, string[]>) => void;
		search: string;
		setSearch: (s: string) => void;
		group?: GroupBy;
		setGroup?: (g: GroupBy) => void;
		sub?: SubBy;
		setSub?: (s: SubBy) => void;
		time?: TimeWindow;
		setTime?: (t: TimeWindow) => void;
		sort?: TaskSort;
		setSort?: (s: TaskSort) => void;
		onNewTask?: () => void;
		canCreate?: boolean;
		viewsMenu?: {
			views: SavedViewEntry<TasksViewConfig>[];
			current: TasksViewConfig;
			onApply: (config: TasksViewConfig) => void;
			onChange: (views: SavedViewEntry<TasksViewConfig>[]) => void;
		};
	}
	let {
		view,
		setView,
		filters,
		setFilters,
		search,
		setSearch,
		group = 'status',
		setGroup,
		sub = 'status',
		setSub,
		time = '30d',
		setTime,
		sort = DEFAULT_TASK_LIST_SORT,
		setSort,
		onNewTask,
		canCreate = true,
		viewsMenu
	}: Props = $props();

	const GROUP_OPTIONS: { id: GroupBy; label: () => string }[] = [
		{ id: 'status', label: m.tasks_group_status },
		{ id: 'priority', label: m.tasks_group_priority },
		{ id: 'assignee', label: m.tasks_group_assignee },
		{ id: 'project', label: m.tasks_group_project },
		{ id: 'none', label: m.common_none }
	];
	const SUB_OPTIONS: { id: SubBy; label: () => string }[] = [
		{ id: 'status', label: m.tasks_group_status },
		{ id: 'priority', label: m.tasks_group_priority },
		{ id: 'assignee', label: m.tasks_group_assignee },
		{ id: 'none', label: m.common_none }
	];
	const TIME_OPTIONS: { id: TimeWindow; label: () => string }[] = [
		{ id: '7d', label: m.tasks_time_next_7_days },
		{ id: '14d', label: m.tasks_time_next_2_weeks },
		{ id: '30d', label: m.tasks_time_next_month },
		{ id: '90d', label: m.tasks_time_next_3_months },
		{ id: 'all', label: m.common_all }
	];
	const SORT_OPTIONS: { id: TaskSortBy; label: () => string }[] = [
		{ id: 'due', label: m.sort_due },
		{ id: 'priority', label: m.sort_priority },
		{ id: 'updated', label: m.sort_updated },
		{ id: 'created', label: m.sort_created },
		{ id: 'title', label: m.sort_title }
	];
	// Message functions are read at render time so a locale switch re-labels.
	const opts = <T extends string>(list: { id: T; label: () => string }[]) =>
		list.map((o) => ({ id: o.id, label: o.label() }));

	let panelOpen = $state(false);
	const activeCount = $derived(activeFilterCount(filters));
</script>

<div class="flex shrink-0 items-center gap-2 border-b border-border bg-bg px-5 py-2.5">
	<!-- Controls strip: scrolls horizontally as a last resort on very narrow
	     widths instead of wrapping or squeezing. New task stays pinned outside. -->
	<div class="tb-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
		{#if viewsMenu}
			<ViewsMenu
				views={viewsMenu.views}
				current={viewsMenu.current}
				onApply={viewsMenu.onApply}
				onChange={viewsMenu.onChange}
			/>
			<div class="h-5 w-px shrink-0 bg-border"></div>
		{/if}
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

		<!-- Everything else (group, subgroup, sort, time, filters) lives in the
		     side panel this button opens. -->
		<FilterTrigger open={panelOpen} count={activeCount} onclick={() => (panelOpen = !panelOpen)} />

		<!-- Search stays compact and right-aligned (ml-auto eats the slack), but is
	     allowed to shrink as the toolbar narrows so the controls never squeeze
	     or wrap; past its min the whole strip scrolls instead. -->
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

	{#if canCreate}
		<div class="shrink-0">
			<Button variant="primary" size="sm" onclick={onNewTask}>
				<Icon name="plus" size={14} />
				{m.tasks_new_task()}
			</Button>
		</div>
	{/if}
</div>

<ViewPanel
	open={panelOpen}
	onclose={() => (panelOpen = false)}
	title={m.view_options_title()}
	count={activeCount}
>
	<PanelSection title={m.view_layout()}>
		<div class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			<SelectRow
				label={m.tasks_group_by()}
				options={opts(GROUP_OPTIONS)}
				value={group}
				onchange={(g) => setGroup?.(g)}
			/>
			{#if view === 'board'}
				<SelectRow
					label={m.tasks_sub_group()}
					options={opts(SUB_OPTIONS)}
					value={sub}
					onchange={(s) => setSub?.(s)}
				/>
			{/if}
			<SortRow options={opts(SORT_OPTIONS)} value={sort} onchange={(s) => setSort?.(s)} />
			<SelectRow
				label={m.tasks_time()}
				options={opts(TIME_OPTIONS)}
				value={time}
				onchange={(t) => setTime?.(t)}
			/>
		</div>
	</PanelSection>

	<TaskFilterSection {filters} {setFilters} tags={allTags} />
</ViewPanel>

<style>
	/* Hide the controls-strip scrollbar; it only scrolls on very narrow widths. */
	.tb-scroll {
		scrollbar-width: none;
	}
	.tb-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
