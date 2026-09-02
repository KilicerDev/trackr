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
	import ProjectHistory, {
		type ActivityItem
	} from '$lib/components/projects/ProjectHistory.svelte';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import { PROJECT_STATUS } from '$lib/config/taxonomy';
	import { projectStatusLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';
	import { showToast } from '$lib/stores/toast.svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { readView, saveView, flushViewSaves } from '$lib/stores/view';
	import type { SavedViewEntry } from '$lib/components/ViewsMenu.svelte';
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
		savedViews?: SavedViewEntry<ProjectsViewConfig>[];
	};
	type ProjectsViewConfig = {
		view: ProjectView;
		gridGroup: ProjectGroup;
		listGroup: ProjectGroup;
		boardGroup: ProjectGroup;
		filters: Record<string, string[]>;
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

	// ── Saved custom views (named filter+layout presets) ─────────────────────
	const VIEW_IDS: ProjectView[] = ['grid', 'list', 'board'];
	const GROUP_IDS: ProjectGroup[] = ['status', 'org', 'none'];
	const isProjectView = (v: unknown): v is ProjectView => VIEW_IDS.includes(v as ProjectView);
	const isProjectGroup = (v: unknown): v is ProjectGroup => GROUP_IDS.includes(v as ProjectGroup);
	let savedViews = $state<SavedViewEntry<ProjectsViewConfig>[]>(
		Array.isArray(saved.savedViews)
			? saved.savedViews.filter((v) => typeof v?.id === 'string' && typeof v?.name === 'string')
			: []
	);
	const currentConfig = $derived<ProjectsViewConfig>({
		view,
		gridGroup,
		listGroup,
		boardGroup,
		filters
	});
	// Configs come from storage, so guard every field against page defaults —
	// a stale enum value must degrade gracefully, never break the page.
	function applySavedView(cfg: ProjectsViewConfig) {
		view = isProjectView(cfg.view) ? cfg.view : 'grid';
		gridGroup = isProjectGroup(cfg.gridGroup) ? cfg.gridGroup : 'none';
		listGroup = isProjectGroup(cfg.listGroup) ? cfg.listGroup : 'status';
		boardGroup = isProjectGroup(cfg.boardGroup) ? cfg.boardGroup : 'status';
		filters = cfg.filters && typeof cfg.filters === 'object' ? cfg.filters : {};
		// The applied view becomes the live state, so it survives a reload.
		saveView('projects', { view, gridGroup, listGroup, boardGroup, filters });
	}
	function changeSavedViews(next: SavedViewEntry<ProjectsViewConfig>[]) {
		savedViews = next;
		saveView('projects', { savedViews: next });
		// CRUD is rare and explicit — flush immediately rather than risk losing
		// the debounced write to a quick navigation.
		flushViewSaves();
	}

	let createOpen = $state(false);

	// ── In-place history drawer (weekly-review flow) ─────────────────────────
	// Opens a project's activity feed from the row/card without leaving the
	// list; the drawer's own load-more/comment calls go to the project detail
	// route's actions via actionBase.
	let historyProject = $state<ProjectListItem | null>(null);
	let historyActivity = $state<ActivityItem[]>([]);

	async function fetchActivityPage(projectId: string): Promise<ActivityItem[]> {
		const fd = new FormData();
		fd.append('offset', '0');
		const res = await fetch(`/projects/${projectId}?/activity`, {
			method: 'POST',
			body: fd,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await res.text()) as ActionResult;
		if (result.type !== 'success') throw new Error('activity fetch failed');
		return (result.data as { items?: ActivityItem[] } | undefined)?.items ?? [];
	}

	async function openHistory(p: ProjectListItem) {
		historyProject = p;
		historyActivity = [];
		try {
			const items = await fetchActivityPage(p.id);
			// Ignore if the user already switched to another project's history.
			if (historyProject?.id === p.id) historyActivity = items;
		} catch {
			showToast('err', m.projects_load_more_failed());
		}
	}

	async function refreshHistory() {
		const id = historyProject?.id;
		if (!id) return;
		try {
			const items = await fetchActivityPage(id);
			if (historyProject?.id === id) historyActivity = items;
		} catch {
			/* keep the stale feed — the comment itself was saved */
		}
	}
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
				label: projectStatusLabel(id),
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
				label: m.projects_internal(),
				color: '#9aa4b2',
				projects: visibleProjects.filter((p) => !p.org)
			});
			return cols;
		}
		return [
			{ key: 'all', label: m.projects_all_projects(), color: '#7a9cf0', projects: visibleProjects }
		];
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

