<script lang="ts">
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import Avatar from '../Avatar.svelte';
	import FilterBar from '../FilterBar.svelte';
	import type { FilterField } from '../FilterBar.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { PROJECT_STATUS } from '$lib/config/taxonomy';
	import { projectStatusLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';
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

	const GROUP_OPTIONS: { id: ProjectGroup; label: string }[] = $derived([
		{ id: 'status', label: m.projects_group_status() },
		{ id: 'org', label: m.projects_group_org() },
		{ id: 'none', label: m.projects_group_none() }
	]);
	const groupLabel = (id: ProjectGroup) => GROUP_OPTIONS.find((g) => g.id === id)?.label ?? '';

	const FIELDS: FilterField[] = $derived([
		{ id: 'status', label: m.projects_filter_status(), icon: 'check' },
		{ id: 'org', label: m.projects_filter_org(), icon: 'org' },
		{ id: 'assignee', label: m.projects_filter_assignee(), icon: 'users' }
	]);

	const users = $derived((page.data as { users?: LayoutUser[] }).users ?? []);

	const VIEWS: { id: ProjectView; label: string; icon: string }[] = $derived([
		{ id: 'grid', label: m.projects_view_grid(), icon: 'grid' },
		{ id: 'list', label: m.projects_view_list(), icon: 'list' },
		{ id: 'board', label: m.projects_view_board(), icon: 'board' }
	]);

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
			return PROJECT_STATUS[value as keyof typeof PROJECT_STATUS]
				? projectStatusLabel(value)
				: value;
		if (field === 'org') {
			if (value === INTERNAL) return m.projects_internal();
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
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={meta.color}></span>
				<span class="text-[13px]">{projectStatusLabel(id)}</span>
				<span class="ml-auto text-accent {values.includes(id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{:else if field === 'org'}
		<button
			type="button"
			onclick={() => toggleValue('org', INTERNAL)}
			class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
		>
			<span class="text-text-3"><Icon name="org" size={13} /></span>
			<span class="text-[13px]">{m.projects_internal()}</span>
			<span class="ml-auto text-accent {values.includes(INTERNAL) ? 'opacity-100' : 'opacity-0'}">
				<Icon name="check" size={13} />
			</span>
		</button>
		{#each orgs as o (o.id)}
			<button
				type="button"
				onclick={() => toggleValue('org', o.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={o.color}></span>
				<span class="truncate text-[13px]">{o.name}</span>
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
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<Avatar user={u} size={20} />
				<span class="truncate text-[13px]">{u.name}</span>
				<span class="ml-auto text-accent {values.includes(u.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	{/if}
{/snippet}

<div class="flex shrink-0 items-center gap-2 border-b border-border bg-bg px-5 py-2.5">
	<!-- View toggle -->
	<div
		class="inline-flex h-7 items-center rounded-lg border border-border bg-surface p-0.5 text-[12.5px]"
	>
		{#each VIEWS as v (v.id)}
			<button
				type="button"
				onclick={() => setView(v.id)}
				class="inline-flex h-full items-center gap-1.5 rounded-md px-2 transition-colors {view ===
				v.id
					? 'bg-bg-elev text-text'
					: 'text-text-3 hover:text-text'}"
			>
				<Icon name={v.icon} size={13} />
				{v.label}
			</button>
		{/each}
	</div>

	<!-- Group (all views) -->
	<div class="h-5 w-px bg-border"></div>
	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'group' ? null : 'group')}
			class="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] transition-colors hover:bg-surface-2"
		>
			<span class="text-text-3">{m.projects_group_label()}</span>
			<span class="font-medium text-text">{groupLabel(group)}</span>
			<Icon name="chevron" size={10} class="text-text-3" />
		</button>
		{#if pop === 'group'}
			<div
				use:clickOutside={() => (pop = null)}
				in:fly={POPOVER_IN}
				class="absolute top-full left-0 z-50 mt-1.5 min-w-[170px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
			>
				{#each GROUP_OPTIONS as o (o.id)}
					<button
						type="button"
						onclick={() => {
							setGroup(o.id);
							pop = null;
						}}
						class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
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

	<div class="h-5 w-px bg-border"></div>

	<FilterBar fields={FIELDS} {filters} {setFilters} {valueLabel} {valuesList} />

	<div class="ml-auto flex shrink-0 items-center gap-2">
		<div class="relative">
			<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3">
				<Icon name="search" size={13} />
			</span>
			<input
				type="text"
				placeholder={m.projects_search_placeholder()}
				value={search}
				oninput={(e) => setSearch((e.target as HTMLInputElement).value)}
				class="h-7 w-44 rounded-lg border border-border bg-surface pr-2.5 pl-7 text-[12.5px] text-text outline-none placeholder:text-text-3 focus:border-border-strong"
			/>
		</div>
		{#if canCreate}
			<Button variant="primary" size="sm" onclick={onNew}>
				<Icon name="plus" size={13} />
				{m.projects_new_project()}
			</Button>
		{/if}
	</div>
</div>
