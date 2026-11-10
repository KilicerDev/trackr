<script lang="ts">
	import { brandName } from '$lib/brand';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Inspector from '$lib/components/tasks/Inspector.svelte';
	import ListView from '$lib/components/tasks/ListView.svelte';
	import CreateTaskModal from '$lib/components/tasks/CreateTaskModal.svelte';
	import EditProjectModal from '$lib/components/projects/EditProjectModal.svelte';
	import ImportTasksModal from '$lib/components/projects/ImportTasksModal.svelte';
	import ProjectTasksToolbar from '$lib/components/projects/ProjectTasksToolbar.svelte';
	import type { ProjectTasksViewConfig } from '$lib/components/projects/ProjectTasksToolbar.svelte';
	import type { SavedViewEntry } from '$lib/components/ViewsMenu.svelte';
	import { readView, saveView, flushViewSaves } from '$lib/stores/view';
	import { DEFAULT_TASK_LIST_SORT, isTaskSort, type TaskSort } from '$lib/utils/sort';
	import ProjectHistory from '$lib/components/projects/ProjectHistory.svelte';
	import NewMeetingDialog from '$lib/components/notes/NewMeetingDialog.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import SectionHeader from '$lib/components/tasks/panel/SectionHeader.svelte';
	import { ICON_ACTION, OPEN, QUIET_ADD, ROW, TAG } from '$lib/components/tasks/panel/styles';
	import { labelMeta } from '$lib/utils/label-meta';
	import TagsPopover from '$lib/components/popovers/TagsPopover.svelte';
	import { PROJECT_STATUS } from '$lib/config/taxonomy';
	import { projectStatusLabel } from '$lib/utils/labels';
	import { isClosedStatus } from '$lib/utils/task';
	import { matchesTaskFilters } from '$lib/utils/task-filters';
	import { dueCountdown, formatEstimate, formatDateLong } from '$lib/utils/format';
	import { m } from '$lib/paraglide/messages';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { goto, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { showToast } from '$lib/stores/toast.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import type { ProjectId, Task } from '$lib/types';
	import type { PageData } from './$types';

	type LayoutShape = {
		users?: { id: string; name: string; email: string; initials: string; color: string }[];
	};

	let { data }: { data: PageData } = $props();

	const p = $derived(data.project);
	// Optimistic status while a quick change from the header pill is saving.
	let statusDraft = $state<string | null>(null);
	const heroStatus = $derived(statusDraft ?? p.status);
	const st = $derived(
		PROJECT_STATUS[heroStatus as keyof typeof PROJECT_STATUS] ?? PROJECT_STATUS.active
	);

	// Tasks come from the DB load (same Task shape as the /tasks page).
	const tasks = $derived(data.tasks);

	const total = $derived(tasks.length);
	// Cancelled tasks are out of scope: progress is done over what's left to do.
	const inScope = $derived(tasks.filter((t) => t.status !== 'cancelled').length);
	const active = $derived(
		tasks.filter((t) => t.status === 'in_progress' || t.status === 'paused').length
	);
	const done = $derived(
		tasks.filter((t) => t.status === 'done' || t.status === 'in_review').length
	);
	const pct = $derived(inScope === 0 ? 0 : Math.round((done / inScope) * 100));

	// Overdue — mirrors TaskRow: closed tasks (done, cancelled) never count.
	const overdue = $derived(
		tasks.filter((t) => !isClosedStatus(t.status) && dueCountdown(t.due)?.tone === 'overdue').length
	);

	// Time spent: per task, logged minutes win; else the estimate; else assume 1h.
	// Per-member split counts LOGGED time only — estimates have no owner; the
	// server sums it per member so list rows don't need the log entries.
	const time = $derived.by(() => {
		let logged = 0;
		let estimated = 0;
		let assumed = 0;
		for (const t of tasks) {
			if (t.loggedMinutes > 0) logged += t.loggedMinutes;
			else if (t.estimate) estimated += t.estimate;
			else assumed += 1;
		}
		return {
			totalMinutes: logged + estimated + assumed * 60,
			loggedMinutes: logged,
			estimatedMinutes: estimated,
			assumedCount: assumed,
			perMember: [...data.timeByUser].sort((a, b) => b.minutes - a.minutes)
		};
	});
	// Composition-honesty subline — only the non-zero parts.
	const timeParts = $derived.by(() => {
		const parts: string[] = [];
		if (time.loggedMinutes > 0)
			parts.push(m.projects_time_logged_part({ time: formatEstimate(time.loggedMinutes) }));
		if (time.estimatedMinutes > 0)
			parts.push(m.projects_time_estimated_part({ time: formatEstimate(time.estimatedMinutes) }));
		if (time.assumedCount > 0)
			parts.push(
				time.assumedCount === 1
					? m.projects_time_assumed_one({ n: time.assumedCount })
					: m.projects_time_assumed_other({ n: time.assumedCount })
			);
		return parts;
	});
	let timeSplitOpen = $state(false);

	// ── Task section: filters / search / grouping (ephemeral per visit) ────────
	type TaskGroupBy = 'status' | 'priority' | 'assignee' | 'none';
	const TASK_GROUP_IDS: TaskGroupBy[] = ['status', 'priority', 'assignee', 'none'];
	const isTaskGroup = (v: unknown): v is TaskGroupBy => TASK_GROUP_IDS.includes(v as TaskGroupBy);

	// Task-list view state persists under one key shared by every project page
	// (filters / group / sort live state + named saved views), so a picked
	// view is still applied on the next visit. localStorage cache wins over
	// the server snapshot — see the /projects page for the same pattern.
	type SavedProjectTasksView = Partial<ProjectTasksViewConfig> & {
		savedViews?: SavedViewEntry<ProjectTasksViewConfig>[];
	};
	const savedTasksView: SavedProjectTasksView = {
		...((data.savedView ?? {}) as SavedProjectTasksView),
		...readView<SavedProjectTasksView>('projectTasks')
	};
	let taskFilters = $state<Record<string, string[]>>(
		savedTasksView.filters && typeof savedTasksView.filters === 'object'
			? savedTasksView.filters
			: {}
	);
	let taskSearch = $state('');
	let taskGroup = $state<TaskGroupBy>(
		isTaskGroup(savedTasksView.group) ? savedTasksView.group : 'status'
	);
	let taskSort = $state<TaskSort>(
		isTaskSort(savedTasksView.sort) ? savedTasksView.sort : DEFAULT_TASK_LIST_SORT
	);
	function setTaskFilters(f: Record<string, string[]>) {
		taskFilters = f;
		saveView('projectTasks', { filters: f });
	}
	function setTaskGroup(g: TaskGroupBy) {
		taskGroup = g;
		saveView('projectTasks', { group: g });
	}
	function setTaskSort(s: TaskSort) {
		taskSort = s;
		saveView('projectTasks', { sort: s });
	}

	// ── Saved custom views (named filter+group+sort presets) ─────────────────
	let taskSavedViews = $state<SavedViewEntry<ProjectTasksViewConfig>[]>(
		Array.isArray(savedTasksView.savedViews)
			? savedTasksView.savedViews.filter(
					(v) => typeof v?.id === 'string' && typeof v?.name === 'string'
				)
			: []
	);
	const taskViewConfig = $derived<ProjectTasksViewConfig>({
		group: taskGroup,
		filters: taskFilters,
		sort: taskSort
	});
	// Configs come from storage, so guard every field against page defaults.
	function applyTaskView(cfg: ProjectTasksViewConfig) {
		taskGroup = isTaskGroup(cfg.group) ? cfg.group : 'status';
		taskFilters = cfg.filters && typeof cfg.filters === 'object' ? cfg.filters : {};
		taskSort = isTaskSort(cfg.sort) ? cfg.sort : DEFAULT_TASK_LIST_SORT;
		// The applied view becomes the live state, so it survives a reload.
		saveView('projectTasks', { group: taskGroup, filters: taskFilters, sort: taskSort });
	}
	function changeTaskViews(next: SavedViewEntry<ProjectTasksViewConfig>[]) {
		taskSavedViews = next;
		saveView('projectTasks', { savedViews: next });
		// CRUD is rare and explicit — flush immediately rather than risk losing
		// the debounced write to a quick navigation.
		flushViewSaves();
	}

	const filteredTasks = $derived(
		tasks.filter((t) => matchesTaskFilters(t, taskFilters, taskSearch))
	);

	// ── Connected meetings ─────────────────────────────────────────────────────
	let newMeetingOpen = $state(false);

	function relativeTime(d: Date): string {
		const ms = Date.now() - d.getTime();
		const mins = Math.round(ms / 60_000);
		if (mins < 1) return m.projects_just_now();
		if (mins < 60) return m.projects_min_ago({ n: mins });
		const h = Math.round(mins / 60);
		if (h < 24)
			return h === 1 ? m.projects_hour_ago_one({ n: h }) : m.projects_hours_ago_other({ n: h });
		const days = Math.round(h / 24);
		if (days < 7)
			return days === 1
				? m.projects_day_ago_one({ n: days })
				: m.projects_days_ago_other({ n: days });
		return d.toISOString().slice(0, 10);
	}

	let selectedId = $state<string | null>(null);
	let selected = $derived(
		selectedId ? (data.tasks.find((t) => t.id === selectedId) ?? null) : null
	);
	let creating = $state(false);

	let addingMember = $state(false);
	let memberSearch = $state('');
	let busy = $state<string | null>(null);
	let openMemberMenu = $state<string | null>(null);

	let settingsOpen = $state(false);
	let tagsOpen = $state(false);
	// Optimistic copy of the header tag list while a save is in flight.
	let tagsDraft = $state<string[] | null>(null);
	const heroTags = $derived(tagsDraft ?? p.tags ?? []);

	// Archiving stays in the settings flow (own permission and confirm).
	const QUICK_STATUSES = (Object.keys(PROJECT_STATUS) as (keyof typeof PROJECT_STATUS)[]).filter(
		(s) => s !== 'archived'
	);
	let statusOpen = $state(false);

	async function saveStatus(next: string) {
		statusOpen = false;
		if (next === p.status) return;
		statusDraft = next;
		const body = new FormData();
		body.set('status', next);
		try {
			const res = await fetch('?/status', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			if (result.type !== 'success') {
				showToast('err', m.projects_update_failed());
				return;
			}
			await invalidateAll();
		} catch {
			showToast('err', m.projects_update_failed());
		} finally {
			statusDraft = null;
		}
	}

	async function saveTags(next: string[]) {
		tagsDraft = next;
		const body = new FormData();
		for (const t of next) body.append('tags', t);
		if (next.length === 0) body.append('tags', '__clear__');
		try {
			const res = await fetch('?/tags', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			if (result.type !== 'success') {
				showToast('err', m.projects_update_failed());
				return;
			}
			await invalidateAll();
		} catch {
			showToast('err', m.projects_update_failed());
		} finally {
			tagsDraft = null;
		}
	}
	let editing = $state(false);
	let importingTasks = $state(false);
	let historyOpen = $state(false);
	let projectBusy = $state<
		'archive' | 'unarchive' | 'delete' | 'favoriteAdd' | 'favoriteRemove' | null
	>(null);

	type LayoutFav = { favoriteProjectIds?: string[] };
	const isFavorite = $derived(
		((data as unknown as LayoutFav).favoriteProjectIds ?? []).includes(p.id)
	);

	async function postProject(
		action: 'archive' | 'unarchive' | 'delete' | 'favoriteAdd' | 'favoriteRemove'
	): Promise<boolean> {
		projectBusy = action;
		try {
			const res = await fetch(`?/${action}`, {
				method: 'POST',
				body: new FormData(),
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			return result.type === 'success';
		} catch {
			return false;
		} finally {
			projectBusy = null;
		}
	}

	async function toggleFavorite() {
		settingsOpen = false;
		const success = await postProject(isFavorite ? 'favoriteRemove' : 'favoriteAdd');
		if (success) await invalidateAll();
	}

	async function archiveProject() {
		settingsOpen = false;
		const ok = await uiConfirm({
			title: m.projects_archive_confirm_title(),
			message: m.projects_archive_confirm_message({ name: p.name }),
			confirmLabel: m.projects_archive_confirm_label(),
			tone: 'warn'
		});
		if (!ok) return;
		const success = await postProject('archive');
		if (success) await invalidateAll();
	}

	async function unarchiveProject() {
		settingsOpen = false;
		const success = await postProject('unarchive');
		if (success) await invalidateAll();
	}

	async function deleteProject() {
		settingsOpen = false;
		const ok = await uiConfirm({
			title: m.projects_delete_confirm_title(),
			message: m.projects_delete_confirm_message({ name: p.name }),
			confirmLabel: m.projects_delete_project(),
			tone: 'danger'
		});
		if (!ok) return;
		const success = await postProject('delete');
		if (success) await goto('/projects');
	}

	const layoutUsers = $derived((data as unknown as LayoutShape).users ?? []);
	const memberIds = $derived(new Set(data.members.map((m) => m.id)));
	const candidates = $derived.by(() => {
		const q = memberSearch.toLowerCase();
		return layoutUsers
			.filter((u) => !memberIds.has(u.id))
			.filter((u) =>
				q ? u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) : true
			);
	});

	async function postMember(
		action: 'memberAdd' | 'memberRemove' | 'leadSet' | 'memberSetRole',
		userId: string,
		extra?: Record<string, string>
	): Promise<boolean> {
		busy = `${action}:${userId}`;
		const fd = new FormData();
		fd.append('userId', userId);
		if (action === 'memberAdd') fd.append('role', 'project.member');
		for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
		try {
			const res = await fetch(`?/${action}`, {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			if (result.type === 'success') {
				await invalidateAll();
				return true;
			}
			const msg =
				result.type === 'failure'
					? ((result.data as { message?: string } | undefined)?.message ??
						m.projects_action_failed())
					: result.type === 'error'
						? (result.error?.message ?? m.projects_action_failed())
						: m.projects_action_failed();
			showToast('err', msg);
		} catch {
			showToast('err', m.projects_network_error());
		} finally {
			busy = null;
		}
		return false;
	}

	async function addMember(userId: string) {
		const ok = await postMember('memberAdd', userId);
		if (ok) {
			memberSearch = '';
			addingMember = false;
		}
	}

	async function setLead(userId: string) {
		openMemberMenu = null;
		await postMember('leadSet', userId);
	}

	async function clearLead() {
		openMemberMenu = null;
		await postMember('leadSet', '');
	}

	const MENU_ITEM =
		'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50';

	async function copyProjectLink() {
		settingsOpen = false;
		try {
			await navigator.clipboard.writeText(`${window.location.origin}/projects/${p.id}`);
			showToast('ok', m.tickets_link_copied());
		} catch {
			showToast('err', m.tickets_link_copy_failed());
		}
	}

	const PROJECT_ROLES = $derived([
		{ id: 'project.manager', label: m.projects_role_manager(), color: '#ef7a6d' },
		{ id: 'project.member', label: m.projects_role_member(), color: '#7a9cf0' },
		{ id: 'project.viewer', label: m.projects_role_viewer(), color: '#9aa4b2' }
	] as const);

	async function setRole(userId: string, role: string) {
		openMemberMenu = null;
		await postMember('memberSetRole', userId, { role });
	}

	async function removeMember(userId: string, name: string) {
		openMemberMenu = null;
		const isLead = userId === p.leadId;
		const ok = await uiConfirm({
			title: m.projects_remove_member_title(),
			message: isLead
				? m.projects_remove_member_lead_message({ name })
				: m.projects_remove_member_message({ name, project: p.name }),
			confirmLabel: m.common_remove(),
			tone: isLead ? 'warn' : 'danger'
		});
		if (!ok) return;
		await postMember('memberRemove', userId);
	}
</script>

<svelte:head
	><title>{m.projects_detail_title({ name: p.name, brand: brandName() })}</title></svelte:head
>

<Topbar
	back={{ href: '/projects', label: m.common_back() }}
	crumbs={[{ label: m.projects_breadcrumb_projects(), href: '/projects' }, { label: p.name }]}
/>

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="px-6 pt-6 pb-10">
		<!-- Head: icon, name, one quiet meta line, tags; New task and the ⋯ menu. -->
		<div class="mb-6 flex flex-wrap items-start gap-4">
			<div
				class="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] text-[18px] font-semibold text-white shadow-edge"
				style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color} 70%, #000)
				85%)"
			>
				{p.icon}
			</div>
			<div class="min-w-0 flex-1">
				<h1 class="text-[24px] leading-10 font-semibold tracking-[-0.012em] text-balance text-text">
					{p.name}
				</h1>
				<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-3">
					<div class="relative -ml-1.5">
						<button
							type="button"
							aria-haspopup="menu"
							aria-expanded={statusOpen}
							title={m.projects_change_status()}
							onclick={() => (statusOpen = !statusOpen)}
							class="inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 leading-none text-text-2 transition-colors hover:bg-surface hover:text-text {statusOpen
								? 'bg-surface'
								: ''}"
						>
							<span class="h-2 w-2 rounded-full" style:background={st.color}></span>
							{projectStatusLabel(heroStatus)}
							<Icon name="chevron" size={11} class="text-text-4" />
						</button>
						{#if statusOpen}
							<div
								role="menu"
								use:clickOutside={() => (statusOpen = false)}
								use:autoPlace
								in:fly={POPOVER_IN}
								class="absolute top-full z-50 mt-1.5 min-w-[180px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
							>
								{#each QUICK_STATUSES as s (s)}
									{@const meta = PROJECT_STATUS[s]}
									<button
										type="button"
										role="menuitemradio"
										aria-checked={heroStatus === s}
										onclick={() => saveStatus(s)}
										class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] text-text-2 hover:bg-surface-2 hover:text-text"
									>
										<span class="h-2 w-2 rounded-full" style:background={meta.color}></span>
										<span class="flex-1">{projectStatusLabel(s)}</span>
										<span class="text-accent {heroStatus === s ? 'opacity-100' : 'opacity-0'}"
											><Icon name="check" size={14} /></span
										>
									</button>
								{/each}
							</div>
						{/if}
					</div>
					<span class="text-text-4">·</span>
					<span class="font-mono text-[12px]">{p.key}</span>
					{#if data.org}
						<span class="text-text-4">·</span>
						<span>{data.org.name}</span>
					{/if}
					<span class="text-text-4">·</span>
					<span>{m.projects_updated_relative({ time: relativeTime(p.updatedAt) })}</span>
				</div>
				<!-- Tags: pills, then a quiet add. -->
				<div class="relative mt-2 -ml-0.5 flex flex-wrap items-center gap-1">
					{#each heroTags as t (t)}
						{@const l = labelMeta(t)}
						<span class={TAG}>
							<span class="h-1.5 w-1.5 shrink-0 rounded-full" style:background={l.color}></span>
							<span class="max-w-[160px] truncate">{l.label}</span>
						</span>
					{/each}
					<div class="relative">
						<button
							type="button"
							onclick={() => (tagsOpen = !tagsOpen)}
							class="{QUIET_ADD} -ml-1 {tagsOpen ? OPEN : ''}"
						>
							<Icon name="plus" size={13} />
							{heroTags.length > 0 ? m.tasks_add_tag() : m.tasks_add_tags()}
						</button>
						{#if tagsOpen}
							<TagsPopover
								value={heroTags}
								kind="project"
								onchange={saveTags}
								onclose={() => (tagsOpen = false)}
							/>
						{/if}
					</div>
				</div>
			</div>
			<div class="flex items-center gap-1.5 max-md:basis-full max-md:justify-end">
				<Button variant="primary" size="sm" onclick={() => (creating = true)}>
					<Icon name="plus" size={14} />
					{m.projects_new_task()}
				</Button>
				<div class="relative">
					<IconButton
						ariaLabel={m.projects_aria_settings()}
						onclick={() => (settingsOpen = !settingsOpen)}
					>
						<Icon name="more" size={16} />
					</IconButton>
					{#if settingsOpen}
						<div
							role="menu"
							use:clickOutside={() => (settingsOpen = false)}
							use:autoPlace={{ align: 'right' }}
							in:fly={POPOVER_IN}
							class="absolute top-full z-50 mt-1.5 min-w-[230px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
						>
							<button
								type="button"
								onclick={() => {
									settingsOpen = false;
									historyOpen = true;
								}}
								class={MENU_ITEM}
							>
								<Icon name="logs" size={14} class="text-text-3" />
								{m.projects_aria_history()}
							</button>
							<button type="button" onclick={copyProjectLink} class={MENU_ITEM}>
								<Icon name="link" size={14} class="text-text-3" />
								{m.tasks_copy_link()}
							</button>
							<button
								type="button"
								onclick={toggleFavorite}
								disabled={projectBusy !== null}
								class={MENU_ITEM}
							>
								<Icon name="star" size={14} class={isFavorite ? 'text-accent' : 'text-text-3'} />
								{#if projectBusy === 'favoriteAdd' || projectBusy === 'favoriteRemove'}
									{m.common_saving()}
								{:else if isFavorite}
									{m.projects_remove_from_favorites()}
								{:else}
									{m.projects_add_to_favorites()}
								{/if}
							</button>
							<div class="-mx-0.5 my-1 h-px bg-border"></div>
							<button
								type="button"
								onclick={() => {
									settingsOpen = false;
									editing = true;
								}}
								class={MENU_ITEM}
							>
								<Icon name="settings" size={14} class="text-text-3" />
								{m.projects_edit_details()}
							</button>
							<button
								type="button"
								onclick={() => {
									settingsOpen = false;
									importingTasks = true;
								}}
								class={MENU_ITEM}
							>
								<Icon name="download" size={14} class="text-text-3" />
								{m.projects_import_tasks()}
							</button>
							<a
								href="/projects/{p.id}/tasks/export"
								download
								onclick={() => (settingsOpen = false)}
								class={MENU_ITEM}
							>
								<Icon name="upload" size={14} class="text-text-3" />
								{m.projects_export_tasks()}
							</a>
							<div class="-mx-0.5 my-1 h-px bg-border"></div>
							{#if p.status === 'archived'}
								<button
									type="button"
									onclick={unarchiveProject}
									disabled={projectBusy !== null}
									class={MENU_ITEM}
								>
									<Icon name="refresh" size={14} class="text-text-3" />
									{projectBusy === 'unarchive'
										? m.projects_unarchiving()
										: m.projects_unarchive_project()}
								</button>
							{:else}
								<button
									type="button"
									onclick={archiveProject}
									disabled={projectBusy !== null}
									class={MENU_ITEM}
								>
									<Icon name="bookmark" size={14} class="text-text-3" />
									{projectBusy === 'archive'
										? m.projects_archiving()
										: m.projects_archive_project()}
								</button>
							{/if}
							<button
								type="button"
								onclick={deleteProject}
								disabled={projectBusy !== null}
								class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] text-[#ef4f5e] hover:bg-[#ef4f5e]/10 disabled:opacity-50"
							>
								<Icon name="trash" size={14} />
								{projectBusy === 'delete' ? m.common_deleting() : m.projects_delete_project()}
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Numbers: one strip with hairline dividers instead of five boxes. -->
		<div
			class="mb-8 grid grid-cols-2 gap-y-4 rounded-xl border border-border py-3.5 sm:grid-cols-3 md:grid-cols-5"
		>
			<div class="px-4 md:border-l md:border-border md:first:border-l-0">
				<div class="text-[12px] text-text-3">{m.projects_total_tasks()}</div>
				<div class="mt-1 text-[22px] leading-7 font-semibold text-text">{total}</div>
			</div>
			<div class="px-4 md:border-l md:border-border md:first:border-l-0">
				<div class="text-[12px] text-text-3">{m.projects_in_progress()}</div>
				<div class="mt-1 text-[22px] leading-7 font-semibold text-text">{active}</div>
			</div>
			<div class="px-4 md:border-l md:border-border md:first:border-l-0">
				<div class="text-[12px] text-text-3">{m.projects_overdue()}</div>
				<div
					class="mt-1 text-[22px] leading-7 font-semibold {overdue > 0
						? 'text-[#ef4f5e]'
						: 'text-text'}"
				>
					{overdue}
				</div>
			</div>
			<div class="px-4 md:border-l md:border-border md:first:border-l-0">
				<div class="flex items-center gap-2 text-[12px] text-text-3">
					{m.projects_time_spent()}
					{#if time.perMember.length > 0}
						<div class="relative ml-auto">
							<button
								type="button"
								onclick={() => (timeSplitOpen = !timeSplitOpen)}
								aria-label={m.projects_time_by_member()}
								title={m.projects_time_by_member()}
								class="flex items-center -space-x-1.5"
							>
								{#each time.perMember.slice(0, 3) as pm (pm.userId)}
									<Avatar user={layoutUsers.find((u) => u.id === pm.userId)} size={18} />
								{/each}
								{#if time.perMember.length > 3}
									<span class="pl-2 text-[11px] text-text-3">+{time.perMember.length - 3}</span>
								{/if}
							</button>
							{#if timeSplitOpen}
								<div
									use:clickOutside={() => (timeSplitOpen = false)}
									use:autoPlace={{ align: 'right' }}
									in:fly={POPOVER_IN}
									class="absolute top-full z-40 mt-1.5 min-w-[230px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
								>
									<div class="px-2 pt-1 pb-1.5 text-[12px] text-text-4">
										{m.projects_time_by_member()}
									</div>
									{#each time.perMember as pm (pm.userId)}
										{@const u = layoutUsers.find((x) => x.id === pm.userId)}
										<div class="flex items-center gap-2.5 rounded-md px-2 py-1.5">
											<Avatar user={u} size={22} />
											<span class="min-w-0 flex-1 truncate text-[14px] text-text-2"
												>{u?.name ?? pm.userId}</span
											>
											<span class="font-mono text-[13px] text-text-3"
												>{formatEstimate(pm.minutes)}</span
											>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
				<div class="mt-1 text-[22px] leading-7 font-semibold text-text">
					{total === 0 ? '—' : formatEstimate(time.totalMinutes)}
				</div>
				{#if timeParts.length}
					<div class="mt-0.5 truncate text-[12px] text-text-4" title={timeParts.join(' · ')}>
						{timeParts.join(' · ')}
					</div>
				{/if}
			</div>
			<div class="px-4 md:border-l md:border-border md:first:border-l-0">
				<div class="text-[12px] text-text-3">{m.projects_progress()}</div>
				<div class="mt-1 text-[22px] leading-7 font-semibold text-text">
					{pct}<span class="text-[14px] font-normal text-text-3">%</span>
				</div>
				<div class="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
					<div class="h-full rounded-full" style:width="{pct}%" style:background={p.color}></div>
				</div>
			</div>
		</div>

		<!-- About / members / meetings: plain sections, no boxes. -->
		<div
			class="mb-10 grid gap-x-10 gap-y-8 {data.isTrackrTeam ? 'lg:grid-cols-3' : 'md:grid-cols-2'}"
		>
			<section>
				<SectionHeader label={m.projects_about()} />
				<p
					class="text-[14px] leading-relaxed whitespace-pre-line {p.description
						? 'text-text-2'
						: 'text-text-4'}"
				>
					{p.description ?? m.projects_no_description()}
				</p>
			</section>

			<section>
				<SectionHeader label={m.projects_members_label()} count={data.members.length}>
					{#snippet action()}
						<button
							type="button"
							onclick={() => {
								addingMember = !addingMember;
								memberSearch = '';
							}}
							aria-label={m.common_add()}
							title={m.common_add()}
							class="{ICON_ACTION} {addingMember ? OPEN : ''}"
						>
							<Icon name="plus" size={14} />
						</button>
						{#if addingMember}
							<div
								use:clickOutside={() => (addingMember = false)}
								use:autoPlace={{ align: 'right' }}
								in:fly={POPOVER_IN}
								class="absolute top-full z-50 mt-1.5 w-[308px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
							>
								<div class="mb-1.5 flex items-center gap-2 border-b border-border px-2 pt-1 pb-2">
									<span class="text-text-3"><Icon name="search" size={14} /></span>
									<input
										type="text"
										bind:value={memberSearch}
										placeholder={m.projects_add_teammate_placeholder()}
										class="flex-1 border-0 bg-transparent text-[14px] outline-none placeholder:text-text-3"
									/>
								</div>
								<div class="max-h-[308px] overflow-y-auto">
									{#each candidates as u (u.id)}
										<button
											type="button"
											onclick={() => addMember(u.id)}
											disabled={busy === `memberAdd:${u.id}`}
											class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
										>
											<Avatar user={u} size={24} />
											<span class="min-w-0 flex-1">
												<span class="block truncate text-[14px]">{u.name}</span>
												<span class="block truncate font-mono text-[12px] text-text-3"
													>{u.email}</span
												>
											</span>
										</button>
									{/each}
									{#if candidates.length === 0}
										<div class="px-2 py-3 text-center text-[13px] text-text-3">
											{memberSearch ? m.projects_no_matches() : m.projects_everyone_member()}
										</div>
									{/if}
								</div>
							</div>
						{/if}
					{/snippet}
				</SectionHeader>
				<div class="space-y-px">
					{#each data.members as mem (mem.id)}
						{@const role = PROJECT_ROLES.find((r) => r.id === mem.role)}
						<div class="relative">
							<button
								type="button"
								onclick={() => (openMemberMenu = openMemberMenu === mem.id ? null : mem.id)}
								class="{ROW} w-[calc(100%+1rem)] text-left {openMemberMenu === mem.id ? OPEN : ''}"
							>
								<Avatar user={mem} size={22} />
								<span class="min-w-0 flex-1 truncate text-[14px] leading-5 text-text"
									>{mem.name}</span
								>
								{#if mem.id === p.leadId}
									<span
										class="shrink-0 rounded-md bg-accent-soft px-1.5 py-1 text-[11px] leading-none text-accent"
										>{m.projects_lead_badge()}</span
									>
								{/if}
								{#if role}
									<span class="shrink-0 text-[12px] leading-5 text-text-4">{role.label}</span>
								{/if}
							</button>
							{#if openMemberMenu === mem.id}
								<div
									use:clickOutside={() => (openMemberMenu = null)}
									use:autoPlace={{ align: 'right' }}
									in:fly={POPOVER_IN}
									class="absolute top-full z-40 mt-1 min-w-[220px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
								>
									<div class="px-2 pt-1 pb-1.5 text-[12px] text-text-4">
										{m.projects_role_label()}
									</div>
									{#each PROJECT_ROLES as r (r.id)}
										{@const isRole = mem.role === r.id}
										<button
											type="button"
											onclick={() => setRole(mem.id, r.id)}
											disabled={busy === `memberSetRole:${mem.id}` || isRole}
											class="{MENU_ITEM} disabled:cursor-default disabled:opacity-100"
										>
											<span class="h-2 w-2 rounded-full" style:background={r.color}></span>
											<span class="flex-1 {isRole ? 'text-text' : ''}">{r.label}</span>
											<span class="text-accent {isRole ? 'opacity-100' : 'opacity-0'}"
												><Icon name="check" size={14} /></span
											>
										</button>
									{/each}
									<div class="-mx-0.5 my-1 h-px bg-border"></div>
									{#if mem.id === p.leadId}
										<button
											type="button"
											onclick={clearLead}
											disabled={busy === 'leadSet:'}
											class={MENU_ITEM}
										>
											<Icon name="star" size={14} class="text-text-3" />
											{m.projects_remove_as_lead()}
										</button>
									{:else}
										<button
											type="button"
											onclick={() => setLead(mem.id)}
											disabled={busy === `leadSet:${mem.id}`}
											class={MENU_ITEM}
										>
											<Icon name="star" size={14} class="text-text-3" />
											{m.projects_set_as_lead()}
										</button>
									{/if}
									<button
										type="button"
										onclick={() => removeMember(mem.id, mem.name)}
										disabled={busy === `memberRemove:${mem.id}`}
										class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] text-[#ef4f5e] hover:bg-[#ef4f5e]/10 disabled:opacity-50"
									>
										<Icon name="x" size={14} />
										{m.common_remove()}
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</section>

			{#if data.isTrackrTeam}
				<section>
					<SectionHeader label={m.notes_section_meetings()} count={data.meetings.length}>
						{#snippet action()}
							<button
								type="button"
								onclick={() => (newMeetingOpen = true)}
								aria-label={m.notes_new_meeting()}
								title={m.notes_new_meeting()}
								class={ICON_ACTION}
							>
								<Icon name="plus" size={14} />
							</button>
						{/snippet}
					</SectionHeader>
					{#if data.meetings.length}
						<!-- About six rows; older meetings scroll within. -->
						<div class="-mx-2 max-h-[232px] space-y-px overflow-y-auto overscroll-contain px-2">
							{#each data.meetings as n (n.id)}
								<a href="/notes/{n.id}" class="group {ROW}">
									<span class="grid h-5 w-5 shrink-0 place-items-center text-text-3">
										<Icon name="users" size={15} />
									</span>
									<span
										class="min-w-0 flex-1 truncate text-[14px] leading-5 text-text-2 group-hover:text-text"
										>{n.title || m.notes_untitled()}</span
									>
									{#if n.meetingDate}
										<span class="shrink-0 text-[12px] leading-5 text-text-4"
											>{formatDateLong(n.meetingDate.toISOString())}</span
										>
									{/if}
								</a>
							{/each}
						</div>
					{:else}
						<button type="button" onclick={() => (newMeetingOpen = true)} class="{QUIET_ADD} -ml-2">
							<Icon name="plus" size={13} />
							{m.notes_new_meeting()}
						</button>
					{/if}
				</section>
			{/if}
		</div>

		<!-- Tasks: the project's list with its own toolbar. -->
		<section>
			<SectionHeader
				label={m.projects_tasks()}
				count={filteredTasks.length !== tasks.length
					? `${filteredTasks.length}/${tasks.length}`
					: tasks.length}
			/>
			<div class="overflow-hidden rounded-xl border border-border">
				<div class="border-b border-border px-3 py-2">
					<ProjectTasksToolbar
						{tasks}
						filters={taskFilters}
						setFilters={setTaskFilters}
						search={taskSearch}
						setSearch={(s) => (taskSearch = s)}
						group={taskGroup}
						setGroup={setTaskGroup}
						sort={taskSort}
						setSort={setTaskSort}
						viewsMenu={{
							views: taskSavedViews,
							current: taskViewConfig,
							onApply: applyTaskView,
							onChange: changeTaskViews
						}}
					/>
				</div>
				{#if tasks.length === 0}
					<EmptyState
						icon="check-square"
						title={m.projects_no_tasks_title()}
						hint={m.projects_no_tasks_hint()}
					/>
				{:else if filteredTasks.length === 0}
					<div class="px-4 py-8 text-center text-[14px] text-text-3">
						{m.projects_no_matching_tasks()}
					</div>
				{:else}
					<ListView
						tasks={filteredTasks}
						showProject={false}
						group={taskGroup}
						sort={taskSort}
						onSelect={(t) => (selectedId = t.id)}
						selectedId={selectedId ?? undefined}
					/>
				{/if}
			</div>
		</section>
	</div>
</div>

<EditProjectModal
	open={editing}
	onclose={() => (editing = false)}
	project={{
		key: p.key,
		name: p.name,
		description: p.description,
		color: p.color,
		status: p.status,
		tags: p.tags
	}}
/>

<ImportTasksModal open={importingTasks} onclose={() => (importingTasks = false)} projectId={p.id} />

<Inspector
	taskId={selectedId}
	summary={selected}
	onclose={() => (selectedId = null)}
	users={data.users}
	onopen={(id) => (selectedId = id)}
/>

<ProjectHistory
	open={historyOpen}
	onclose={() => (historyOpen = false)}
	activity={data.activity}
	projectId={data.project.id}
	taskIds={data.tasks.map((t) => t.id)}
	onOpenTask={(ref) => {
		historyOpen = false;
		selectedId = ref;
	}}
/>

<CreateTaskModal
	open={creating}
	prefill={{ project: p.key as ProjectId }}
	onclose={() => (creating = false)}
	users={data.users}
	projects={data.projects}
	currentUserId={data.currentUserId}
	memberProjectIds={Object.keys(data.memberRoles.projects)}
	allAccess={data.isTrackrTeam}
/>

{#if data.isTrackrTeam}
	<NewMeetingDialog
		bind:open={newMeetingOpen}
		projects={data.projects}
		templates={data.meetingTemplates}
		tasks={tasks
			.filter((t) => t.uuid)
			.map((t) => ({
				id: t.uuid!,
				number: Number(t.id.split('-').pop()) || 0,
				title: t.title,
				projectId: p.id
			}))}
		presetProjectId={p.id}
	/>
{/if}
