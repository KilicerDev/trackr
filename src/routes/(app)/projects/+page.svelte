<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ProjectCard from '$lib/components/projects/ProjectCard.svelte';
	import ProjectsToolbar from '$lib/components/projects/ProjectsToolbar.svelte';
	import ProjectsBoard from '$lib/components/projects/ProjectsBoard.svelte';
	import type { BoardColumn } from '$lib/components/projects/ProjectsBoard.svelte';
	import type { ProjectView, ProjectGroup } from '$lib/components/projects/ProjectsToolbar.svelte';
	import CreateProjectModal from '$lib/components/projects/CreateProjectModal.svelte';
	import { PROJECT_STATUS } from '$lib/data';
	import { showToast } from '$lib/toast.svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { readView, saveView } from '$lib/viewState';
	import type { ProjectListItem } from './+page.server';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const INTERNAL = '__internal__';

	type SavedProjectsView = {
		view?: ProjectView;
		gridGroup?: ProjectGroup;
		listGroup?: ProjectGroup;
		boardGroup?: ProjectGroup;
		filters?: Record<string, string[]>;
	};
	const saved: SavedProjectsView = {
		...((data.savedView ?? {}) as SavedProjectsView),
		...readView<SavedProjectsView>('projects')
	};

	let view = $state<ProjectView>(saved.view ?? 'grid');
	let filters = $state<Record<string, string[]>>(saved.filters ?? {});
	let search = $state('');
	// Separate group per view, mirroring the /tasks pattern. Grid defaults to
	// 'none' so its default look stays a flat gallery.
	let gridGroup = $state<ProjectGroup>(saved.gridGroup ?? 'none');
	let listGroup = $state<ProjectGroup>(saved.listGroup ?? 'status');
	let boardGroup = $state<ProjectGroup>(saved.boardGroup ?? 'status');
	let group = $derived(view === 'board' ? boardGroup : view === 'grid' ? gridGroup : listGroup);

	function setView(v: ProjectView) {
		view = v;
		saveView('projects', { view: v });
	}
	function setGroup(g: ProjectGroup) {
		if (view === 'board') {
			boardGroup = g;
			saveView('projects', { boardGroup: g });
		} else if (view === 'grid') {
			gridGroup = g;
			saveView('projects', { gridGroup: g });
		} else {
			listGroup = g;
			saveView('projects', { listGroup: g });
		}
	}
	function setFilters(f: Record<string, string[]>) {
		filters = f;
		saveView('projects', { filters: f });
	}

	let createOpen = $state(false);
	const canCreate = $derived((data.effectivePermissions ?? []).includes('project.create'));

	const sourceProjects = $derived(data.projectsList);

	function matches(p: ProjectListItem): boolean {
		const statusF = filters.status ?? [];
		if (statusF.length && !statusF.includes(p.status)) return false;
		const orgF = filters.org ?? [];
		if (orgF.length && !orgF.includes(p.org?.id ?? INTERNAL)) return false;
		const assigneeF = filters.assignee ?? [];
		if (assigneeF.length && !p.members.some((m) => assigneeF.includes(m.id))) return false;
		if (search) {
			const q = search.toLowerCase();
			if (!p.name.toLowerCase().includes(q) && !p.key.toLowerCase().includes(q)) return false;
		}
		return true;
	}

	const visibleProjects = $derived(sourceProjects.filter(matches));

	// Grouped columns shared by the list (sections) and board (columns) views.
	const columns = $derived.by<BoardColumn[]>(() => {
		if (group === 'status') {
			return Object.entries(PROJECT_STATUS).map(([id, meta]) => ({
				key: id,
				label: meta.label,
				color: meta.color,
				projects: visibleProjects.filter((p) => p.status === id)
			}));
		}
		if (group === 'org') {
			const cols: BoardColumn[] = data.orgs.map((o) => ({
				key: o.id,
				label: o.name,
				color: o.color,
				projects: visibleProjects.filter((p) => p.org?.id === o.id)
			}));
			cols.push({
				key: INTERNAL,
				label: 'Internal',
				color: '#9aa4b2',
				projects: visibleProjects.filter((p) => !p.org)
			});
			return cols;
		}
		return [{ key: 'all', label: 'All projects', color: '#7a9cf0', projects: visibleProjects }];
	});

	// Board shows every column (incl. empty) for stable layout; list hides empties.
	const listColumns = $derived(columns.filter((c) => c.projects.length > 0));

	// Collapsed group sections (grid + list). Keyed by group column key, so the
	// same group stays collapsed across the two grouped views. Local state —
	// resets on reload, like the tasks board.
	let collapsed = $state(new Set<string>());
	function toggleCollapsed(key: string) {
		const next = new Set(collapsed);
		next.has(key) ? next.delete(key) : next.add(key);
		collapsed = next;
	}
</script>

<svelte:head><title>Trackr · Projects</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Projects' }]} />

<ProjectsToolbar
	{view}
	{setView}
	{group}
	{setGroup}
	{filters}
	{setFilters}
	{search}
	setSearch={(s) => (search = s)}
	orgs={data.orgs}
	{canCreate}
	onNew={() => (createOpen = true)}
/>

