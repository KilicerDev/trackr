<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Inspector from '$lib/components/tasks/Inspector.svelte';
	import CreateTaskModal from '$lib/components/tasks/CreateTaskModal.svelte';
	import MWTaskRow from '$lib/components/week/MWTaskRow.svelte';
	import SmartComposer from '$lib/components/week/SmartComposer.svelte';
	import type { ComposerDraft } from '$lib/components/week/SmartComposer.svelte';
	import PriorityBars from '$lib/components/PriorityBars.svelte';
	import { TRACKR_TASKS, formatEstimate } from '$lib/data';
	import type { Task } from '$lib/types';

	const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
	const WEEK_DATES = [11, 12, 13, 14, 15, 16, 17];
	const TODAY_INDEX = 1;
	const DEFAULT_ESTIMATE = 60;

	const WEEK_PLAN: Record<string, number> = {
		'TRACKR-70': 0,
		'SIWEB-15': 0,
		'TRACKR-66': 1,
		'SIWEB-21': 1,
		'SIWEB-19': 1,
		'TRACKR-93': 2,
		'SIWEB-18': 2,
		'TRACKR-71': 3,
		'MAJA-16': 3,
		'WEBIM-7': 4,
		'SIWEB-44': 4,
		'WEBIM-3': 4
	};

	let collapsed = $state<Set<number>>(new Set());
	let composerDay = $state<number | null>(null);
	let selected = $state<Task | null>(null);

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

	let plannedByDay = $derived.by(() => {
		const out: Record<number, Task[]> = {};
		for (let i = 0; i < 7; i++) out[i] = [];
		for (const t of TRACKR_TASKS) {
			const d = WEEK_PLAN[t.id];
			if (d !== undefined) out[d].push(t);
		}
		return out;
	});

	let stats = $derived.by(() => {
		const today = plannedByDay[TODAY_INDEX];
		const done = today.filter((t) => t.status === 'done').length;
		const left = today.length - done;
		const planned = today.length;
		return { planned, done, left };
	});

	let weekMinutes = $derived.by(() => {
		let total = 0;
		for (let i = 0; i < 5; i++) {
			for (const t of plannedByDay[i]) {
				total += t.estimate ?? DEFAULT_ESTIMATE;
			}
		}
		return total;
	});

	let nextFocus = $derived(plannedByDay[TODAY_INDEX].find((t) => t.status !== 'done'));

	function toggle(i: number) {
		const n = new Set(collapsed);
		n.has(i) ? n.delete(i) : n.add(i);
		collapsed = n;
	}

	function dayMinutes(i: number): number {
		return plannedByDay[i].reduce((s, t) => s + (t.estimate ?? DEFAULT_ESTIMATE), 0);
	}

	const CAPACITY = 8 * 60;
	const WEEK_CAPACITY = 5 * 8 * 60;

	let unscheduledTab = $state<'mine' | 'assigned' | 'all'>('mine');

	let unscheduled = $derived.by(() => {
		const planned = new Set(Object.keys(WEEK_PLAN));
		let base = TRACKR_TASKS.filter(
			(t) => !planned.has(t.id) && t.status !== 'done' && t.status !== 'in_review'
		);
		if (unscheduledTab === 'mine') base = base.filter((t) => t.assignee === 'u6');
		else if (unscheduledTab === 'assigned') base = base.filter((t) => (t.assignees ?? [t.assignee]).includes('u6'));
		return base.slice(0, 8);
	});
</script>

