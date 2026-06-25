<script lang="ts">
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import FilterBar from '../FilterBar.svelte';
	import type { FilterField } from '../FilterBar.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { TRACKR_PRIORITIES, TRACKR_STATUSES, TRACKR_LABELS } from '$lib/config/taxonomy';
	import { labelMeta } from '$lib/utils/label-meta';
	import { page } from '$app/state';
	import { statusLabel, priorityLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';

	type LayoutData = {
		users?: { id: string; name: string; initials: string; color: string; status: string }[];
		projects?: { key: string; name: string; color: string }[];
		tasks?: { labels?: string[] }[];
	};

	// Predefined labels + every tag actually in use across the loaded tasks,
	// so custom (free-form) tags are filterable too. Predefined come first.
	const allTags = $derived.by(() => {
		const seen = new Set<string>(Object.keys(TRACKR_LABELS));
		const extra: string[] = [];
		for (const t of (page.data as LayoutData).tasks ?? []) {
			for (const l of t.labels ?? []) {
				if (!seen.has(l)) {
					seen.add(l);
					extra.push(l);
				}
			}
		}
		return [...Object.keys(TRACKR_LABELS), ...extra];
	});

	type GroupBy = 'status' | 'priority' | 'assignee' | 'project' | 'none';
	type SubBy = 'none' | 'status' | 'priority' | 'assignee';
	type TimeWindow = '7d' | '14d' | '30d' | '90d' | 'all';

	interface Props {
		view: 'list' | 'board';
		setView: (v: 'list' | 'board') => void;
		filters: Record<string, string[]>;
		setFilters: (f: Record<string, string[]>) => void;
		search: string;
		setSearch: (s: string) => void;
		group?: GroupBy;
		setGroup?: (g: GroupBy) => void;
		sub?: SubBy;
		setSub?: (s: SubBy) => void;
		time?: TimeWindow;
		setTime?: (t: TimeWindow) => void;
		onNewTask?: () => void;
		canCreate?: boolean;
	}
	let {
		view,
		setView,
		filters,
		setFilters,
		search,
		setSearch,
		group = 'status',
		setGroup,
		sub = 'status',
		setSub,
		time = '30d',
		setTime,
		onNewTask,
		canCreate = true
	}: Props = $props();

	const GROUP_OPTIONS: { id: GroupBy; label: () => string }[] = [
		{ id: 'status', label: m.tasks_group_status },
		{ id: 'priority', label: m.tasks_group_priority },
		{ id: 'assignee', label: m.tasks_group_assignee },
		{ id: 'project', label: m.tasks_group_project },
		{ id: 'none', label: m.common_none }
	];
	const SUB_OPTIONS: { id: SubBy; label: () => string }[] = [
		{ id: 'status', label: m.tasks_group_status },
		{ id: 'priority', label: m.tasks_group_priority },
		{ id: 'assignee', label: m.tasks_group_assignee },
		{ id: 'none', label: m.common_none }
	];

	const TIME_OPTIONS: { id: TimeWindow; label: () => string }[] = [
		{ id: '7d', label: m.tasks_time_next_7_days },
		{ id: '14d', label: m.tasks_time_next_2_weeks },
		{ id: '30d', label: m.tasks_time_next_month },
		{ id: '90d', label: m.tasks_time_next_3_months },
		{ id: 'all', label: m.common_all }
	];

	const groupLabel = (id: GroupBy) => GROUP_OPTIONS.find((g) => g.id === id)?.label() ?? '';
	const subLabel = (id: SubBy) => SUB_OPTIONS.find((s) => s.id === id)?.label() ?? '';
	const timeLabel = (id: TimeWindow) => TIME_OPTIONS.find((t) => t.id === id)?.label() ?? '';

	const FIELDS: FilterField[] = [
		{ id: 'status', label: m.tasks_group_status(), icon: 'check' },
		{ id: 'priority', label: m.tasks_group_priority(), icon: 'filter' },
		{ id: 'assignee', label: m.tasks_group_assignee(), icon: 'users' },
		{ id: 'project', label: m.tasks_group_project(), icon: 'folder' },
		{ id: 'tags', label: m.tasks_tags(), icon: 'bookmark' }
	];

	// The Group / Subgroup / Time menus are anchored with `position: fixed`
	// (not absolute) so the controls can sit inside a horizontally-scrollable
	// strip without the dropdowns getting clipped by its overflow.
	let pop = $state<'group' | 'sub' | 'time' | null>(null);
	let popAnchor: HTMLElement | null = null;
	let popPos = $state<{ left: number; top: number } | null>(null);

	function openPop(name: 'group' | 'sub' | 'time', el: HTMLElement) {
		if (pop === name) {
			pop = null;
			popAnchor = null;
			return;
		}
		pop = name;
		popAnchor = el;
		queueMicrotask(positionPop);
	}

	function positionPop() {
		if (!popAnchor) {
			popPos = null;
			return;
		}
		const r = popAnchor.getBoundingClientRect();
		// Clamp so the menu never spills past the right viewport edge.
		const W = 190;
		const maxLeft = Math.max(8, window.innerWidth - W - 8);
		popPos = { left: Math.min(r.left, maxLeft), top: r.bottom + 6 };
	}

	$effect(() => {
		if (!pop) return;
		const on = () => positionPop();
		// Capture phase catches scrolls on the controls strip too, not just window.
		window.addEventListener('resize', on);
		window.addEventListener('scroll', on, true);
		return () => {
			window.removeEventListener('resize', on);
			window.removeEventListener('scroll', on, true);
		};
	});

	function toggleValue(field: string, value: string) {
		const cur = filters[field] ?? [];
		const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
		const merged = { ...filters, [field]: next };
		if (next.length === 0) delete merged[field];
		setFilters(merged);
	}

	// Resolve a raw filter value (status id, user id, project key, …) to the
	// human label shown in the chip. Falls back to the raw value if no match —
	// better to surface a stale id than to blank the chip out.
	function valueLabel(field: string, value: string): string {
		if (field === 'status')
			return TRACKR_STATUSES.find((s) => s.id === value) ? statusLabel(value) : value;
		if (field === 'priority')
			return TRACKR_PRIORITIES.find((p) => p.id === value) ? priorityLabel(value) : value;
		if (field === 'assignee') {
			const u = ((page.data as LayoutData).users ?? []).find((x) => x.id === value);
			return u?.name ?? value;
		}
		if (field === 'project') {
			const p = ((page.data as LayoutData).projects ?? []).find((x) => x.key === value);
			return p?.name ?? value;
		}
		if (field === 'tags') return labelMeta(value).label;
		return value;
	}
</script>

{#snippet valuesList(field: string)}
	{@const values = filters[field] ?? []}
	{#if field === 'status'}
		{#each TRACKR_STATUSES as s (s.id)}
			<button
				type="button"
				onclick={() => toggleValue('status', s.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<StatusDot status={s.id} />
				<span class="text-[13px]">{statusLabel(s.id)}</span>
				<span class="ml-auto text-accent {values.includes(s.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{:else if field === 'priority'}
		{#each TRACKR_PRIORITIES as p (p.id)}
			<button
				type="button"
				onclick={() => toggleValue('priority', p.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<PriorityBars priority={p.id} />
				<span class="text-[13px]">{priorityLabel(p.id)}</span>
				<span class="ml-auto text-accent {values.includes(p.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{:else if field === 'assignee'}
		{@const dbUsers = ((page.data as LayoutData).users ?? []).filter(
			(u) => u.status !== 'disabled'
		)}
		{#each dbUsers as u (u.id)}
			<button
				type="button"
				onclick={() => toggleValue('assignee', u.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<Avatar user={u} size={20} />
				<span class="text-[13px]">{u.name}</span>
				<span class="ml-auto text-accent {values.includes(u.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{:else if field === 'project'}
		{@const dbProjects = (page.data as LayoutData).projects ?? []}
		{#each dbProjects as p (p.key)}
			<button
				type="button"
				onclick={() => toggleValue('project', p.key)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={p.color}></span>
				<span class="text-[13px]">{p.name}</span>
				<span class="ml-auto text-accent {values.includes(p.key) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{:else if field === 'tags'}
		{#each allTags as id (id)}
			{@const l = labelMeta(id)}
			<button
				type="button"
				onclick={() => toggleValue('tags', id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={l.color}></span>
				<span class="truncate text-[13px]">{l.label}</span>
				<span class="ml-auto text-accent {values.includes(id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{/if}
{/snippet}

<div class="flex shrink-0 items-center gap-2 border-b border-border bg-bg px-5 py-2.5">
	<!-- Controls strip: scrolls horizontally as a last resort on very narrow
	     widths instead of wrapping or squeezing. New task stays pinned outside. -->
	<div class="tb-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
		<div
			class="inline-flex h-7 shrink-0 items-center rounded-lg border border-border bg-surface p-0.5 text-[12.5px]"
		>
			<button
				type="button"
				onclick={() => setView('list')}
				class="inline-flex h-full items-center gap-1.5 rounded-md px-2 transition-colors {view ===
				'list'
					? 'bg-bg-elev text-text'
					: 'text-text-3 hover:text-text'}"
			>
				<Icon name="list" size={13} />
				{m.tasks_view_list()}
			</button>
			<button
				type="button"
				onclick={() => setView('board')}
				class="inline-flex h-full items-center gap-1.5 rounded-md px-2 transition-colors {view ===
				'board'
					? 'bg-bg-elev text-text'
					: 'text-text-3 hover:text-text'}"
			>
				<Icon name="board" size={13} />
				{m.tasks_view_board()}
			</button>
		</div>

		<div class="h-5 w-px shrink-0 bg-border"></div>

		<!-- Group -->
		<div class="shrink-0">
			<button
				type="button"
				onclick={(e) => openPop('group', e.currentTarget)}
				class="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] whitespace-nowrap transition-colors hover:bg-surface-2"
			>
				<span class="text-text-3">{m.tasks_group_by()}</span>
				<span class="font-medium text-text">{groupLabel(group)}</span>
				<Icon name="chevron" size={10} class="text-text-3" />
			</button>
			{#if pop === 'group' && popPos}
				<div
					use:clickOutside={() => (pop = null)}
					in:fly={POPOVER_IN}
					class="fixed z-50 min-w-[170px] rounded-[10px] border border-border bg-bg-elev p-1.5"
					style:left="{popPos.left}px"
					style:top="{popPos.top}px"
					style:box-shadow="var(--shadow-lg)"
				>
					{#each GROUP_OPTIONS as o (o.id)}
						<button
							type="button"
							onclick={() => {
								setGroup?.(o.id);
								pop = null;
							}}
							class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
						>
							<span>{o.label()}</span>
							<span class="ml-auto text-accent {group === o.id ? 'opacity-100' : 'opacity-0'}">
								<Icon name="check" size={12} />
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Sub (board view only) -->
		{#if view === 'board'}
			<div class="shrink-0">
				<button
					type="button"
					onclick={(e) => openPop('sub', e.currentTarget)}
					class="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] whitespace-nowrap transition-colors hover:bg-surface-2"
				>
					<span class="text-text-3">{m.tasks_sub_group()}</span>
					<span class="font-medium text-text">{subLabel(sub)}</span>
					<Icon name="chevron" size={10} class="text-text-3" />
				</button>
				{#if pop === 'sub' && popPos}
					<div
						use:clickOutside={() => (pop = null)}
						in:fly={POPOVER_IN}
						class="fixed z-50 min-w-[170px] rounded-[10px] border border-border bg-bg-elev p-1.5"
						style:left="{popPos.left}px"
						style:top="{popPos.top}px"
						style:box-shadow="var(--shadow-lg)"
					>
						{#each SUB_OPTIONS as o (o.id)}
							<button
								type="button"
								onclick={() => {
									setSub?.(o.id);
									pop = null;
								}}
								class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
							>
								<span>{o.label()}</span>
								<span class="ml-auto text-accent {sub === o.id ? 'opacity-100' : 'opacity-0'}">
									<Icon name="check" size={12} />
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<div class="h-5 w-px shrink-0 bg-border"></div>

		<!-- Time window: forward horizon for end/planned dates (past always shown) -->
		<div class="shrink-0">
			<button
				type="button"
				onclick={(e) => openPop('time', e.currentTarget)}
				class="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] whitespace-nowrap transition-colors hover:bg-surface-2"
			>
				<Icon name="calendar" size={13} class="text-text-3" />
				<span class="text-text-3">{m.tasks_time()}</span>
				<span class="font-medium text-text">{timeLabel(time)}</span>
				<Icon name="chevron" size={10} class="text-text-3" />
			</button>
			{#if pop === 'time' && popPos}
				<div
					use:clickOutside={() => (pop = null)}
					in:fly={POPOVER_IN}
					class="fixed z-50 min-w-[170px] rounded-[10px] border border-border bg-bg-elev p-1.5"
					style:left="{popPos.left}px"
					style:top="{popPos.top}px"
					style:box-shadow="var(--shadow-lg)"
				>
					{#each TIME_OPTIONS as o (o.id)}
						<button
							type="button"
							onclick={() => {
								setTime?.(o.id);
								pop = null;
							}}
							class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
						>
							<span>{o.label()}</span>
							<span class="ml-auto text-accent {time === o.id ? 'opacity-100' : 'opacity-0'}">
								<Icon name="check" size={12} />
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<div class="h-5 w-px shrink-0 bg-border"></div>

		<!-- Filter chips expand to fit their active chips; the "+ Filter" chip stays
	     pinned at the left edge (min width). On very narrow widths the whole strip
	     scrolls (its popovers are fixed, so no clipping). -->
		<div class="min-w-[84px] shrink-0">
			<FilterBar fields={FIELDS} {filters} {setFilters} {valueLabel} {valuesList} />
		</div>

		<!-- Search stays compact and right-aligned (ml-auto eats the slack), but is
	     allowed to shrink as the toolbar narrows so the controls never squeeze
	     or wrap; past its min the whole strip scrolls instead. -->
		<div class="relative ml-auto w-44 min-w-[120px] shrink">
			<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3">
				<Icon name="search" size={13} />
			</span>
			<input
				type="text"
				placeholder={m.common_search()}
				value={search}
				oninput={(e) => setSearch((e.target as HTMLInputElement).value)}
				class="h-7 w-full rounded-lg border border-border bg-surface pr-2.5 pl-7 text-[12.5px] text-text outline-none placeholder:text-text-3 focus:border-border-strong"
			/>
		</div>
	</div>

	{#if canCreate}
		<div class="shrink-0">
			<Button variant="primary" size="sm" onclick={onNewTask}>
				<Icon name="plus" size={13} />
				{m.tasks_new_task()}
			</Button>
		</div>
	{/if}
</div>

<style>
	/* Hide the controls-strip scrollbar; it only scrolls on very narrow widths. */
	.tb-scroll {
		scrollbar-width: none;
	}
	.tb-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
