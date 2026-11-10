<script lang="ts">
	import Icon from '../Icon.svelte';
	import ViewsMenu from '../ViewsMenu.svelte';
	import type { SavedViewEntry } from '../ViewsMenu.svelte';
	import ViewPanel from '../view-panel/ViewPanel.svelte';
	import PanelSection from '../view-panel/PanelSection.svelte';
	import SelectRow from '../view-panel/SelectRow.svelte';
	import SortRow from '../view-panel/SortRow.svelte';
	import FilterTrigger from '../view-panel/FilterTrigger.svelte';
	import TaskFilterSection from '../tasks/TaskFilterSection.svelte';
	import { activeFilterCount, tagsInUse } from '$lib/utils/task-filters';
	import { m } from '$lib/paraglide/messages';
	import type { Task } from '$lib/types';
	import { DEFAULT_TASK_LIST_SORT, type TaskSort, type TaskSortBy } from '$lib/utils/sort';

	type GroupBy = 'status' | 'priority' | 'assignee' | 'none';

	export type ProjectTasksViewConfig = {
		group: GroupBy;
		filters: Record<string, string[]>;
		sort: TaskSort;
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
	const allTags = $derived(tagsInUse(tasks));

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

	let panelOpen = $state(false);
	const activeCount = $derived(activeFilterCount(filters));
</script>

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
	<FilterTrigger open={panelOpen} count={activeCount} onclick={() => (panelOpen = !panelOpen)} />

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
	count={activeCount}
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

	<TaskFilterSection
		{filters}
		{setFilters}
		fields={['status', 'priority', 'assignee', 'tags']}
		tags={allTags}
		unassigned={false}
	/>
</ViewPanel>
