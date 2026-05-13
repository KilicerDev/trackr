<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Toolbar from '$lib/components/tasks/Toolbar.svelte';
	import ListView from '$lib/components/tasks/ListView.svelte';
	import BoardView from '$lib/components/tasks/BoardView.svelte';
	import Inspector from '$lib/components/tasks/Inspector.svelte';
	import CreateTaskModal from '$lib/components/tasks/CreateTaskModal.svelte';
	import { TRACKR_TASKS } from '$lib/data';
	import type { ProjectId, StatusId, Task } from '$lib/types';
	import { page } from '$app/state';

	let view = $state<'list' | 'board'>(
		page.url.searchParams.get('view') === 'board' ? 'board' : 'list'
	);
	let filters = $state<Record<string, string[]>>({});
	let search = $state('');
	// Separate group state per view because their semantics differ:
	// list defaults to 'status' (vertical sections); board defaults to 'project' (columns)
	let listGroup = $state<'status' | 'priority' | 'assignee' | 'project' | 'none'>('status');
	let boardGroup = $state<'status' | 'priority' | 'assignee' | 'project' | 'none'>('project');
	let group = $derived(view === 'list' ? listGroup : boardGroup);
	function setGroup(g: 'status' | 'priority' | 'assignee' | 'project' | 'none') {
		if (view === 'list') listGroup = g;
		else boardGroup = g;
	}
	let sub = $state<'none' | 'status' | 'priority' | 'assignee'>('status');
	let urlSelected = $derived.by(() => {
		const id = page.url.searchParams.get('task');
		return id ? TRACKR_TASKS.find((t) => t.id === id) ?? null : null;
	});
	let manualSelected = $state<Task | null>(null);
	let selected = $derived(manualSelected ?? urlSelected);
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

	let tasks = $derived(TRACKR_TASKS.filter(matches));
</script>

<svelte:head><title>Trackr · Tasks</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Tasks' }]} />
<Toolbar
	{view}
	setView={(v) => (view = v)}
	{filters}
	setFilters={(f) => (filters = f)}
	{search}
	setSearch={(s) => (search = s)}
	{group}
	{setGroup}
	{sub}
	setSub={(s) => (sub = s)}
	onNewTask={() => openCreate()}
/>

{#if view === 'list'}
	<ListView {tasks} {group} onSelect={(t) => (manualSelected = t)} selectedId={selected?.id} />
{:else}
	<BoardView
		{tasks}
		group={boardGroup}
		{sub}
		onSelect={(t) => (manualSelected = t)}
		onAddInProject={(pid, statusId) => openCreate({ project: pid, status: statusId })}
	/>
{/if}

<Inspector task={selected} onclose={() => (manualSelected = null)} />

<CreateTaskModal open={creating} prefill={createPrefill} onclose={() => (creating = false)} />
