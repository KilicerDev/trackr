<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Toolbar from '$lib/components/tasks/Toolbar.svelte';
	import ListView from '$lib/components/tasks/ListView.svelte';
	import BoardView from '$lib/components/tasks/BoardView.svelte';
	import Inspector from '$lib/components/tasks/Inspector.svelte';
	import CreateTaskModal from '$lib/components/tasks/CreateTaskModal.svelte';
	import type { ProjectId, StatusId, Task } from '$lib/types';
	import type { PageData } from './$types';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { readView, saveView, flushViewSaves } from '$lib/stores/view';
	import type { SavedViewEntry } from '$lib/components/ViewsMenu.svelte';
	import { m } from '$lib/paraglide/messages';

	let { data }: { data: PageData } = $props();

	type GroupBy = 'status' | 'priority' | 'assignee' | 'project' | 'none';
	type SubGroup = 'none' | 'status' | 'priority' | 'assignee';
	type SavedTasksView = {
		view?: 'list' | 'board';
		listGroup?: GroupBy;
		boardGroup?: GroupBy;
		sub?: SubGroup;
		filters?: Record<string, string[]>;
		time?: TimeWindow;
		savedViews?: SavedViewEntry<TasksViewConfig>[];
	};
	type TasksViewConfig = {
		view: 'list' | 'board';
		listGroup: GroupBy;
		boardGroup: GroupBy;
		sub: SubGroup;
		filters: Record<string, string[]>;
		time: TimeWindow;
	};
	type TimeWindow = '7d' | '14d' | '30d' | '90d' | 'all';
	// localStorage cache wins over the server snapshot — it's mirrored on
	// every saveView() call so it always reflects the latest in-tab change,
	// even before the debounced server write has flushed.
	const saved: SavedTasksView = {
		...((data.savedView ?? {}) as SavedTasksView),
		...readView<SavedTasksView>('tasks')
	};
	const urlView = page.url.searchParams.get('view');

	// URL ?view= wins on first load (so links/bookmarks work) but doesn't
	// write back. Otherwise hydrate from saved state, then fall back to default.
	let view = $state<'list' | 'board'>(
		urlView === 'board' ? 'board' : urlView === 'list' ? 'list' : (saved.view ?? 'list')
	);
	let filters = $state<Record<string, string[]>>(saved.filters ?? {});
	let search = $state('');
	// Separate group state per view because their semantics differ:
	// list defaults to 'status' (vertical sections); board defaults to 'project' (columns)
	let listGroup = $state<GroupBy>(saved.listGroup ?? 'status');
	let boardGroup = $state<GroupBy>(saved.boardGroup ?? 'project');
	let group = $derived(view === 'list' ? listGroup : boardGroup);
	function setGroup(g: GroupBy) {
		if (view === 'list') {
			listGroup = g;
			saveView('tasks', { listGroup: g });
		} else {
			boardGroup = g;
			saveView('tasks', { boardGroup: g });
		}
	}
	function setView(v: 'list' | 'board') {
		view = v;
		saveView('tasks', { view: v });
	}
	function setFilters(f: Record<string, string[]>) {
		filters = f;
		saveView('tasks', { filters: f });
	}
	// Forward horizon for the Time filter. Past tasks always stay visible —
	// this only ever trims far-future scheduled items, defaulting to 30 days.
	let time = $state<TimeWindow>(saved.time ?? '30d');
	function setTime(t: TimeWindow) {
		time = t;
		saveView('tasks', { time: t });
	}
	const TIME_HORIZON_DAYS: Record<TimeWindow, number | null> = {
		'7d': 7,
		'14d': 14,
		'30d': 30,
		'90d': 90,
		all: null
	};
	let sub = $state<SubGroup>(saved.sub ?? 'status');
	function setSub(s: SubGroup) {
		sub = s;
		saveView('tasks', { sub: s });
	}

	// ── Saved custom views (named filter+layout presets) ─────────────────────
	const GROUP_IDS: GroupBy[] = ['status', 'priority', 'assignee', 'project', 'none'];
	const SUB_IDS: SubGroup[] = ['none', 'status', 'priority', 'assignee'];
	const isGroupBy = (v: unknown): v is GroupBy => GROUP_IDS.includes(v as GroupBy);
	const isSubGroup = (v: unknown): v is SubGroup => SUB_IDS.includes(v as SubGroup);
	let savedViews = $state<SavedViewEntry<TasksViewConfig>[]>(
		Array.isArray(saved.savedViews)
			? saved.savedViews.filter((v) => typeof v?.id === 'string' && typeof v?.name === 'string')
			: []
	);
	const currentConfig = $derived<TasksViewConfig>({
		view,
		listGroup,
		boardGroup,
		sub,
		filters,
		time
	});
	// Configs come from storage, so guard every field against page defaults —
	// a stale enum value must degrade gracefully, never break the page.
	function applySavedView(cfg: TasksViewConfig) {
		view = cfg.view === 'board' ? 'board' : 'list';
		listGroup = isGroupBy(cfg.listGroup) ? cfg.listGroup : 'status';
		boardGroup = isGroupBy(cfg.boardGroup) ? cfg.boardGroup : 'project';
		sub = isSubGroup(cfg.sub) ? cfg.sub : 'status';
		filters = cfg.filters && typeof cfg.filters === 'object' ? cfg.filters : {};
		time = cfg.time in TIME_HORIZON_DAYS ? cfg.time : '30d';
		// The applied view becomes the live state, so it survives a reload.
		saveView('tasks', { view, listGroup, boardGroup, sub, filters, time });
	}
	function changeSavedViews(next: SavedViewEntry<TasksViewConfig>[]) {
		savedViews = next;
		saveView('tasks', { savedViews: next });
		// CRUD is rare and explicit — flush immediately rather than risk losing
		// the debounced write to a quick navigation.
		flushViewSaves();
	}
	let manualSelectedId = $state<string | null>(null);
	let selected = $derived.by(() => {
		const id = manualSelectedId ?? page.url.searchParams.get('task');
		return id ? (data.tasks.find((t) => t.id === id) ?? null) : null;
	});

	// Closing must clear BOTH the manual selection and the `?task=` deep-link
	// param — otherwise a task opened from an external link (e.g. a meeting note)
	// stays stuck open because `selected` keeps reading the param.
	function closeInspector() {
		manualSelectedId = null;
		if (page.url.searchParams.has('task')) {
			const url = new URL(page.url);
			url.searchParams.delete('task');
			const qs = url.searchParams.toString();
			void goto(qs ? `?${qs}` : '?', { keepFocus: true, noScroll: true, replaceState: true });
		}
	}
	let creating = $state(false);
	let createPrefill = $state<{ project?: ProjectId; status?: StatusId } | undefined>(undefined);

	function openCreate(prefill?: { project?: ProjectId; status?: StatusId }) {
		createPrefill = prefill;
		creating = true;
	}

	// A task is in the window if the SOONEST of its dueDate / plannedFor falls
	// at or before the forward horizon. Past dates always pass; undated tasks
	// (no dueDate and no plannedFor) always show — they're backlog, not future.
	function withinWindow(t: Task): boolean {
		const days = TIME_HORIZON_DAYS[time];
		if (days == null) return true;
		const candidates: number[] = [];
		for (const v of [t.due, t.plannedFor]) {
			if (!v) continue;
			const ms = new Date(v).getTime();
			if (!Number.isNaN(ms)) candidates.push(ms);
		}
		if (candidates.length === 0) return true;
		const horizon = new Date();
		horizon.setHours(23, 59, 59, 999);
		horizon.setDate(horizon.getDate() + days);
		return Math.min(...candidates) <= horizon.getTime();
	}

	function matches(t: Task): boolean {
		if (!withinWindow(t)) return false;
		for (const [field, values] of Object.entries(filters)) {
			if (values.length === 0) continue;
			if (field === 'status' && !values.includes(t.status)) return false;
			if (field === 'priority' && !values.includes(t.priority)) return false;
			if (field === 'assignee') {
				const assignees = t.assignees ?? [t.assignee];
				if (!assignees.some((a) => values.includes(a))) return false;
			}
			if (field === 'project' && !values.includes(t.project)) return false;
			if (field === 'tags' && !t.labels.some((l) => values.includes(l))) return false;
		}
		if (search) {
			const q = search.toLowerCase();
			if (!t.title.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) return false;
		}
		return true;
	}

	let tasks = $derived(data.tasks.filter(matches));
	const canCreate = $derived((data.effectivePermissions ?? []).includes('project.tasks.create'));
