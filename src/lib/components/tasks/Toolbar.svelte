<script lang="ts">
	import Icon from '../Icon.svelte';
	import Chip from '../Chip.svelte';
	import Button from '../Button.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import {
		TRACKR_PRIORITIES,
		TRACKR_STATUSES,
		TRACKR_LABELS
	} from '$lib/data';
	import { page } from '$app/state';

	type LayoutData = {
		users?: { id: string; name: string; initials: string; color: string; status: string }[];
		projects?: { key: string; name: string; color: string }[];
	};

	type GroupBy = 'status' | 'priority' | 'assignee' | 'project' | 'none';
	type SubBy = 'none' | 'status' | 'priority' | 'assignee';

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
		onNewTask,
		canCreate = true
	}: Props = $props();

	const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
		{ id: 'status', label: 'Status' },
		{ id: 'priority', label: 'Priority' },
		{ id: 'assignee', label: 'Assignee' },
		{ id: 'project', label: 'Project' },
		{ id: 'none', label: 'None' }
	];
	const SUB_OPTIONS: { id: SubBy; label: string }[] = [
		{ id: 'status', label: 'Status' },
		{ id: 'priority', label: 'Priority' },
		{ id: 'assignee', label: 'Assignee' },
		{ id: 'none', label: 'None' }
	];

	const groupLabel = (id: GroupBy) => GROUP_OPTIONS.find((g) => g.id === id)?.label ?? '';
	const subLabel = (id: SubBy) => SUB_OPTIONS.find((s) => s.id === id)?.label ?? '';

	const FIELDS = [
		{ id: 'status', label: 'Status', icon: 'check' },
		{ id: 'priority', label: 'Priority', icon: 'filter' },
		{ id: 'assignee', label: 'Assignee', icon: 'users' },
		{ id: 'project', label: 'Project', icon: 'folder' },
		{ id: 'tags', label: 'Tags', icon: 'bookmark' }
	];

	// State machine:
	//   none           — closed
	//   add:fields     — initial "+ Filter" pop showing the list of fields
	//   add:<field>    — nested values pop for the field just picked (still inside the add flow)
	//   chip:<field>   — values pop opened by clicking an existing chip
	let pop = $state<string | null>(null);

	function toggleValue(field: string, value: string) {
		const cur = filters[field] ?? [];
		const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
		const merged = { ...filters, [field]: next };
		if (next.length === 0) delete merged[field];
		setFilters(merged);
	}

	function clearAll() {
		setFilters({});
	}

	let activeFilters = $derived(Object.entries(filters).filter(([, v]) => v.length > 0));
	const fieldLabel = (id: string) => FIELDS.find((f) => f.id === id)?.label ?? id;

	function valuesPopFor(field: string): string[] {
		return filters[field] ?? [];
	}

	// Resolve a raw filter value (status id, user id, project key, …) to the
	// human label shown in the chip. Falls back to the raw value if no match —
	// better to surface a stale id than to blank the chip out.
	function valueLabel(field: string, value: string): string {
		if (field === 'status') return TRACKR_STATUSES.find((s) => s.id === value)?.label ?? value;
		if (field === 'priority') return TRACKR_PRIORITIES.find((p) => p.id === value)?.label ?? value;
		if (field === 'assignee') {
			const u = ((page.data as LayoutData).users ?? []).find((x) => x.id === value);
			return u?.name ?? value;
		}
		if (field === 'project') {
			const p = ((page.data as LayoutData).projects ?? []).find((x) => x.key === value);
			return p?.name ?? value;
		}
		if (field === 'tags') return TRACKR_LABELS[value]?.label ?? value;
		return value;
	}
</script>

