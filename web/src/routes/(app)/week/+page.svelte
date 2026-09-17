<script lang="ts">
	import { brandName, pageTitle } from '$lib/brand';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import Inspector from '$lib/components/tasks/Inspector.svelte';
	import CreateTaskModal from '$lib/components/tasks/CreateTaskModal.svelte';
	import TaskRow from '$lib/components/tasks/TaskRow.svelte';
	import WeekBoard from '$lib/components/week/WeekBoard.svelte';
	import SmartComposer from '$lib/components/week/SmartComposer.svelte';
	import type { ComposerDraft } from '$lib/components/week/SmartComposer.svelte';
	import { taskTimeMinutes } from '$lib/utils/task';
	import { resolveProject } from '$lib/stores/lookup.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { readView, saveView } from '$lib/stores/view';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { m } from '$lib/paraglide/messages';
	import type { ActionResult } from '@sveltejs/kit';
	import type { Task } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type SavedWeekView = {
		view?: 'list' | 'board';
		weekStart?: string;
		tab?: 'past' | 'mine' | 'others';
		// ISO dates the user has collapsed. Persisted by date (not weekday index)
		// so collapsing one day doesn't collapse that weekday in every week.
		collapsedDates?: string[];
		unscheduledCollapsed?: boolean;
		// Done tasks are hidden from the day lists by default; their time still
		// counts towards the day/week totals so the capacity picture holds.
		showDone?: boolean;
	};
	// localStorage cache wins over the server snapshot — it's mirrored on
	// every saveView() call so it always reflects the latest in-tab change,
	// even before the debounced server write has flushed.
	const saved: SavedWeekView = {
		...((data.savedView ?? {}) as SavedWeekView),
		...readView<SavedWeekView>('week')
	};

	let view = $state<'list' | 'board'>(saved.view === 'board' ? 'board' : 'list');
	function setView(next: 'list' | 'board') {
		view = next;
		composerDay = null;
		saveView('week', { view: next });
	}

	function addBoardTask(iso: string) {
		createPrefill = { plannedFor: iso, assignees: [data.currentUserId] };
		creating = true;
	}

	const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
	const WEEK_DAY_LABELS = [
		m.week_day_monday,
		m.week_day_tuesday,
		m.week_day_wednesday,
		m.week_day_thursday,
		m.week_day_friday,
		m.week_day_saturday,
		m.week_day_sunday
	];
	const DEFAULT_ESTIMATE = 60;
	const CAPACITY = 8 * 60;
	const WEEK_CAPACITY = 5 * 8 * 60;

	const dayLabels = $derived(
		data.weekDates.map((iso) => {
			const d = new Date(iso + 'T00:00:00Z');
			return { iso, dayOfMonth: d.getUTCDate() };
		})
	);
	const todayIndex = $derived(data.weekDates.findIndex((iso) => iso === data.todayIso));

	// Stored as ISO dates; the per-week collapsed indices are derived from it.
	let collapsedDates = $state<Set<string>>(new Set(saved.collapsedDates ?? []));
	const collapsed = $derived(
		new Set(
			data.weekDates.map((iso, i) => (collapsedDates.has(iso) ? i : -1)).filter((i) => i >= 0)
		)
	);
	let showDone = $state(saved.showDone === true);
	function toggleShowDone() {
		showDone = !showDone;
		saveView('week', { showDone });
	}
	const isDone = (t: Task) => t.status === 'done';
	const visibleTask = (t: Task) => showDone || !isDone(t);

	let composerDay = $state<number | null>(null);
	let selectedId = $state<string | null>(null);
	let selected = $derived(
		selectedId ? (data.tasks.find((t) => t.id === selectedId) ?? null) : null
	);

	let creating = $state(false);
	let createPrefill = $state<{
		title?: string;
		project?: ComposerDraft['project'];
		priority?: ComposerDraft['priority'];
		assignees?: string[];
		estimate?: number;
		plannedFor?: string | null;
	}>({});

	function expandComposer(d: ComposerDraft) {
		const iso = composerDay !== null ? (data.weekDates[composerDay] ?? null) : null;
		createPrefill = {
			title: d.title,
			project: d.project,
			priority: d.priority,
			assignees: [d.assignee],
			estimate: d.estimate,
			plannedFor: iso
		};
		creating = true;
		composerDay = null;
	}

	async function submitComposer(dayIndex: number, d: ComposerDraft) {
		const iso = data.weekDates[dayIndex];
		if (!iso || !d.title) return;

		const body = new FormData();
		body.set('title', d.title);
		body.set('project', d.project);
		body.set('status', 'todo');
		body.set('priority', d.priority);
		body.set('estimate', String(d.estimate));
		body.append('assignees', d.assignee);
		body.set('plannedFor', iso);

		try {
			const res = await fetch('/tasks?/create', { method: 'POST', body });
			const result = deserialize(await res.text()) as ActionResult;
			if (result.type === 'success') {
				composerDay = null;
				await invalidateAll();
			} else if (result.type === 'failure') {
				const msg =
					(result.data as { message?: string } | undefined)?.message ?? m.week_create_failed();
				showToast('err', msg);
			} else if (result.type === 'error') {
				showToast('err', result.error?.message ?? m.week_create_failed());
			}
		} catch (err) {
			console.error('week composer submit failed', err);
			showToast('err', m.week_create_failed());
		}
	}

	const plannedByDay = $derived.by(() => {
		const out: Record<number, Task[]> = {};
		for (let i = 0; i < 7; i++) out[i] = [];
		for (const t of data.tasks) {
			if (!t.plannedFor) continue;
			const idx = data.weekDates.indexOf(t.plannedFor);
			if (idx >= 0) out[idx].push(t);
		}
		return out;
	});

	const weekMinutes = $derived.by(() => {
		let total = 0;
		for (let i = 0; i < 5; i++) {
			for (const t of plannedByDay[i]) total += taskTimeMinutes(t) ?? DEFAULT_ESTIMATE;
		}
		return total;
	});

	function toggle(i: number) {
		const iso = data.weekDates[i];
		if (!iso) return;
		const n = new Set(collapsedDates);
		n.has(iso) ? n.delete(iso) : n.add(iso);
		collapsedDates = n;
		saveView('week', { collapsedDates: [...n] });
	}

	function dayMinutes(i: number): number {
		return plannedByDay[i].reduce((s, t) => s + (taskTimeMinutes(t) ?? DEFAULT_ESTIMATE), 0);
	}

	// Per-project sub-sections within a day, alphabetical — so a mixed day
	// reads as "which project gets how much of it" at a glance.
	type DayGroup = { key: string; name: string; color: string; tasks: Task[] };
	function dayProjectGroups(tasks: Task[]): DayGroup[] {
		const keys = Array.from(new Set(tasks.map((t) => t.project)));
		return keys
			.map((key) => {
				const p = resolveProject(key);
				return {
					key,
					name: p?.name ?? key,
					color: p?.color ?? '#7c7c84',
					tasks: tasks.filter((t) => t.project === key)
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	function groupMinutes(tasks: Task[]): number {
		return tasks.reduce((sum, t) => sum + (taskTimeMinutes(t) ?? DEFAULT_ESTIMATE), 0);
	}

	// Done tasks hidden in the week (for the header hint / toggle badge).
	const hiddenDoneCount = $derived(
		showDone ? 0 : data.weekDates.reduce((n, _, i) => n + plannedByDay[i].filter(isDone).length, 0)
	);

	function fmtMins(mins: number): string {
		return `${Math.floor(mins / 60)}h${mins % 60 > 0 ? `${mins % 60}m` : ''}`;
	}

	// Project detail link for a sub-section header (tasks store project keys).
	function projectHref(key: string): string | undefined {
		const proj = data.projects.find((x) => x.key === key);
		return proj ? `/projects/${proj.id}` : undefined;
	}

	type UnscheduledTab = 'past' | 'mine' | 'others';
	const validTab = (t: unknown): t is UnscheduledTab =>
		t === 'past' || t === 'mine' || t === 'others';
	let unscheduledTab = $state<UnscheduledTab>(validTab(saved.tab) ? saved.tab : 'past');
	function setUnscheduledTab(t: UnscheduledTab) {
		unscheduledTab = t;
		saveView('week', { tab: t });
	}

	let unscheduledCollapsed = $state(saved.unscheduledCollapsed === true);
	function toggleUnscheduled() {
		unscheduledCollapsed = !unscheduledCollapsed;
		saveView('week', { unscheduledCollapsed });
	}

	const unscheduled = $derived.by(() => {
		// Open = still actionable; we never surface done/in-review here.
		const isOpen = (t: Task) => t.status !== 'done' && t.status !== 'in_review';
		const me = data.currentUserId;
		const mine = (t: Task) => t.assignee === me || (t.assignees ?? []).includes(me);

		if (unscheduledTab === 'past') {
			// Open tasks I planned for a day in a week before this one — so I
			// don't forget the overdue work. Oldest first.
			return data.tasks
				.filter((t) => isOpen(t) && !!t.plannedFor && t.plannedFor < data.weekStartIso)
				.sort((a, b) =>
					a.plannedFor! < b.plannedFor! ? -1 : a.plannedFor! > b.plannedFor! ? 1 : 0
				)
				.slice(0, 16);
		}

		if (unscheduledTab === 'mine') {
			// In my week, no specific date yet, assigned to me.
			return data.tasks
				.filter((t) => isOpen(t) && t.inMyPlan && !t.plannedFor && mine(t))
				.slice(0, 16);
		}

		// Others: every other open task without a specific date — including
		// ones assigned to someone else. Bookmarked rows sort to the top.
		const rest = data.tasks.filter((t) => isOpen(t) && !t.plannedFor && !(t.inMyPlan && mine(t)));
		const planned = rest.filter((t) => t.inMyPlan);
		const others = rest.filter((t) => !t.inMyPlan);
		return [...planned, ...others].slice(0, 16);
	});

	function weekRangeLabel(): string {
		if (data.weekDates.length === 0) return '';
		const first = new Date(data.weekDates[0] + 'T00:00:00Z');
		const last = new Date(data.weekDates[6] + 'T00:00:00Z');
		const f = first.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
		const l = last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
		return `${f} — ${l}`;
	}

	function startOfWeekIso(iso: string): string {
		const d = new Date(iso + 'T00:00:00Z');
		const offset = (d.getUTCDay() + 6) % 7;
		d.setUTCDate(d.getUTCDate() - offset);
		return d.toISOString().slice(0, 10);
	}

	function addDays(iso: string, n: number): string {
		const d = new Date(iso + 'T00:00:00Z');
		d.setUTCDate(d.getUTCDate() + n);
		return d.toISOString().slice(0, 10);
	}

	const currentWeekStart = $derived(startOfWeekIso(data.todayIso));
	const weekDelta = $derived(
		Math.round(
			(Date.UTC(...(data.weekStartIso.split('-').map(Number) as [number, number, number])) -
				Date.UTC(...(currentWeekStart.split('-').map(Number) as [number, number, number]))) /
				86400000 /
				7
		)
	);

	// ISO-8601 week number — the week containing the Thursday of that Mon-Sun
	// span belongs to the ISO year of that Thursday.
	function isoWeek(iso: string): { week: number; year: number } {
		const d = new Date(iso + 'T00:00:00Z');
		d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
		const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
		jan4.setUTCDate(jan4.getUTCDate() + 3 - ((jan4.getUTCDay() + 6) % 7));
		const week = 1 + Math.round((d.getTime() - jan4.getTime()) / 86400000 / 7);
		return { week, year: d.getUTCFullYear() };
	}

	const weekLabel = $derived.by(() => {
		const { week, year } = isoWeek(data.weekStartIso);
		const today = isoWeek(data.todayIso);
		const padded = String(week).padStart(2, '0');
		return year === today.year ? `KW${padded}` : `KW${padded} ${year}`;
	});

	function gotoWeek(iso: string | null) {
		const resolved = iso ?? currentWeekStart;
		saveView('week', { weekStart: resolved });
		// Always carry ?week= in the URL so navigation is authoritative and
		// doesn't race the debounced viewState write. Saved week is only
		// consulted on fresh entries to /week (no param).
		goto(`/week?week=${resolved}`, { noScroll: true, keepFocus: true });
	}
</script>

{#snippet unscheduledTabs()}
	<div
		class="inline-flex h-7 shrink-0 items-center rounded-lg border border-border bg-bg-elev p-0.5 text-[12px]"
	>
		{#each [['past', m.week_tab_past()], ['mine', m.week_tab_my_tasks()], ['others', m.week_tab_others()]] as [k, lbl] (k)}
			<button
				type="button"
				onclick={() => setUnscheduledTab(k as UnscheduledTab)}
				aria-pressed={unscheduledTab === k}
				class="h-full rounded-md px-2.5 transition-colors {unscheduledTab === k
					? 'bg-surface-2 text-text'
					: 'text-text-3 hover:text-text'}"
			>
				{lbl}
			</button>
		{/each}
	</div>
{/snippet}

<svelte:head><title>{pageTitle(m.week_title())}</title></svelte:head>

<Topbar
	crumbs={[
		{ label: m.admin_crumb_workspace({ brand: brandName() }), href: '/tasks' },
		{ label: m.week_title() }
	]}
/>

<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
	<div
		class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-6"
	>
		<div
			class="inline-flex h-7 shrink-0 items-center rounded-lg border border-border bg-surface p-0.5 text-[14px]"
		>
			{#each ['list', 'board'] as mode (mode)}
				<button
					type="button"
					aria-pressed={view === mode}
					onclick={() => setView(mode as 'list' | 'board')}
					class="inline-flex h-full items-center gap-1.5 rounded-md px-2 transition-colors {view ===
					mode
						? 'bg-bg-elev text-text'
						: 'text-text-3 hover:text-text'}"
				>
					<Icon name={mode === 'list' ? 'list' : 'board'} size={14} />
					{mode === 'list' ? m.tasks_view_list() : m.tasks_view_board()}
				</button>
			{/each}
		</div>
		<Button size="sm" variant="default" onclick={() => gotoWeek(null)} disabled={weekDelta === 0}>
			{m.common_today()}
		</Button>
		<div class="inline-flex overflow-hidden rounded-lg border border-border bg-surface">
			<button
				type="button"
				aria-label={m.week_previous_week()}
				onclick={() => gotoWeek(addDays(data.weekStartIso, -7))}
				class="grid h-7 w-7 place-items-center text-text-3 hover:bg-surface-2 hover:text-text"
			>
				<Icon name="chevron-r" size={13} class="rotate-180" />
			</button>
			<button
				type="button"
				aria-label={m.week_next_week()}
				onclick={() => gotoWeek(addDays(data.weekStartIso, 7))}
				class="grid h-7 w-7 place-items-center text-text-3 hover:bg-surface-2 hover:text-text"
			>
				<Icon name="chevron-r" size={13} />
			</button>
		</div>
		<div class="flex items-center gap-2 text-[14px] text-text-2">
			<span class="font-mono font-medium tracking-tight text-text">{weekLabel}</span>
			{#if weekDelta === 0}
				<span
					class="rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium tracking-[0.06em] text-accent uppercase"
					>{m.week_now()}</span
				>
			{/if}
			<span class="hidden text-text-4 sm:inline">·</span>
			<span class="hidden font-mono text-[14px] text-text-3 sm:inline">{weekRangeLabel()}</span>
		</div>
		<div class="ml-auto flex items-center gap-3">
			<button
				type="button"
				onclick={toggleShowDone}
				aria-pressed={showDone}
				title={showDone ? m.week_hide_done() : m.week_show_done()}
				class="inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors {showDone
					? 'border-border bg-surface-2 text-text'
					: 'border-dashed border-border text-text-3 hover:border-border-strong hover:text-text'}"
			>
				<Icon name="check" size={13} />
				<span>{showDone ? m.week_hide_done() : m.week_show_done()}</span>
				{#if hiddenDoneCount > 0}
					<span class="font-mono text-[11px] text-text-4">{hiddenDoneCount}</span>
				{/if}
			</button>
			<div class="text-right">
				<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">{m.week_capacity()}</div>
				<div class="font-mono text-[14px] text-text">{Math.round(weekMinutes / 60)}h / 40h</div>
			</div>
			<div class="hidden h-1.5 w-24 overflow-hidden rounded-full bg-surface sm:block">
				<div
					class="h-full bg-accent"
					style:width="{Math.min(100, (weekMinutes / WEEK_CAPACITY) * 100)}%"
				></div>
			</div>
		</div>
	</div>

	{#if view === 'board'}
		<WeekBoard
			days={dayLabels.map((day, i) => ({
				...day,
				label: WEEK_DAY_LABELS[i](),
				tasks: plannedByDay[i],
				minutes: dayMinutes(i)
			}))}
			todayIso={data.todayIso}
			{showDone}
			{unscheduled}
			{unscheduledTabs}
			onselect={(task) => (selectedId = task.id)}
			onadd={addBoardTask}
		/>
	{:else}
		<div class="min-h-0 flex-1 overflow-y-auto">
			<div class="min-w-0">
				{#each WEEK_DAYS as day, i (day)}
					{@const tasks = plannedByDay[i]}
					{@const mins = dayMinutes(i)}
					{@const isToday = i === todayIndex}
					{@const isWeekend = i >= 5}
					{@const isCollapsed = collapsed.has(i)}
					{@const pct = Math.min(100, (mins / CAPACITY) * 100)}
					{@const over = mins > CAPACITY}
					<section>
						<button
							type="button"
							onclick={() => toggle(i)}
							class="sticky top-0 z-[5] flex h-10 w-full items-center gap-2.5 border-y border-border bg-surface pr-3 pl-4 text-left sm:pl-5"
						>
							<span class="text-text-3 transition-transform {isCollapsed ? '-rotate-90' : ''}">
								<Icon name="chevron" size={13} />
							</span>
							<span
								class="text-[14px] font-semibold {isToday
									? 'text-accent'
									: isWeekend
										? 'text-text-2'
										: 'text-text'}">{WEEK_DAY_LABELS[i]()}</span
							>
							<span class="font-mono text-[13px] text-text-4">{dayLabels[i].dayOfMonth}</span>
							{#if isToday}
								<span
									class="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium tracking-[0.06em] text-accent uppercase"
									>{m.common_today()}</span
								>
							{/if}
							<span class="font-mono text-[12px] text-text-3">{tasks.length}</span>
							<div class="ml-auto flex items-center gap-2.5">
								<div class="h-1 w-16 overflow-hidden rounded-full bg-bg-elev sm:w-28">
									<div
										class="h-full"
										style:width="{pct}%"
										style:background={over
											? '#ef4f5e'
											: isToday
												? 'var(--accent)'
												: 'var(--text-3)'}
									></div>
								</div>
								<span class="w-12 text-right font-mono text-[12px] text-text-3">
									{fmtMins(mins)}
								</span>
							</div>
						</button>
						{#if !isCollapsed}
							<div transition:slide={{ duration: 180, easing: cubicOut }}>
								{#each dayProjectGroups(tasks) as g (g.key)}
									{@const href = projectHref(g.key)}
									{@const visible = g.tasks.filter(visibleTask)}
									{@const hiddenDone = g.tasks.length - visible.length}
									<div
										class="flex h-8 items-center gap-2 border-b border-border/60 bg-surface/40 pr-4 pl-5 sm:pr-5"
									>
										<span class="h-2 w-2 shrink-0 rounded-full" style:background={g.color}></span>
										{#if href}
											<a
												{href}
												class="truncate text-[13px] font-medium text-text-2 hover:text-text hover:underline"
												>{g.name}</a
											>
										{:else}
											<span class="truncate text-[13px] font-medium text-text-2">{g.name}</span>
										{/if}
										<span class="font-mono text-[11px] text-text-4">{visible.length}</span>
										{#if hiddenDone > 0}
											<span class="text-[11px] text-text-4"
												>· {m.week_done_hidden({ n: hiddenDone })}</span
											>
										{/if}
										<span class="ml-auto font-mono text-[11px] text-text-4"
											>{fmtMins(groupMinutes(g.tasks))}</span
										>
									</div>
									{#each visible as t (t.id)}
										<TaskRow
											task={t}
											selected={selectedId === t.id}
											showPlanned={false}
											showTime
											onclick={() => (selectedId = t.id)}
										/>
									{/each}
								{/each}
								{#if composerDay === i}
									<SmartComposer
										users={data.users}
										projects={data.projects}
										currentUserId={data.currentUserId}
										memberProjectIds={Object.keys(data.memberRoles.projects)}
										allAccess={data.isTrackrTeam}
										onsubmit={(d) => submitComposer(i, d)}
										oncancel={() => (composerDay = null)}
										onexpand={expandComposer}
									/>
								{:else}
									<button
										type="button"
										onclick={() => (composerDay = i)}
										class="flex h-9 w-full items-center gap-1.5 border-b border-border/60 px-4 text-left text-[13px] text-text-3 transition-colors hover:bg-surface hover:text-text sm:px-5"
									>
										<Icon name="plus" size={13} />
										{m.week_add_task()}
									</button>
								{/if}
							</div>
						{/if}
					</section>
				{/each}
			</div>

			<section class="pb-6">
				<div
					class="sticky top-0 z-[5] flex h-10 w-full items-center gap-2.5 border-y border-border bg-surface pr-3 pl-4 sm:pl-5"
				>
					<button
						type="button"
						onclick={toggleUnscheduled}
						class="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left"
					>
						<span
							class="text-text-3 transition-transform {unscheduledCollapsed ? '-rotate-90' : ''}"
						>
							<Icon name="chevron" size={13} />
						</span>
						<span class="text-[14px] font-semibold text-text">{m.week_unscheduled()}</span>
						<span class="font-mono text-[12px] text-text-3">{unscheduled.length}</span>
					</button>
					{@render unscheduledTabs()}
				</div>
				{#if !unscheduledCollapsed}
					<div transition:slide={{ duration: 180, easing: cubicOut }}>
						{#each unscheduled as t (t.id)}
							<TaskRow
								task={t}
								selected={selectedId === t.id}
								showTime
								onclick={() => (selectedId = t.id)}
							/>
						{/each}
						{#if unscheduled.length === 0}
							<div
								class="flex items-center gap-2 border-b border-border/60 px-4 py-3 text-[13px] sm:px-5"
							>
								<Icon name="check" size={14} class="text-text-3" />
								<span class="text-text-2">{m.week_inbox_zero()}</span>
								<span class="text-text-4">{m.week_unscheduled_hint()}</span>
							</div>
						{/if}
					</div>
				{/if}
			</section>
		</div>
	{/if}
</div>

<Inspector
	taskId={selectedId}
	summary={selected}
	onclose={() => (selectedId = null)}
	users={data.users}
	onopen={(id) => (selectedId = id)}
/>

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