<svelte:head><title>{m.projects_page_title()}</title></svelte:head>

<Topbar
	crumbs={[
		{ label: m.projects_breadcrumb_workspace(), href: '/tasks' },
		{ label: m.projects_breadcrumb_projects() }
	]}
/>

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
	viewsMenu={{
		views: savedViews,
		current: currentConfig,
		onApply: applySavedView,
		onChange: changeSavedViews
	}}
/>

{#if visibleProjects.length === 0}
	<div class="min-h-0 flex-1 overflow-y-auto px-6 py-6">
		{#if Object.keys(filters).length === 0 && !search}
			<div
				class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-20"
			>
				<div
					class="grid h-12 w-12 place-items-center rounded-xl border border-border bg-surface text-text-3"
				>
					<Icon name="folder" size={22} />
				</div>
				<div class="text-[15px] font-semibold text-text">{m.projects_empty_title()}</div>
				<div class="max-w-[352px] text-center text-[14px] text-text-3">
					{m.projects_empty_hint()}
				</div>
				{#if canCreate}
					<Button variant="primary" size="sm" onclick={() => (createOpen = true)}>
						<Icon name="plus" size={14} />
						{m.projects_create_project()}
					</Button>
				{/if}
			</div>
		{:else}
			<div
				class="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-16 text-text-3"
			>
				<div class="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface">
					<Icon name="folder" size={17} />
				</div>
				<div class="text-[14px] font-medium text-text">{m.projects_no_matching_title()}</div>
				<div class="text-[12px] text-text-4">{m.projects_no_matching_hint()}</div>
			</div>
		{/if}
	</div>
{:else if view === 'board'}
	<ProjectsBoard {columns} onhistory={openHistory} />
{:else if view === 'grid'}
	<div class="min-h-0 flex-1 overflow-y-auto px-6 py-6">
		{#if group === 'none'}
			<div class="grid gap-4" style:grid-template-columns="repeat(auto-fill, minmax(340px, 1fr))">
				{#each visibleProjects as p (p.id)}
					<ProjectCard project={p} onhistory={() => openHistory(p)} />
				{/each}
				{#if canCreate && Object.keys(filters).length === 0 && !search}
					<button
						type="button"
						onclick={() => (createOpen = true)}
						class="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-12 text-text-3 transition-colors hover:border-border-strong hover:text-text"
					>
						<div
							class="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface"
						>
							<Icon name="plus" size={17} />
						</div>
						<div class="text-[14px] font-medium">{m.projects_new_project()}</div>
						<div class="text-[12px] text-text-4">{m.projects_new_project_card_hint()}</div>
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
							class="group/hdr mb-3 flex w-full items-center gap-2 text-left"
						>
							<span class="text-text-4 transition-transform {isCollapsed ? '-rotate-90' : ''}">
								<Icon name="chevron" size={13} />
							</span>
							<span class="h-2 w-2 rounded-full" style:background={col.color}></span>
							<h2 class="text-[14px] font-semibold text-text">{col.label}</h2>
							<span class="font-mono text-[12px] text-text-3">{col.projects.length}</span>
						</button>
						{#if !isCollapsed}
							<div
								class="grid gap-4"
								style:grid-template-columns="repeat(auto-fill, minmax(340px, 1fr))"
							>
								{#each col.projects as p (p.id)}
									<ProjectCard project={p} onhistory={() => openHistory(p)} />
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
	<div class="min-h-0 flex-1 overflow-y-auto px-6 py-6">
		<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
			<div
				class="grid grid-cols-[1.5fr_1fr_28px] items-center gap-3 border-b border-border px-5 py-2.5 text-[12px] tracking-[0.08em] text-text-4 uppercase md:grid-cols-[1.5fr_1fr_1fr_0.6fr_1fr_28px]"
			>
				<span>{m.projects_col_project()}</span>
				<span class="hidden md:block">{m.projects_col_lead()}</span>
				<span>{m.projects_col_status()}</span>
				<span class="hidden md:block">{m.projects_col_key()}</span>
				<span class="hidden md:block">{m.projects_col_updated()}</span>
				<span></span>
			</div>
			{#each group === 'none' ? [{ key: 'all', label: '', color: '', projects: visibleProjects }] : listColumns as col (col.key)}
				{@const isCollapsed = collapsed.has(col.key)}
				{#if col.label}
					<button
						type="button"
						onclick={() => toggleCollapsed(col.key)}
						class="flex w-full items-center gap-2 border-b border-border bg-surface/30 px-5 py-2 text-left transition-colors hover:bg-surface/50"
					>
						<span class="text-text-4 transition-transform {isCollapsed ? '-rotate-90' : ''}">
							<Icon name="chevron" size={12} />
						</span>
						<span class="h-2 w-2 rounded-full" style:background={col.color}></span>
						<span class="text-[13px] font-semibold text-text">{col.label}</span>
						<span class="font-mono text-[12px] text-text-3">{col.projects.length}</span>
					</button>
				{/if}
				{#if !isCollapsed}
					<div transition:slide={{ duration: 180, easing: cubicOut }}>
						{#each col.projects as p (p.id)}
							{@const st =
								PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS] ?? PROJECT_STATUS.active}
							<a
								href="/projects/{p.id}"
								class="grid grid-cols-[1.5fr_1fr_28px] items-center gap-3 px-5 py-3 text-[14px] transition-colors hover:bg-[var(--row-hover)] md:grid-cols-[1.5fr_1fr_1fr_0.6fr_1fr_28px]"
							>
								<span class="flex min-w-0 items-center gap-2.5">
									<span
										class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] font-semibold text-white"
										style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color}
										70%, #000) 85%)">{p.icon}</span
									>
									<span class="truncate font-medium">{p.name}</span>
								</span>
								<span class="hidden truncate text-text-2 md:block">{p.lead?.name ?? '—'}</span>
								<span class="inline-flex items-center gap-1.5 text-text-2">
									<span class="h-1.5 w-1.5 rounded-full" style:background={st.color}></span>
									{projectStatusLabel(p.status)}
								</span>
								<span class="hidden font-mono text-text-3 md:block">{p.key}</span>
								<span class="hidden text-text-3 md:block"
									>{p.updatedAt.toISOString().slice(0, 10)}</span
								>
								<button
									type="button"
									aria-label={m.projects_aria_history()}
									title={m.projects_aria_history()}
									onclick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										void openHistory(p);
									}}
									class="grid h-7 w-7 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
								>
									<Icon name="logs" size={14} />
								</button>
							</a>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	</div>
{/if}

<ProjectHistory
	open={historyProject != null}
	onclose={() => (historyProject = null)}
	activity={historyActivity}
	projectId={historyProject?.id ?? null}
	actionBase={historyProject ? `/projects/${historyProject.id}` : ''}
	oncommented={refreshHistory}
/>

<CreateProjectModal
	open={createOpen}
	onclose={() => (createOpen = false)}
	orgs={data.orgs}
	templates={data.templates}
	oncreated={(name) => showToast('ok', m.projects_created_toast({ name }))}
	onerror={(msg) => showToast('err', msg)}
/>