{#snippet valuesList(field: string)}
	{@const values = valuesPopFor(field)}
	{#if field === 'status'}
		{#each TRACKR_STATUSES as s (s.id)}
			<button
				type="button"
				onclick={() => toggleValue('status', s.id)}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
			>
				<StatusDot status={s.id} />
				<span class="text-[13px]">{s.label}</span>
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
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
			>
				<PriorityBars priority={p.id} />
				<span class="text-[13px]">{p.label}</span>
				<span class="ml-auto text-accent {values.includes(p.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{:else if field === 'assignee'}
		{@const dbUsers = ((page.data as LayoutData).users ?? []).filter((u) => u.status !== 'disabled')}
		{#each dbUsers as u (u.id)}
			<button
				type="button"
				onclick={() => toggleValue('assignee', u.id)}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
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
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
			>
				<span class="w-2 h-2 rounded-full" style:background={p.color}></span>
				<span class="text-[13px]">{p.name}</span>
				<span class="ml-auto text-accent {values.includes(p.key) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{:else if field === 'tags'}
		{#each Object.keys(TRACKR_LABELS) as id (id)}
			<button
				type="button"
				onclick={() => toggleValue('tags', id)}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
			>
				<span class="w-2 h-2 rounded-full" style:background={TRACKR_LABELS[id].color}></span>
				<span class="text-[13px]">{TRACKR_LABELS[id].label}</span>
				<span class="ml-auto text-accent {values.includes(id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{/if}
{/snippet}

<div class="flex items-center gap-2 px-5 py-2.5 border-b border-border bg-bg shrink-0">
	<div class="inline-flex items-center h-7 bg-surface border border-border rounded-lg p-0.5 text-[12.5px]">
		<button
			type="button"
			onclick={() => setView('list')}
			class="inline-flex items-center gap-1.5 px-2 h-full rounded-md transition-colors {view === 'list' ? 'bg-bg-elev text-text' : 'text-text-3 hover:text-text'}"
		>
			<Icon name="list" size={13} /> List
		</button>
		<button
			type="button"
			onclick={() => setView('board')}
			class="inline-flex items-center gap-1.5 px-2 h-full rounded-md transition-colors {view === 'board' ? 'bg-bg-elev text-text' : 'text-text-3 hover:text-text'}"
		>
			<Icon name="board" size={13} /> Board
		</button>
	</div>

	<div class="w-px h-5 bg-border"></div>

	<!-- Group -->
	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'group' ? null : 'group')}
			class="inline-flex items-center h-7 px-2.5 gap-1.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-[12.5px] transition-colors"
		>
			<span class="text-text-3">Group</span>
			<span class="text-text font-medium">{groupLabel(group)}</span>
			<Icon name="chevron" size={10} class="text-text-3" />
		</button>
		{#if pop === 'group'}
			<div
				use:clickOutside={() => (pop = null)}
				in:fly={POPOVER_IN}
				class="absolute top-full left-0 mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[170px]"
				style:box-shadow="var(--shadow-lg)"
			>
				{#each GROUP_OPTIONS as o (o.id)}
					<button
						type="button"
						onclick={() => { setGroup?.(o.id); pop = null; }}
						class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text text-[13px]"
					>
						<span>{o.label}</span>
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
		<div class="relative">
			<button
				type="button"
				onclick={() => (pop = pop === 'sub' ? null : 'sub')}
				class="inline-flex items-center h-7 px-2.5 gap-1.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-[12.5px] transition-colors"
			>
				<span class="text-text-3">Sub</span>
				<span class="text-text font-medium">{subLabel(sub)}</span>
				<Icon name="chevron" size={10} class="text-text-3" />
			</button>
			{#if pop === 'sub'}
				<div
					use:clickOutside={() => (pop = null)}
					class="absolute top-full left-0 mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[170px]"
					style:box-shadow="var(--shadow-lg)"
				>
					{#each SUB_OPTIONS as o (o.id)}
						<button
							type="button"
							onclick={() => { setSub?.(o.id); pop = null; }}
							class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text text-[13px]"
						>
							<span>{o.label}</span>
							<span class="ml-auto text-accent {sub === o.id ? 'opacity-100' : 'opacity-0'}">
								<Icon name="check" size={12} />
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<div class="w-px h-5 bg-border"></div>

	<div class="relative">
		<Chip variant="add" onclick={() => (pop = pop?.startsWith('add:') ? null : 'add:fields')}>
			<Icon name="plus" size={12} /> Filter
		</Chip>
		{#if pop === 'add:fields'}
			<div
				use:clickOutside={() => (pop = null)}
				in:fly={POPOVER_IN}
				class="absolute top-full left-0 mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[200px]"
				style:box-shadow="var(--shadow-lg)"
			>
				{#each FIELDS as f (f.id)}
					<button
						type="button"
						onclick={() => (pop = `add:${f.id}`)}
						class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left"
					>
						<span class="text-text-3"><Icon name={f.icon} size={13} /></span>
						<span class="text-[13px]">{f.label}</span>
						<span class="ml-auto text-text-4"><Icon name="chevron-r" size={11} /></span>
					</button>
				{/each}
			</div>
		{:else if pop?.startsWith('add:') && pop !== 'add:fields'}
			{@const field = pop.slice(4)}
			<div
				use:clickOutside={() => (pop = null)}
				in:fly={POPOVER_IN}
				class="absolute top-full left-0 mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[240px]"
				style:box-shadow="var(--shadow-lg)"
			>
				<button
					type="button"
					onclick={() => (pop = 'add:fields')}
					class="w-full flex items-center gap-1.5 px-2 py-1 mb-1 rounded-md hover:bg-surface-2 text-text-3 hover:text-text text-[11.5px] uppercase tracking-[0.06em] text-left border-b border-border pb-2"
				>
					<Icon name="chevron-r" size={10} class="rotate-180" />
					{fieldLabel(field)}
				</button>
				{@render valuesList(field)}
			</div>
		{/if}
	</div>

	{#each activeFilters as [field, values] (field)}
		<div class="relative">
			<Chip
				variant="filter"
				onclick={() => (pop = pop === `chip:${field}` ? null : `chip:${field}`)}
				onremove={() => {
					const next = { ...filters };
					delete next[field];
					setFilters(next);
				}}
			>
				<span class="text-text-3">{fieldLabel(field)}:</span>
				<span class="text-text font-medium">
					{#if values.length === 1}
						{valueLabel(field, values[0])}
					{:else}
						{values.length} selected
					{/if}
				</span>
			</Chip>
			{#if pop === `chip:${field}`}
				<div
					use:clickOutside={() => (pop = null)}
					in:fly={POPOVER_IN}
					class="absolute top-full left-0 mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[220px]"
					style:box-shadow="var(--shadow-lg)"
				>
					{@render valuesList(field)}
				</div>
			{/if}
		</div>
	{/each}

	{#if activeFilters.length >= 2}
		<button onclick={clearAll} class="text-[12px] text-text-3 hover:text-text px-2">Clear</button>
	{/if}

	<div class="ml-auto flex items-center gap-2">
		<div class="relative">
			<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none">
				<Icon name="search" size={13} />
			</span>
			<input
				type="text"
				placeholder="Search…"
				value={search}
				oninput={(e) => setSearch((e.target as HTMLInputElement).value)}
				class="h-7 pl-7 pr-2.5 rounded-lg bg-surface border border-border text-[12.5px] text-text placeholder:text-text-3 outline-none focus:border-border-strong w-44"
			/>
		</div>
		{#if canCreate}
			<Button variant="primary" size="sm" onclick={onNewTask}>
				<Icon name="plus" size={13} /> New task
			</Button>
		{/if}
	</div>
</div>