</script>

<svelte:head><title>Trackr · {m.tasks_title()}</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: m.tasks_title() }]} />
<Toolbar
	{view}
	{setView}
	{filters}
	{setFilters}
	{search}
	setSearch={(s) => (search = s)}
	{group}
	{setGroup}
	{sub}
	{setSub}
	{time}
	{setTime}
	onNewTask={() => openCreate()}
	{canCreate}
	viewsMenu={{
		views: savedViews,
		current: currentConfig,
		onApply: applySavedView,
		onChange: changeSavedViews
	}}
/>

{#if view === 'list'}
	<ListView
		{tasks}
		{group}
		persistKey="tasks"
		onSelect={(t) => (manualSelectedId = t.id)}
		selectedId={selected?.id}
		onAddInProject={(pid) => openCreate({ project: pid })}
	/>
{:else}
	<BoardView
		{tasks}
		group={boardGroup}
		persistKey="tasks"
		{sub}
		onSelect={(t) => (manualSelectedId = t.id)}
		onAddInProject={(pid, statusId) => openCreate({ project: pid, status: statusId })}
	/>
{/if}

<Inspector task={selected} onclose={closeInspector} users={data.users} />

<CreateTaskModal
	open={creating}
	prefill={createPrefill}
	onclose={() => (creating = false)}
	users={data.users}
	projects={data.projects}
	currentUserId={data.currentUserId}
	memberProjectIds={Object.keys(data.memberRoles.projects)}
	allAccess={data.isTrackrTeam}
/>
