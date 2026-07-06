<script lang="ts">
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import Avatar from '../Avatar.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import FilterBar from '../FilterBar.svelte';
	import type { FilterField } from '../FilterBar.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { page } from '$app/state';
	import {
		TICKET_CATEGORIES,
		TICKET_PRIORITIES,
		TICKET_STATUSES,
		TRACKR_LABELS
	} from '$lib/config/taxonomy';
	import { labelMeta } from '$lib/utils/label-meta';
	import { m } from '$lib/paraglide/messages';
	import { ticketStatusLabel, ticketCategoryLabel, priorityLabel } from '$lib/utils/labels';

	type GroupBy = 'status' | 'priority' | 'category' | 'org' | 'assignee' | 'none';
	type SubBy = 'none' | 'status' | 'priority' | 'category' | 'assignee';

	type LayoutData = {
		users?: {
			id: string;
			name: string;
			initials: string;
			color: string;
			status: string;
			internal?: boolean;
		}[];
		tickets?: { tags?: string[] }[];
	};

	interface Props {
		view: 'list' | 'board';
		setView: (v: 'list' | 'board') => void;
		filters: Record<string, string[]>;
		setFilters: (f: Record<string, string[]>) => void;
		search: string;
		setSearch: (s: string) => void;
		group: GroupBy;
		setGroup: (g: GroupBy) => void;
		sub?: SubBy;
		setSub?: (s: SubBy) => void;
		onNew?: () => void;
		canCreate?: boolean;
		orgs?: { id: string; name: string; color: string }[];
		// Portal (client) mode: hide agent-oriented dimensions like assignee.
		portal?: boolean;
		// Minimal (portal member) mode: strip board/group/sub/filter chrome and
		// leave only search + New. The member sees a plain list of their own tickets.
		minimal?: boolean;
	}
	let {
		view,
		setView,
		filters,
		setFilters,
		search,
		setSearch,
		group,
		setGroup,
		sub = 'none',
		setSub,
		onNew,
		canCreate = true,
		orgs = [],
		portal = false,
		minimal = false
	}: Props = $props();

	// Assignees offered for grouping/filtering: internal agents only (tickets are
	// assigned to staff, not clients).
	const agents = $derived(
		((page.data as LayoutData).users ?? []).filter((u) => u.internal && u.status !== 'disabled')
	);

	// Predefined labels + every tag actually in use across the loaded (org-wide)
	// tickets, so custom free-form tags are filterable too. Predefined first.
	const allTags = $derived.by(() => {
		const seen = new Set<string>(Object.keys(TRACKR_LABELS));
		const extra: string[] = [];
		for (const t of (page.data as LayoutData).tickets ?? []) {
			for (const l of t.tags ?? []) {
				if (!seen.has(l)) {
					seen.add(l);
					extra.push(l);
				}
			}
		}
		return [...Object.keys(TRACKR_LABELS), ...extra];
	});

	// Assignee is an agent-facing dimension — dropped in portal (client) mode.
	const GROUP_OPTIONS = $derived<{ id: GroupBy; label: () => string }[]>([
		{ id: 'status', label: m.tickets_group_status },
		{ id: 'priority', label: m.tickets_group_priority },
		{ id: 'category', label: m.tickets_group_category },
		{ id: 'org', label: m.tickets_group_org },
		...(portal ? [] : [{ id: 'assignee' as const, label: m.tickets_group_assignee }]),
		{ id: 'none', label: m.tickets_group_none }
	]);
	const SUB_OPTIONS = $derived<{ id: SubBy; label: () => string }[]>([
		{ id: 'status', label: m.tickets_group_status },
		{ id: 'priority', label: m.tickets_group_priority },
		{ id: 'category', label: m.tickets_group_category },
		...(portal ? [] : [{ id: 'assignee' as const, label: m.tickets_group_assignee }]),
		{ id: 'none', label: m.tickets_group_none }
	]);

	const FIELDS = $derived<FilterField[]>([
		{ id: 'status', label: m.tickets_field_status(), icon: 'check' },
		{ id: 'priority', label: m.tickets_field_priority(), icon: 'filter' },
		{ id: 'category', label: m.tickets_field_category(), icon: 'bookmark' },
		{ id: 'tags', label: m.tasks_tags(), icon: 'star' },
		...(portal
			? []
			: [{ id: 'assignee', label: m.tickets_field_assignee(), icon: 'users' } as FilterField]),
		{ id: 'org', label: m.tickets_field_org(), icon: 'org' }
	]);

	const groupLabel = (id: GroupBy) => GROUP_OPTIONS.find((g) => g.id === id)?.label() ?? '';
	const subLabel = (id: SubBy) => SUB_OPTIONS.find((s) => s.id === id)?.label() ?? '';

	// Group / Sub menus use fixed positioning so they survive the horizontally
	// scrollable controls strip without being clipped by its overflow.
	let pop = $state<'group' | 'sub' | null>(null);
	let popAnchor: HTMLElement | null = null;
	let popPos = $state<{ left: number; top: number } | null>(null);

	function openPop(name: 'group' | 'sub', el: HTMLElement) {
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
		const W = 190;
		const maxLeft = Math.max(8, window.innerWidth - W - 8);
		popPos = { left: Math.min(r.left, maxLeft), top: r.bottom + 6 };
	}

	$effect(() => {
		if (!pop) return;
		const on = () => positionPop();
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

	function valueLabel(field: string, v: string): string {
		if (field === 'status')
			return TICKET_STATUSES.some((s) => s.id === v) ? ticketStatusLabel(v) : v;
		if (field === 'priority')
			return TICKET_PRIORITIES.some((p) => p.id === v) ? priorityLabel(v) : v;
		if (field === 'category')
			return TICKET_CATEGORIES.some((c) => c.id === v) ? ticketCategoryLabel(v) : v;
		if (field === 'assignee')
			return v === '__unassigned__'
				? m.common_unassigned()
				: (agents.find((u) => u.id === v)?.name ?? v);
		if (field === 'tags') return labelMeta(v).label;
		if (field === 'org') return orgs.find((o) => o.id === v)?.name ?? v;
		return v;
	}
</script>

{#snippet valuesList(field: string)}
	{@const values = filters[field] ?? []}
	{#if field === 'status'}
		{#each TICKET_STATUSES as s (s.id)}
			<button
				type="button"
				onclick={() => toggleValue('status', s.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={s.dot}></span>
				<span class="text-[14px]">{ticketStatusLabel(s.id)}</span>
				<span class="ml-auto text-accent {values.includes(s.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'priority'}
		{#each TICKET_PRIORITIES as p (p.id)}
			<button
				type="button"
				onclick={() => toggleValue('priority', p.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<PriorityBars priority={p.id} />
				<span class="text-[14px]">{priorityLabel(p.id)}</span>
				<span class="ml-auto text-accent {values.includes(p.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'category'}
		{#each TICKET_CATEGORIES as c (c.id)}
			<button
				type="button"
				onclick={() => toggleValue('category', c.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={c.color}></span>
				<span class="text-[14px]">{ticketCategoryLabel(c.id)}</span>
				<span class="ml-auto text-accent {values.includes(c.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'assignee'}
		{#each agents as u (u.id)}
			<button
				type="button"
				onclick={() => toggleValue('assignee', u.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<Avatar user={u} size={22} />
				<span class="truncate text-[14px]">{u.name}</span>
				<span class="ml-auto text-accent {values.includes(u.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
		{#if agents.length === 0}
			<div class="px-2 py-2 text-[12px] text-text-3">{m.tickets_no_agents()}</div>
		{/if}
	{:else if field === 'tags'}
		{#each allTags as id (id)}
			{@const l = labelMeta(id)}
			<button
				type="button"
				onclick={() => toggleValue('tags', id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={l.color}></span>
				<span class="truncate text-[14px]">{l.label}</span>
				<span class="ml-auto text-accent {values.includes(id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'org'}
		{#each orgs as o (o.id)}
			<button
				type="button"
				onclick={() => toggleValue('org', o.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={o.color}></span>
				<span class="truncate text-[14px]">{o.name}</span>
				<span class="ml-auto text-accent {values.includes(o.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
		{#if orgs.length === 0}
			<div class="px-2 py-2 text-[12px] text-text-3">{m.tickets_no_orgs()}</div>
		{/if}
	{/if}
{/snippet}

<div class="flex shrink-0 items-center gap-2 border-b border-border bg-bg px-5 py-2.5">
	<div class="tb-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
		{#if !minimal}
			<!-- View toggle -->
			<div
				class="inline-flex h-7 shrink-0 items-center rounded-lg border border-border bg-surface p-0.5 text-[14px]"
			>
				<button
					type="button"
					onclick={() => setView('list')}
					class="inline-flex h-full items-center gap-1.5 rounded-md px-2 transition-colors {view ===
					'list'
						? 'bg-bg-elev text-text'
						: 'text-text-3 hover:text-text'}"
				>
					<Icon name="list" size={14} />
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
					<Icon name="board" size={14} />
					{m.tasks_view_board()}
				</button>
			</div>

			<div class="h-5 w-px shrink-0 bg-border"></div>

			<!-- Group -->
			<div class="shrink-0">
				<button
					type="button"
					onclick={(e) => openPop('group', e.currentTarget)}
					class="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[14px] whitespace-nowrap transition-colors hover:bg-surface-2"
				>
					<span class="text-text-3">{m.tickets_group()}</span>
					<span class="font-medium text-text">{groupLabel(group)}</span>
					<Icon name="chevron" size={11} class="text-text-3" />
				</button>
				{#if pop === 'group' && popPos}
					<div
						use:clickOutside={() => (pop = null)}
						in:fly={POPOVER_IN}
						class="fixed z-50 min-w-[187px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
						style:left="{popPos.left}px"
						style:top="{popPos.top}px"
					>
						{#each GROUP_OPTIONS as o (o.id)}
							<button
								type="button"
								onclick={() => {
									setGroup(o.id);
									pop = null;
								}}
								class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] text-text-2 hover:bg-surface-2 hover:text-text"
							>
								<span>{o.label()}</span>
								<span class="ml-auto text-accent {group === o.id ? 'opacity-100' : 'opacity-0'}">
									<Icon name="check" size={13} />
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
						class="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[14px] whitespace-nowrap transition-colors hover:bg-surface-2"
					>
						<span class="text-text-3">{m.tasks_sub_group()}</span>
						<span class="font-medium text-text">{subLabel(sub)}</span>
						<Icon name="chevron" size={11} class="text-text-3" />
					</button>
					{#if pop === 'sub' && popPos}
						<div
							use:clickOutside={() => (pop = null)}
							in:fly={POPOVER_IN}
							class="fixed z-50 min-w-[187px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
							style:left="{popPos.left}px"
							style:top="{popPos.top}px"
						>
							{#each SUB_OPTIONS as o (o.id)}
								<button
									type="button"
									onclick={() => {
										setSub?.(o.id);
										pop = null;
									}}
									class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] text-text-2 hover:bg-surface-2 hover:text-text"
								>
									<span>{o.label()}</span>
									<span class="ml-auto text-accent {sub === o.id ? 'opacity-100' : 'opacity-0'}">
										<Icon name="check" size={13} />
									</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div class="h-5 w-px shrink-0 bg-border"></div>

			<div class="min-w-[92px] shrink-0">
				<FilterBar fields={FIELDS} {filters} {setFilters} {valueLabel} {valuesList} />
			</div>
		{/if}

		<div class="relative ml-auto w-44 min-w-[132px] shrink">
			<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3">
				<Icon name="search" size={14} />
			</span>
			<input
				type="text"
				placeholder={m.tickets_search_placeholder()}
				value={search}
				oninput={(e) => setSearch((e.target as HTMLInputElement).value)}
				class="h-7 w-full rounded-lg border border-border bg-surface pr-2.5 pl-7 text-[14px] text-text outline-none placeholder:text-text-3 focus:border-border-strong"
			/>
		</div>
	</div>

	{#if canCreate}
		<div class="shrink-0">
			<Button variant="primary" size="sm" onclick={() => onNew?.()}>
				<Icon name="plus" size={14} />
				{m.tickets_new_title()}
			</Button>
		</div>
	{/if}
</div>

<style>
	.tb-scroll {
		scrollbar-width: none;
	}
	.tb-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