<svelte:head><title>Trackr · My Week</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'My Week' }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<!-- Toolbar -->
	<div class="flex items-center gap-3 px-6 py-3 border-b border-border">
		<Button size="sm" variant="default">Today</Button>
		<div class="inline-flex bg-surface border border-border rounded-lg overflow-hidden">
			<button class="w-7 h-7 grid place-items-center text-text-3 hover:text-text hover:bg-surface-2"><Icon name="chevron-r" size={12} class="rotate-180" /></button>
			<button class="w-7 h-7 grid place-items-center text-text-3 hover:text-text hover:bg-surface-2"><Icon name="chevron-r" size={12} /></button>
		</div>
		<div class="text-[13.5px] text-text-2">
			<span class="text-text font-medium">Week 20 · 2026</span>
			<span class="text-text-4 mx-2">·</span>
			<span class="text-text-3 font-mono text-[12.5px]">May 11 — 17</span>
		</div>
		<div class="ml-auto flex items-center gap-3 bg-bg-elev border border-border rounded-xl px-3.5 py-2">
			<div class="text-right">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Capacity</div>
				<div class="font-mono text-[13px] text-text">
					{Math.round(weekMinutes / 60)}h / 40h
				</div>
			</div>
			<div class="w-24 h-1.5 rounded-full bg-surface overflow-hidden">
				<div class="h-full bg-accent" style:width="{Math.min(100, (weekMinutes / WEEK_CAPACITY) * 100)}%"></div>
			</div>
		</div>
	</div>

	<!-- Today hero -->
	<div class="mx-6 mt-5 relative rounded-2xl border border-border bg-bg-elev p-5 overflow-hidden">
		<div class="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-30" style:background="radial-gradient(circle, rgba(239,122,109,0.5), transparent 60%)"></div>
		<div class="relative">
			<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-2">Today · Tuesday, May 12</div>
			<h1 class="text-[28px] font-semibold tracking-[-0.014em] text-text leading-[1.1] mb-5">
				{#if stats.left > 0}{stats.left} of {stats.planned} tasks left{:else}Open day — nothing planned{/if}
			</h1>
			<div class="flex gap-6">
				<div>
					<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Planned</div>
					<div class="text-[22px] font-semibold font-mono">{stats.planned}</div>
				</div>
				<div>
					<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Done</div>
					<div class="text-[22px] font-semibold font-mono text-[#7fc8a9]">{stats.done}</div>
				</div>
				<div>
					<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Left</div>
					<div class="text-[22px] font-semibold font-mono text-accent">{stats.left}</div>
				</div>
			</div>
			{#if nextFocus}
				<div class="mt-5 flex items-center gap-3 p-3 rounded-xl bg-surface border border-border">
					<div class="flex-1 min-w-0">
						<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4 mb-1">Focus on next</div>
						<div class="flex items-center gap-2.5">
							<PriorityBars priority={nextFocus.priority} />
							<span class="font-mono text-[11.5px] text-text-3">{nextFocus.id}</span>
							<span class="text-[13.5px] text-text truncate">{nextFocus.title}</span>
						</div>
					</div>
					<Button variant="primary" size="sm" onclick={() => (selected = nextFocus ?? null)}>Start</Button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Grid -->
	<div class="grid gap-5 px-6 py-5" style:grid-template-columns="1fr 320px">
		<div class="space-y-2.5">
			{#each WEEK_DAYS as day, i (day)}
				{@const tasks = plannedByDay[i]}
				{@const mins = dayMinutes(i)}
				{@const isToday = i === TODAY_INDEX}
				{@const isWeekend = i >= 5}
				{@const isCollapsed = collapsed.has(i)}
				{@const pct = Math.min(100, (mins / CAPACITY) * 100)}
				{@const over = mins > CAPACITY}
				<div
					class="bg-bg-elev border rounded-2xl overflow-hidden transition-colors {isToday ? 'border-accent/40' : 'border-border'} {isWeekend ? 'opacity-85' : ''}"
				>
					<button
						type="button"
						onclick={() => toggle(i)}
						class="flex items-center gap-2.5 w-full px-4 py-3 hover:bg-surface/40 text-left"
					>
						<span class="transition-transform text-text-3 {isCollapsed ? '-rotate-90' : ''}">
							<Icon name="chevron" size={12} />
						</span>
						<span class="text-[14px] font-semibold text-text">{day}</span>
						<span class="text-text-4 font-mono text-[12px]">{WEEK_DATES[i]}</span>
						{#if isToday}
							<span class="px-2 py-0.5 text-[10.5px] uppercase tracking-[0.06em] font-medium rounded-full bg-accent-soft text-accent" style:background="rgba(239,122,109,0.14)">Today</span>
						{/if}
						<span class="font-mono text-[11px] text-text-3">{tasks.length}</span>
						<div class="ml-auto flex items-center gap-2.5">
							<div class="w-28 h-1 rounded-full bg-surface overflow-hidden">
								<div class="h-full" style:width="{pct}%" style:background={over ? '#ef4f5e' : isToday ? 'var(--accent)' : 'var(--text-3)'}></div>
							</div>
							<span class="font-mono text-[11px] text-text-3 w-12 text-right">
								{Math.floor(mins / 60)}h{mins % 60 > 0 ? `${mins % 60}m` : ''}
							</span>
						</div>
					</button>
					{#if !isCollapsed}
						<div>
							{#each tasks as t (t.id)}
								<MWTaskRow task={t} onclick={() => (selected = t)} />
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

		<!-- Unscheduled rail -->
		<aside class="bg-bg-elev border border-border rounded-2xl flex flex-col self-start">
			<div class="px-4 pt-4 pb-2">
				<div class="flex items-center gap-2">
					<span class="text-[13px] font-semibold text-text">Unscheduled</span>
					<span class="font-mono text-[11px] text-text-3">{unscheduled.length}</span>
				</div>
				<p class="text-[11.5px] text-text-4 mt-1">Drag onto a day to plan it.</p>
			</div>
			<div class="px-4 pb-2">
				<div class="inline-flex items-center h-7 bg-surface border border-border rounded-lg p-0.5 text-[11.5px] w-full">
					{#each [['mine', 'Mine'], ['assigned', 'Assigned'], ['all', 'All']] as [k, lbl] (k)}
						<button
							type="button"
							onclick={() => (unscheduledTab = k as any)}
							class="flex-1 h-full rounded-md transition-colors {unscheduledTab === k ? 'bg-bg-elev text-text' : 'text-text-3 hover:text-text'}"
						>
							{lbl}
						</button>
					{/each}
				</div>
			</div>
			<div class="px-2 pb-3 space-y-1">
				{#each unscheduled as t (t.id)}
					<button
						type="button"
						onclick={() => (selected = t)}
						class="w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface transition-colors cursor-grab active:cursor-grabbing"
					>
						<span class="w-2 h-2 rounded-full" style:background={t.project === 'TRACKR' ? '#7a9cf0' : t.project === 'SIWEB' ? '#e07a5f' : t.project === 'MAJA' ? '#c08bd6' : '#7fc8a9'}></span>
						<span class="font-mono text-[10.5px] text-text-3">{t.id}</span>
						<PriorityBars priority={t.priority} />
						<span class="text-[12.5px] text-text truncate flex-1">{t.title}</span>
						<span class="font-mono text-[10px] text-text-4">{formatEstimate(t.estimate ?? DEFAULT_ESTIMATE)}</span>
					</button>
				{/each}
				{#if unscheduled.length === 0}
					<div class="text-center py-8 text-text-3">
						<div class="inline-grid place-items-center w-9 h-9 rounded-xl bg-surface border border-border mb-2">
							<Icon name="check" size={15} />
						</div>
						<div class="text-[12px] text-text-2">Inbox zero. Plan something new.</div>
					</div>
				{/if}
			</div>
		</aside>
	</div>
</div>

<Inspector task={selected} onclose={() => (selected = null)} />

<CreateTaskModal
	open={creating}
	prefill={createPrefill}
	onclose={() => (creating = false)}
/>
