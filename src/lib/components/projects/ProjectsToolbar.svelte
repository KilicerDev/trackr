<script lang="ts">
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import Avatar from '../Avatar.svelte';
	import FilterBar from '../FilterBar.svelte';
	import type { FilterField } from '../FilterBar.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import { PROJECT_STATUS } from '$lib/data';
	import { page } from '$app/state';

	type LayoutUser = { id: string; name: string; initials: string; color: string; status: string };

	export type ProjectView = 'grid' | 'list' | 'board';
	export type ProjectGroup = 'status' | 'org' | 'none';
	export type OrgOption = { id: string; name: string; slug: string; color: string };

	interface Props {
		view: ProjectView;
		setView: (v: ProjectView) => void;
		group: ProjectGroup;
		setGroup: (g: ProjectGroup) => void;
		filters: Record<string, string[]>;
		setFilters: (f: Record<string, string[]>) => void;
		search: string;
		setSearch: (s: string) => void;
		orgs: OrgOption[];
		canCreate: boolean;
		onNew: () => void;
	}
	let {
		view,
		setView,
		group,
		setGroup,
		filters,
		setFilters,
		search,
		setSearch,
		orgs,
		canCreate,
		onNew
	}: Props = $props();

	// Sentinel value for projects with no organization (internal work).
	const INTERNAL = '__internal__';

	const GROUP_OPTIONS: { id: ProjectGroup; label: string }[] = [
		{ id: 'status', label: 'Status' },
		{ id: 'org', label: 'Organization' },
		{ id: 'none', label: 'None' }
	];
	const groupLabel = (id: ProjectGroup) => GROUP_OPTIONS.find((g) => g.id === id)?.label ?? '';

	const FIELDS: FilterField[] = [
		{ id: 'status', label: 'Status', icon: 'check' },
		{ id: 'org', label: 'Organization', icon: 'org' },
		{ id: 'assignee', label: 'Assignee', icon: 'users' }
	];

	const users = $derived((page.data as { users?: LayoutUser[] }).users ?? []);

	const VIEWS: { id: ProjectView; label: string; icon: string }[] = [
		{ id: 'grid', label: 'Grid', icon: 'grid' },
		{ id: 'list', label: 'List', icon: 'list' },
		{ id: 'board', label: 'Board', icon: 'board' }
	];

	let pop = $state<'group' | null>(null);

	function toggleValue(field: string, value: string) {
		const cur = filters[field] ?? [];
		const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
		const merged = { ...filters, [field]: next };
		if (next.length === 0) delete merged[field];
		setFilters(merged);
	}

	function valueLabel(field: string, value: string): string {
		if (field === 'status')
			return PROJECT_STATUS[value as keyof typeof PROJECT_STATUS]?.label ?? value;
		if (field === 'org') {
			if (value === INTERNAL) return 'Internal';
			return orgs.find((o) => o.id === value)?.name ?? value;
		}
		if (field === 'assignee') return users.find((u) => u.id === value)?.name ?? value;
		return value;
	}
</script>

{#snippet valuesList(field: string)}
	{@const values = filters[field] ?? []}
	{#if field === 'status'}
		{#each Object.entries(PROJECT_STATUS) as [id, meta] (id)}
			<button
				type="button"
				onclick={() => toggleValue('status', id)}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
			>
				<span class="w-2 h-2 rounded-full" style:background={meta.color}></span>
				<span class="text-[13px]">{meta.label}</span>
				<span class="ml-auto text-accent {values.includes(id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{:else if field === 'org'}
		<button
			type="button"
			onclick={() => toggleValue('org', INTERNAL)}
			class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
		>
			<span class="text-text-3"><Icon name="org" size={13} /></span>
			<span class="text-[13px]">Internal</span>
			<span class="ml-auto text-accent {values.includes(INTERNAL) ? 'opacity-100' : 'opacity-0'}">
				<Icon name="check" size={13} />
			</span>
		</button>
		{#each orgs as o (o.id)}
			<button
				type="button"
				onclick={() => toggleValue('org', o.id)}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
			>
				<span class="w-2 h-2 rounded-full" style:background={o.color}></span>
				<span class="text-[13px] truncate">{o.name}</span>
				<span class="ml-auto text-accent {values.includes(o.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{:else if field === 'assignee'}
		{#each users.filter((u) => u.status !== 'disabled') as u (u.id)}
			<button
				type="button"
				onclick={() => toggleValue('assignee', u.id)}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
			>
				<Avatar user={u} size={20} />
				<span class="text-[13px] truncate">{u.name}</span>
				<span class="ml-auto text-accent {values.includes(u.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{/if}
{/snippet}

<div class="flex items-center gap-2 px-5 py-2.5 border-b border-border bg-bg shrink-0">
	<!-- View toggle -->
	<div class="inline-flex items-center h-7 bg-surface border border-border rounded-lg p-0.5 text-[12.5px]">
		{#each VIEWS as v (v.id)}
			<button
				type="button"
				onclick={() => setView(v.id)}
				class="inline-flex items-center gap-1.5 px-2 h-full rounded-md transition-colors {view === v.id ? 'bg-bg-elev text-text' : 'text-text-3 hover:text-text'}"
			>
				<Icon name={v.icon} size={13} /> {v.label}
			</button>
		{/each}
	</div>

	<!-- Group (all views) -->
	<div class="w-px h-5 bg-border"></div>
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
						onclick={() => {
							setGroup(o.id);
							pop = null;
						}}
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

	<div class="w-px h-5 bg-border"></div>

	<FilterBar fields={FIELDS} {filters} {setFilters} {valueLabel} {valuesList} />

	<div class="ml-auto flex items-center gap-2 shrink-0">
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
			<Button variant="primary" size="sm" onclick={onNew}>
				<Icon name="plus" size={13} /> New project
			</Button>
		{/if}
	</div>
</div>
