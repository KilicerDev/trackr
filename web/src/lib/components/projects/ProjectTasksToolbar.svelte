<script lang="ts">
	import Icon from '../Icon.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import FilterBar from '../FilterBar.svelte';
	import type { FilterField } from '../FilterBar.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { TRACKR_PRIORITIES, TRACKR_STATUSES } from '$lib/config/taxonomy';
	import { labelMeta } from '$lib/utils/label-meta';
	import { page } from '$app/state';
	import { statusLabel, priorityLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';
	import type { Task } from '$lib/types';

	type GroupBy = 'status' | 'priority' | 'assignee' | 'none';

	type LayoutData = {
		users?: {
			id: string;
			name: string;
			initials: string;
			color: string;
			status: string;
			internal?: boolean;
		}[];
	};

	// Lean sibling of the /tasks Toolbar for the project detail page: filter
	// chips (no project field — the page IS the project), group-by, and search.
	interface Props {
		tasks: Task[]; // unfiltered project tasks — drives the tag vocabulary
		filters: Record<string, string[]>;
		setFilters: (f: Record<string, string[]>) => void;
		search: string;
		setSearch: (s: string) => void;
		group: GroupBy;
		setGroup: (g: GroupBy) => void;
	}
	let { tasks, filters, setFilters, search, setSearch, group, setGroup }: Props = $props();

	// Every tag actually in use across this project's tasks. Deduped.
	const allTags = $derived.by(() => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const t of tasks) {
			for (const l of t.labels ?? []) {
				if (!seen.has(l)) {
					seen.add(l);
					out.push(l);
				}
			}
		}
		return out;
	});

	const GROUP_OPTIONS: { id: GroupBy; label: () => string }[] = [
		{ id: 'status', label: m.tasks_group_status },
		{ id: 'priority', label: m.tasks_group_priority },
		{ id: 'assignee', label: m.tasks_group_assignee },
		{ id: 'none', label: m.common_none }
	];
	const groupLabel = (id: GroupBy) => GROUP_OPTIONS.find((g) => g.id === id)?.label() ?? '';

	const FIELDS: FilterField[] = [
		{ id: 'status', label: m.tasks_group_status(), icon: 'check' },
		{ id: 'priority', label: m.tasks_group_priority(), icon: 'filter' },
		{ id: 'assignee', label: m.tasks_group_assignee(), icon: 'users' },
		{ id: 'tags', label: m.tasks_tags(), icon: 'bookmark' }
	];

	// The Group menu is anchored with `position: fixed` so it can sit inside the
	// horizontally-scrollable strip without getting clipped by its overflow.
	let pop = $state<'group' | null>(null);
	let popAnchor: HTMLElement | null = null;
	let popPos = $state<{ left: number; top: number } | null>(null);

	function openPop(name: 'group', el: HTMLElement) {
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

	// Resolve a raw filter value to the chip label; falls back to the raw value.
	function valueLabel(field: string, value: string): string {
		if (field === 'status')
			return TRACKR_STATUSES.find((s) => s.id === value) ? statusLabel(value) : value;
		if (field === 'priority')
			return TRACKR_PRIORITIES.find((p) => p.id === value) ? priorityLabel(value) : value;
		if (field === 'assignee') {
			const u = ((page.data as LayoutData).users ?? []).find((x) => x.id === value);
			return u?.name ?? value;
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
				<span class="text-[14px]">{statusLabel(s.id)}</span>
				<span class="ml-auto text-accent {values.includes(s.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
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
				<span class="text-[14px]">{priorityLabel(p.id)}</span>
				<span class="ml-auto text-accent {values.includes(p.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'assignee'}
		{@const dbUsers = ((page.data as LayoutData).users ?? []).filter(
			(u) => u.internal && u.status !== 'disabled'
		)}
		{#each dbUsers as u (u.id)}
			<button
				type="button"
				onclick={() => toggleValue('assignee', u.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<Avatar user={u} size={22} />
				<span class="text-[14px]">{u.name}</span>
				<span class="ml-auto text-accent {values.includes(u.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
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
				<span class="truncate text-[14px]">{l.label}</span>
				<span class="ml-auto text-accent {values.includes(id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{/if}
{/snippet}

<div class="tb-scroll flex min-w-0 items-center gap-2 overflow-x-auto">
	<!-- Group -->
	<div class="shrink-0">
		<button
			type="button"
			onclick={(e) => openPop('group', e.currentTarget)}
			class="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[14px] whitespace-nowrap transition-colors hover:bg-surface-2"
		>
			<span class="text-text-3">{m.tasks_group_by()}</span>
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

	<div class="h-5 w-px shrink-0 bg-border"></div>

	<div class="min-w-[92px] shrink-0">
		<FilterBar fields={FIELDS} {filters} {setFilters} {valueLabel} {valuesList} />
	</div>

	<div class="relative ml-auto w-44 min-w-[132px] shrink">
		<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3">
			<Icon name="search" size={14} />
		</span>
		<input
			type="text"
			placeholder={m.common_search()}
			value={search}
			oninput={(e) => setSearch((e.target as HTMLInputElement).value)}
			class="h-7 w-full rounded-lg border border-border bg-surface pr-2.5 pl-7 text-[14px] text-text outline-none placeholder:text-text-3 focus:border-border-strong"
		/>
	</div>
</div>

<style>
	/* Hide the strip scrollbar; it only scrolls on very narrow widths. */
	.tb-scroll {
		scrollbar-width: none;
	}
	.tb-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
