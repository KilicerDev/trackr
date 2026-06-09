<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import Inspector from '$lib/components/tasks/Inspector.svelte';
	import CreateTaskModal from '$lib/components/tasks/CreateTaskModal.svelte';
	import MWTaskRow from '$lib/components/week/MWTaskRow.svelte';
	import SmartComposer from '$lib/components/week/SmartComposer.svelte';
	import type { ComposerDraft } from '$lib/components/week/SmartComposer.svelte';
	import PriorityBars from '$lib/components/PriorityBars.svelte';
	import { resolveProject } from '$lib/lookup.svelte';
	import { formatEstimate } from '$lib/data';
	import { showToast } from '$lib/toast.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { readView, saveView } from '$lib/viewState';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { m } from '$lib/paraglide/messages';
	import type { ActionResult } from '@sveltejs/kit';
	import type { Task } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type SavedWeekView = {
		weekStart?: string;
		tab?: 'past' | 'mine' | 'others';
		// ISO dates the user has collapsed. Persisted by date (not weekday index)
		// so collapsing one day doesn't collapse that weekday in every week.
		collapsedDates?: string[];
	};
	// localStorage cache wins over the server snapshot — it's mirrored on
	// every saveView() call so it always reflects the latest in-tab change,
	// even before the debounced server write has flushed.
	const saved: SavedWeekView = {
		...((data.savedView ?? {}) as SavedWeekView),
		...readView<SavedWeekView>('week')
	};

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
		new Set(data.weekDates.map((iso, i) => (collapsedDates.has(iso) ? i : -1)).filter((i) => i >= 0))
	);
	let composerDay = $state<number | null>(null);
	let selectedId = $state<string | null>(null);
	let selected = $derived(
		selectedId ? data.tasks.find((t) => t.id === selectedId) ?? null : null
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
		const iso = composerDay !== null ? data.weekDates[composerDay] ?? null : null;
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
			for (const t of plannedByDay[i]) total += t.estimate ?? DEFAULT_ESTIMATE;
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
		return plannedByDay[i].reduce((s, t) => s + (t.estimate ?? DEFAULT_ESTIMATE), 0);
	}

	type UnscheduledTab = 'past' | 'mine' | 'others';
	const validTab = (t: unknown): t is UnscheduledTab =>
		t === 'past' || t === 'mine' || t === 'others';
	let unscheduledTab = $state<UnscheduledTab>(validTab(saved.tab) ? saved.tab : 'past');
	function setUnscheduledTab(t: UnscheduledTab) {
		unscheduledTab = t;
		saveView('week', { tab: t });
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
				.sort((a, b) => (a.plannedFor! < b.plannedFor! ? -1 : a.plannedFor! > b.plannedFor! ? 1 : 0))
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
		const rest = data.tasks.filter(
			(t) => isOpen(t) && !t.plannedFor && !(t.inMyPlan && mine(t))
		);
		const planned = rest.filter((t) => t.inMyPlan);
		const others = rest.filter((t) => !t.inMyPlan);
		return [...planned, ...others].slice(0, 16);
	});

	function weekRangeLabel(): string {
		if (data.weekDates.length === 0) return '';
		const first = new Date(data.weekDates[0] + 'T00:00:00Z');
		const last = new Date(data.weekDates[6] + 'T00:00:00Z');
		const f = first.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
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
			(Date.UTC(
				...(data.weekStartIso.split('-').map(Number) as [number, number, number])
			) -
				Date.UTC(
					...(currentWeekStart.split('-').map(Number) as [number, number, number])
				)) /
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

<svelte:head><title>Trackr · {m.week_title()}</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: m.week_title() }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="flex items-center gap-3 px-6 py-3 border-b border-border">
		<Button size="sm" variant="default" onclick={() => gotoWeek(null)} disabled={weekDelta === 0}>
			{m.common_today()}
		</Button>
		<div class="inline-flex bg-surface border border-border rounded-lg overflow-hidden">
			<button
				type="button"
				aria-label={m.week_previous_week()}
				onclick={() => gotoWeek(addDays(data.weekStartIso, -7))}
				class="w-7 h-7 grid place-items-center text-text-3 hover:text-text hover:bg-surface-2"
			>
				<Icon name="chevron-r" size={12} class="rotate-180" />
			</button>
			<button
				type="button"
				aria-label={m.week_next_week()}
				onclick={() => gotoWeek(addDays(data.weekStartIso, 7))}
				class="w-7 h-7 grid place-items-center text-text-3 hover:text-text hover:bg-surface-2"
			>
				<Icon name="chevron-r" size={12} />
			</button>
		</div>
		<div class="text-[13.5px] text-text-2 flex items-center gap-2">
			<span class="text-text font-mono font-medium tracking-tight">{weekLabel}</span>
			{#if weekDelta === 0}
				<span
					class="px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] font-medium rounded-full text-accent"
					style:background="rgba(239,122,109,0.14)">{m.week_now()}</span
				>
			{/if}
			<span class="text-text-4">·</span>
			<span class="text-text-3 font-mono text-[12.5px]">{weekRangeLabel()}</span>
		</div>
		<div class="ml-auto flex items-center gap-3 bg-bg-elev border border-border rounded-xl px-3.5 py-2">
			<div class="text-right">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">{m.week_capacity()}</div>
				<div class="font-mono text-[13px] text-text">{Math.round(weekMinutes / 60)}h / 40h</div>
			</div>
			<div class="w-24 h-1.5 rounded-full bg-surface overflow-hidden">
				<div
					class="h-full bg-accent"
					style:width="{Math.min(100, (weekMinutes / WEEK_CAPACITY) * 100)}%"
				></div>
			</div>
		</div>
	</div>

	<div class="grid gap-5 px-6 py-5" style:grid-template-columns="1fr 320px">
		<div class="space-y-2.5">
			{#each WEEK_DAYS as day, i (day)}
				{@const tasks = plannedByDay[i]}
				{@const mins = dayMinutes(i)}
				{@const isToday = i === todayIndex}
				{@const isWeekend = i >= 5}
				{@const isCollapsed = collapsed.has(i)}
				{@const pct = Math.min(100, (mins / CAPACITY) * 100)}
				{@const over = mins > CAPACITY}
				<div
					class="bg-bg-elev border rounded-2xl transition-colors {isToday
						? 'border-accent/40'
						: 'border-border'} {isWeekend ? 'opacity-85' : ''}"
				>
					<button
						type="button"
						onclick={() => toggle(i)}
						class="flex items-center gap-2.5 w-full px-4 py-3 hover:bg-surface/40 text-left rounded-t-2xl {isCollapsed ? 'rounded-b-2xl' : ''}"
					>
						<span class="transition-transform text-text-3 {isCollapsed ? '-rotate-90' : ''}">
							<Icon name="chevron" size={12} />
						</span>
						<span class="text-[14px] font-semibold text-text">{WEEK_DAY_LABELS[i]()}</span>
						<span class="text-text-4 font-mono text-[12px]">{dayLabels[i].dayOfMonth}</span>
						{#if isToday}
							<span
								class="px-2 py-0.5 text-[10.5px] uppercase tracking-[0.06em] font-medium rounded-full text-accent"
								style:background="rgba(239,122,109,0.14)">{m.common_today()}</span
							>
						{/if}
						<span class="font-mono text-[11px] text-text-3">{tasks.length}</span>
						<div class="ml-auto flex items-center gap-2.5">
							<div class="w-28 h-1 rounded-full bg-surface overflow-hidden">
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
							<span class="font-mono text-[11px] text-text-3 w-12 text-right">
								{Math.floor(mins / 60)}h{mins % 60 > 0 ? `${mins % 60}m` : ''}
							</span>
						</div>
					</button>
					{#if !isCollapsed}
						<div transition:slide={{ duration: 180, easing: cubicOut }}>
							{#each tasks as t (t.id)}
								<MWTaskRow task={t} onclick={() => (selectedId = t.id)} />
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
								<div class="px-3.5 py-2 flex items-center gap-1.5">
									<button
										type="button"
										onclick={() => (composerDay = i)}
										class="flex items-center gap-1.5 text-[12px] text-text-3 hover:text-text px-2 py-1 rounded-md hover:bg-surface transition-colors"
									>
										<Icon name="plus" size={12} /> {m.week_add_task()}
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<aside class="bg-bg-elev border border-border rounded-2xl flex flex-col self-start">
			<div class="px-4 pt-4 pb-2">
				<div class="flex items-center gap-2">
					<span class="text-[13px] font-semibold text-text">{m.week_unscheduled()}</span>
					<span class="font-mono text-[11px] text-text-3">{unscheduled.length}</span>
				</div>
				<p class="text-[11.5px] text-text-4 mt-1">{m.week_unscheduled_hint()}</p>
			</div>
			<div class="px-4 pb-2">
				<div
					class="inline-flex items-center h-7 bg-surface border border-border rounded-lg p-0.5 text-[11.5px] w-full"
				>
					{#each [['past', m.week_tab_past()], ['mine', m.week_tab_my_tasks()], ['others', m.week_tab_others()]] as [k, lbl] (k)}
						<button
							type="button"
							onclick={() => setUnscheduledTab(k as UnscheduledTab)}
							class="flex-1 h-full rounded-md transition-colors {unscheduledTab === k
								? 'bg-bg-elev text-text'
								: 'text-text-3 hover:text-text'}"
						>
							{lbl}
						</button>
					{/each}
				</div>
			</div>
			<div class="px-2 pb-3 space-y-1">
				{#each unscheduled as t (t.id)}
					{@const proj = resolveProject(t.project)}
					<button
						type="button"
						onclick={() => (selectedId = t.id)}
						class="w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface transition-colors leading-none"
					>
						<span class="inline-flex items-center justify-center w-3 h-3 shrink-0">
							{#if t.inMyPlan}
								<span class="text-accent inline-flex" title={m.week_in_your_week()}>
									<Icon name="bookmark" size={11} />
								</span>
							{:else}
								<span
									class="w-2 h-2 rounded-full"
									style:background={proj?.color ?? '#7c7c84'}
								></span>
							{/if}
						</span>
						<span class="font-mono text-[10.5px] text-text-3">{t.id}</span>
						<PriorityBars priority={t.priority} />
						<span class="text-[12.5px] text-text truncate flex-1">{t.title}</span>
						<span class="font-mono text-[10px] {t.estimate ? 'text-text-4' : 'text-text-4/60'}">
							{t.estimate ? formatEstimate(t.estimate) : '—'}
						</span>
					</button>
				{/each}
				{#if unscheduled.length === 0}
					<div class="text-center py-8 text-text-3">
						<div
							class="inline-grid place-items-center w-9 h-9 rounded-xl bg-surface border border-border mb-2"
						>
							<Icon name="check" size={15} />
						</div>
						<div class="text-[12px] text-text-2">{m.week_inbox_zero()}</div>
					</div>
				{/if}
			</div>
		</aside>
	</div>
</div>

<Inspector task={selected} onclose={() => (selectedId = null)} users={data.users} />

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