{#if visibleProjects.length === 0}
	<div class="flex-1 min-h-0 overflow-y-auto px-6 py-6">
		{#if Object.keys(filters).length === 0 && !search}
			<div class="border border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-3 py-20">
				<div class="w-12 h-12 grid place-items-center rounded-xl bg-surface border border-border text-text-3">
					<Icon name="folder" size={20} />
				</div>
				<div class="text-[15px] font-semibold text-text">No projects yet</div>
				<div class="text-[12.5px] text-text-3 max-w-[320px] text-center">
					Projects group related tasks and tickets. Create your first one to get started.
				</div>
				{#if canCreate}
					<Button variant="primary" size="sm" onclick={() => (createOpen = true)}>
						<Icon name="plus" size={13} /> Create a project
					</Button>
				{/if}
			</div>
		{:else}
			<div class="border border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-2 py-16 text-text-3">
				<div class="w-10 h-10 grid place-items-center rounded-xl bg-surface border border-border">
					<Icon name="folder" size={16} />
				</div>
				<div class="text-[13.5px] font-medium text-text">No matching projects</div>
				<div class="text-[11.5px] text-text-4">Try clearing filters or search.</div>
			</div>
		{/if}
	</div>
{:else if view === 'board'}
	<ProjectsBoard {columns} />
{:else if view === 'grid'}
	<div class="flex-1 min-h-0 overflow-y-auto px-6 py-6">
		{#if group === 'none'}
			<div class="grid gap-4" style:grid-template-columns="repeat(auto-fill, minmax(340px, 1fr))">
				{#each visibleProjects as p (p.id)}
					<ProjectCard project={p} />
				{/each}
				{#if canCreate && Object.keys(filters).length === 0 && !search}
					<button
						type="button"
						onclick={() => (createOpen = true)}
						class="border border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-2 py-12 text-text-3 hover:text-text hover:border-border-strong transition-colors"
					>
						<div class="w-10 h-10 grid place-items-center rounded-xl bg-surface border border-border">
							<Icon name="plus" size={16} />
						</div>
						<div class="text-[13.5px] font-medium">New project</div>
						<div class="text-[11.5px] text-text-4">Start a workspace from scratch</div>
					</button>
				{/if}
			</div>
		{:else}
			<div class="space-y-7">
				{#each listColumns as col (col.key)}
					{@const isCollapsed = collapsed.has(col.key)}
					<section>
						<button
							type="button"
							onclick={() => toggleCollapsed(col.key)}
							class="flex items-center gap-2 mb-3 w-full text-left group/hdr"
						>
							<span class="text-text-4 transition-transform {isCollapsed ? '-rotate-90' : ''}">
								<Icon name="chevron" size={12} />
							</span>
							<span class="w-2 h-2 rounded-full" style:background={col.color}></span>
							<h2 class="text-[13px] font-semibold text-text">{col.label}</h2>
							<span class="font-mono text-[11px] text-text-3">{col.projects.length}</span>
						</button>
						{#if !isCollapsed}
							<div class="grid gap-4" style:grid-template-columns="repeat(auto-fill, minmax(340px, 1fr))">
								{#each col.projects as p (p.id)}
									<ProjectCard project={p} />
								{/each}
							</div>
						{/if}
					</section>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<!-- list -->
	<div class="flex-1 min-h-0 overflow-y-auto px-6 py-6">
		<div class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
			<div
				class="grid items-center gap-3 px-5 py-2.5 text-[11px] uppercase tracking-[0.08em] text-text-4 border-b border-border"
				style:grid-template-columns="1.5fr 1fr 1fr 0.6fr 1fr"
			>
				<span>Project</span>
				<span>Lead</span>
				<span>Status</span>
				<span>Key</span>
				<span>Updated</span>
			</div>
			{#each (group === 'none' ? [{ key: 'all', label: '', color: '', projects: visibleProjects }] : listColumns) as col (col.key)}
				{@const isCollapsed = collapsed.has(col.key)}
				{#if col.label}
					<button
						type="button"
						onclick={() => toggleCollapsed(col.key)}
						class="w-full flex items-center gap-2 px-5 py-2 bg-surface/30 border-b border-border text-left hover:bg-surface/50 transition-colors"
					>
						<span class="text-text-4 transition-transform {isCollapsed ? '-rotate-90' : ''}">
							<Icon name="chevron" size={11} />
						</span>
						<span class="w-2 h-2 rounded-full" style:background={col.color}></span>
						<span class="text-[12px] font-semibold text-text">{col.label}</span>
						<span class="font-mono text-[11px] text-text-3">{col.projects.length}</span>
					</button>
				{/if}
				{#if !isCollapsed}
					<div transition:slide={{ duration: 180, easing: cubicOut }}>
						{#each col.projects as p (p.id)}
							{@const st = PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS] ?? PROJECT_STATUS.active}
							<a
								href="/projects/{p.id}"
								class="grid items-center gap-3 px-5 py-3 hover:bg-[var(--row-hover)] transition-colors text-[13px]"
								style:grid-template-columns="1.5fr 1fr 1fr 0.6fr 1fr"
							>
								<span class="flex items-center gap-2.5 min-w-0">
									<span
										class="w-7 h-7 rounded-md grid place-items-center text-white font-semibold text-[12px] shrink-0"
										style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color} 70%, #000) 85%)"
									>{p.icon}</span>
									<span class="truncate font-medium">{p.name}</span>
								</span>
								<span class="text-text-2 truncate">{p.lead?.name ?? '—'}</span>
								<span class="inline-flex items-center gap-1.5 text-text-2">
									<span class="w-1.5 h-1.5 rounded-full" style:background={st.color}></span>
									{st.label}
								</span>
								<span class="font-mono text-text-3">{p.key}</span>
								<span class="text-text-3">{p.updatedAt.toISOString().slice(0, 10)}</span>
							</a>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	</div>
{/if}

<CreateProjectModal
	open={createOpen}
	onclose={() => (createOpen = false)}
	orgs={data.orgs}
	oncreated={(name) => showToast('ok', `Created ${name}.`)}
	onerror={(msg) => showToast('err', msg)}
/>
