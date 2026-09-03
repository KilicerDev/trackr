<script lang="ts">
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
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
	import { PROJECT_STATUS } from '$lib/config/taxonomy';
	import { projectStatusLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';
	import { page } from '$app/state';
	import { DEFAULT_PROJECT_SORT, type ProjectSort, type ProjectSortBy } from '$lib/utils/sort';

	type LayoutUser = { id: string; name: string; initials: string; color: string; status: string };

	export type ProjectView = 'grid' | 'list' | 'board';
	export type ProjectGroup = 'status' | 'org' | 'none';
	export type OrgOption = { id: string; name: string; slug: string; color: string };

	type ProjectsViewConfig = {
		view: ProjectView;
		gridGroup: ProjectGroup;
		listGroup: ProjectGroup;
		boardGroup: ProjectGroup;
		filters: Record<string, string[]>;
		sort: ProjectSort;
	};

	interface Props {
		view: ProjectView;
		setView: (v: ProjectView) => void;
		group: ProjectGroup;
		setGroup: (g: ProjectGroup) => void;
		filters: Record<string, string[]>;
		setFilters: (f: Record<string, string[]>) => void;
		search: string;
		setSearch: (s: string) => void;
		sort?: ProjectSort;
		setSort?: (s: ProjectSort) => void;
		orgs: OrgOption[];
		canCreate: boolean;
		onNew: () => void;
		viewsMenu?: {
			views: SavedViewEntry<ProjectsViewConfig>[];
			current: ProjectsViewConfig;
			onApply: (config: ProjectsViewConfig) => void;
			onChange: (views: SavedViewEntry<ProjectsViewConfig>[]) => void;
		};
	}
	let {
		view,
		setView,
		group,
		setGroup,
		filters,
		setFilters,
		search,
		setSearch,
		sort = DEFAULT_PROJECT_SORT,
		setSort,
		orgs,
		canCreate,
		onNew,
		viewsMenu
	}: Props = $props();

	// Sentinel value for projects with no organization (internal work).
	const INTERNAL = '__internal__';

	const GROUP_OPTIONS: { id: ProjectGroup; label: string }[] = $derived([
		{ id: 'status', label: m.projects_group_status() },
		{ id: 'org', label: m.projects_group_org() },
		{ id: 'none', label: m.projects_group_none() }
	]);
	const SORT_OPTIONS: { id: ProjectSortBy; label: string }[] = $derived([
		{ id: 'created', label: m.sort_created() },
		{ id: 'updated', label: m.sort_updated() },
		{ id: 'name', label: m.sort_name() }
	]);

	const FIELDS: FilterField[] = $derived([
		{ id: 'status', label: m.projects_filter_status(), icon: 'check' },
		{ id: 'org', label: m.projects_filter_org(), icon: 'org', searchable: true },
		{ id: 'assignee', label: m.projects_filter_assignee(), icon: 'users', searchable: true }
	]);

	const users = $derived((page.data as { users?: LayoutUser[] }).users ?? []);

	const VIEWS: { id: ProjectView; label: string; icon: string }[] = $derived([
		{ id: 'grid', label: m.projects_view_grid(), icon: 'grid' },
		{ id: 'list', label: m.projects_view_list(), icon: 'list' },
		{ id: 'board', label: m.projects_view_board(), icon: 'board' }
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

	function valueLabel(field: string, value: string): string {
		if (field === 'status')
			return PROJECT_STATUS[value as keyof typeof PROJECT_STATUS]
				? projectStatusLabel(value)
				: value;
		if (field === 'org') {
			if (value === INTERNAL) return m.projects_internal();
			return orgs.find((o) => o.id === value)?.name ?? value;
		}
		if (field === 'assignee') return users.find((u) => u.id === value)?.name ?? value;
		return value;
	}
</script>

{#snippet valuesList(field: string, query: string)}
	{@const values = filters[field] ?? []}
	{#if field === 'status'}
		{#each Object.entries(PROJECT_STATUS).filter( ([id]) => hit(projectStatusLabel(id), query) ) as [id, meta] (id)}
			<button
				type="button"
				onclick={() => toggleValue('status', id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={meta.color}></span>
				<span class="text-[14px]">{projectStatusLabel(id)}</span>
				<span class="ml-auto text-accent {values.includes(id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'org'}
		{#if hit(m.projects_internal(), query)}
			<button
				type="button"
				onclick={() => toggleValue('org', INTERNAL)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="text-text-3"><Icon name="org" size={14} /></span>
				<span class="text-[14px]">{m.projects_internal()}</span>
				<span class="ml-auto text-accent {values.includes(INTERNAL) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/if}
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
	{:else if field === 'assignee'}
		{#each users.filter((u) => u.status !== 'disabled' && hit(u.name, query)) as u (u.id)}
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
	{/if}
{/snippet}

<div class="flex shrink-0 items-center gap-2 border-b border-border bg-bg px-5 py-2.5">
	<!-- Controls strip: scrolls horizontally as a last resort on very narrow
	     widths instead of wrapping or squeezing. New project stays pinned outside. -->
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
		<!-- View toggle -->
		<div
			class="inline-flex h-7 shrink-0 items-center rounded-lg border border-border bg-surface p-0.5 text-[14px]"
		>
			{#each VIEWS as v (v.id)}
				<button
					type="button"
					onclick={() => setView(v.id)}
					class="inline-flex h-full items-center gap-1.5 rounded-md px-2 transition-colors {view ===
					v.id
						? 'bg-bg-elev text-text'
						: 'text-text-3 hover:text-text'}"
				>
					<Icon name={v.icon} size={14} />
					{v.label}
				</button>
			{/each}
		</div>

		<div class="h-5 w-px shrink-0 bg-border"></div>

		<FilterTrigger
			open={panelOpen}
			count={activeFilterCount}
			onclick={() => (panelOpen = !panelOpen)}
		/>

		<!-- Search stays compact and right-aligned (ml-auto eats the slack), but is
		     allowed to shrink as the toolbar narrows so the controls never squeeze
		     or wrap; past its min the whole strip scrolls instead. -->
		<div class="relative ml-auto w-44 min-w-[132px] shrink">
			<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3">
				<Icon name="search" size={14} />
			</span>
			<input
				type="text"
				placeholder={m.projects_search_placeholder()}
				value={search}
				oninput={(e) => setSearch((e.target as HTMLInputElement).value)}
				class="h-7 w-full rounded-lg border border-border bg-surface pr-2.5 pl-7 text-[14px] text-text outline-none placeholder:text-text-3 focus:border-border-strong"
			/>
		</div>
	</div>

	{#if canCreate}
		<div class="shrink-0">
			<Button variant="primary" size="sm" onclick={onNew}>
				<Icon name="plus" size={14} />
				{m.projects_new_project()}
			</Button>
		</div>
	{/if}
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

<style>
	/* Hide the controls-strip scrollbar; it only scrolls on very narrow widths. */
	.tb-scroll {
		scrollbar-width: none;
	}
	.tb-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
