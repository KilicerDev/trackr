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
	import type { Task } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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

	let collapsed = $state<Set<number>>(new Set());
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
	}>({});

	function expandComposer(d: ComposerDraft) {
		createPrefill = {
			title: d.title,
			project: d.project,
			priority: d.priority,
			assignees: [d.assignee],
			estimate: d.estimate
		};
		creating = true;
		composerDay = null;
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
		const n = new Set(collapsed);
		n.has(i) ? n.delete(i) : n.add(i);
		collapsed = n;
	}

	function dayMinutes(i: number): number {
		return plannedByDay[i].reduce((s, t) => s + (t.estimate ?? DEFAULT_ESTIMATE), 0);
	}

	let unscheduledTab = $state<'mine' | 'assigned' | 'all'>('mine');
	type LayoutShape = { currentUserId?: string };
	const meId = $derived((data as unknown as LayoutShape).currentUserId);

	const unscheduled = $derived.by(() => {
		// "Unscheduled" = anything without a specific day, regardless of plan
		// status. Tasks the user explicitly added to their week (undated plans)
		// sit on top with a bookmark badge; the rest follow the active tab.
		const all = data.tasks.filter(
			(t) => !t.plannedFor && t.status !== 'done' && t.status !== 'in_review'
		);
		const planned = all.filter((t) => t.inMyPlan);

		let rest = all.filter((t) => !t.inMyPlan);
		if (unscheduledTab === 'mine' && meId) {
			rest = rest.filter((t) => t.assignee === meId);
		} else if (unscheduledTab === 'assigned' && meId) {
			rest = rest.filter((t) => (t.assignees ?? [t.assignee]).includes(meId));
		}
		return [...planned, ...rest].slice(0, 16);
	});

	function weekRangeLabel(): string {
		if (data.weekDates.length === 0) return '';
		const first = new Date(data.weekDates[0] + 'T00:00:00Z');
		const last = new Date(data.weekDates[6] + 'T00:00:00Z');
		const f = first.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
		const l = last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
		return `${f} — ${l}`;
	}

</script>

<svelte:head><title>Trackr · My Week</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'My Week' }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="flex items-center gap-3 px-6 py-3 border-b border-border">
		<Button size="sm" variant="default">Today</Button>
		<div class="inline-flex bg-surface border border-border rounded-lg overflow-hidden">
			<button class="w-7 h-7 grid place-items-center text-text-3 hover:text-text hover:bg-surface-2"
				><Icon name="chevron-r" size={12} class="rotate-180" /></button
			>
			<button class="w-7 h-7 grid place-items-center text-text-3 hover:text-text hover:bg-surface-2"
				><Icon name="chevron-r" size={12} /></button
			>
		</div>
		<div class="text-[13.5px] text-text-2">
			<span class="text-text font-medium">This week</span>
			<span class="text-text-4 mx-2">·</span>
			<span class="text-text-3 font-mono text-[12.5px]">{weekRangeLabel()}</span>
		</div>
		<div class="ml-auto flex items-center gap-3 bg-bg-elev border border-border rounded-xl px-3.5 py-2">
			<div class="text-right">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Capacity</div>
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
						<span class="text-[14px] font-semibold text-text">{day}</span>
						<span class="text-text-4 font-mono text-[12px]">{dayLabels[i].dayOfMonth}</span>
						{#if isToday}
							<span
								class="px-2 py-0.5 text-[10.5px] uppercase tracking-[0.06em] font-medium rounded-full text-accent"
								style:background="rgba(239,122,109,0.14)">Today</span
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
						<div>
							{#each tasks as t (t.id)}
								<MWTaskRow task={t} onclick={() => (selectedId = t.id)} />
							{/each}
							{#if composerDay === i}
								<SmartComposer
									onsubmit={() => (composerDay = null)}
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
										<Icon name="plus" size={12} /> Add task
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
					<span class="text-[13px] font-semibold text-text">Unscheduled</span>
					<span class="font-mono text-[11px] text-text-3">{unscheduled.length}</span>
				</div>
				<p class="text-[11.5px] text-text-4 mt-1">Open a task and pick a date to plan it.</p>
			</div>
			<div class="px-4 pb-2">
				<div
					class="inline-flex items-center h-7 bg-surface border border-border rounded-lg p-0.5 text-[11.5px] w-full"
				>
					{#each [['mine', 'Mine'], ['assigned', 'Assigned'], ['all', 'All']] as [k, lbl] (k)}
						<button
							type="button"
							onclick={() => (unscheduledTab = k as 'mine' | 'assigned' | 'all')}
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
								<span class="text-accent inline-flex" title="In your week">
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
						<span class="font-mono text-[10px] text-text-4"
							>{formatEstimate(t.estimate ?? DEFAULT_ESTIMATE)}</span
						>
					</button>
				{/each}
				{#if unscheduled.length === 0}
					<div class="text-center py-8 text-text-3">
						<div
							class="inline-grid place-items-center w-9 h-9 rounded-xl bg-surface border border-border mb-2"
						>
							<Icon name="check" size={15} />
						</div>
						<div class="text-[12px] text-text-2">Inbox zero. Plan something new.</div>
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
/>
