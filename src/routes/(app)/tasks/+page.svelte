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
	import { saveView } from '$lib/viewState';

	let { data }: { data: PageData } = $props();

	type GroupBy = 'status' | 'priority' | 'assignee' | 'project' | 'none';
	type SubGroup = 'none' | 'status' | 'priority' | 'assignee';
	type SavedTasksView = {
		view?: 'list' | 'board';
		listGroup?: GroupBy;
		boardGroup?: GroupBy;
		sub?: SubGroup;
		filters?: Record<string, string[]>;
	};
	const saved = ((data.preferences?.viewState as Record<string, unknown> | undefined)?.tasks ??
		{}) as SavedTasksView;
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
	let sub = $state<SubGroup>(saved.sub ?? 'status');
	function setSub(s: SubGroup) {
		sub = s;
		saveView('tasks', { sub: s });
	}
	let manualSelectedId = $state<string | null>(null);
	let selected = $derived.by(() => {
		const id = manualSelectedId ?? page.url.searchParams.get('task');
		return id ? data.tasks.find((t) => t.id === id) ?? null : null;
	});
	let creating = $state(false);
	let createPrefill = $state<{ project?: ProjectId; status?: StatusId } | undefined>(undefined);

	function openCreate(prefill?: { project?: ProjectId; status?: StatusId }) {
		createPrefill = prefill;
		creating = true;
	}

	function matches(t: Task): boolean {
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
	const canCreate = $derived(
		(data.effectivePermissions ?? []).includes('project.tasks.create')
	);
</script>

<svelte:head><title>Trackr · Tasks</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Tasks' }]} />
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
	onNewTask={() => openCreate()}
	{canCreate}
/>

{#if view === 'list'}
	<ListView {tasks} {group} onSelect={(t) => (manualSelectedId = t.id)} selectedId={selected?.id} />
{:else}
	<BoardView
		{tasks}
		group={boardGroup}
		{sub}
		onSelect={(t) => (manualSelectedId = t.id)}
		onAddInProject={(pid, statusId) => openCreate({ project: pid, status: statusId })}
	/>
{/if}

<Inspector task={selected} onclose={() => (manualSelectedId = null)} users={data.users} />

<CreateTaskModal
	open={creating}
	prefill={createPrefill}
	onclose={() => (creating = false)}
	users={data.users}
	projects={data.projects}
	currentUserId={data.currentUserId}
/>
