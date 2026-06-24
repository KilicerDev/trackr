<script lang="ts">
	import { tick } from 'svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import Icon from '../Icon.svelte';
	import { TRACKR_PROJECTS } from '$lib/data';
	import type { ProjectId } from '$lib/types';
	import { m } from '$lib/paraglide/messages';

	type PickableProject = { id: string; key: string; name: string; color: string; status: string };

	interface Props {
		value: ProjectId | '';
		onchange: (v: ProjectId) => void;
		onclose: () => void;
		projects?: PickableProject[];
		// Project ids the current user is a member of. Used to scope the default
		// list for all-access users (see allAccess).
		memberProjectIds?: string[];
		// True for Trackr-team users who can see every project. Only they get the
		// "my projects" default + "show all" toggle; everyone else already sees
		// only their memberships, so the toggle would be redundant.
		allAccess?: boolean;
	}
	let {
		value,
		onchange,
		onclose,
		projects: providedProjects,
		memberProjectIds = [],
		allAccess = false
	}: Props = $props();

	const fallback: PickableProject[] = (Object.keys(TRACKR_PROJECTS) as ProjectId[]).map((id) => ({
		id,
		key: id,
		name: TRACKR_PROJECTS[id].name,
		color: TRACKR_PROJECTS[id].color,
		status: 'active'
	}));
	const projects = $derived(providedProjects ?? fallback);

	// Statuses that represent projects no longer in active use. Hidden from the
	// default list (still reachable via "show all", the inactive expander, or
	// search) so finished/cancelled work doesn't clutter day-to-day picking.
	const DORMANT = new Set(['paused', 'completed', 'cancelled']);
	const isDormant = (s: string) => DORMANT.has(s);

	const memberSet = $derived(new Set(memberProjectIds));
	const selected = $derived(projects.find((p) => p.key === value));

	let q = $state('');
	let showAll = $state(false);
	let showInactive = $state(false);

	// All-access users default to their memberships. Force the full list when
	// they've toggled it, when they belong to no projects, or when the currently
	// selected project isn't one of theirs (so the selection stays visible).
	const expandedAll = $derived(
		!allAccess || showAll || memberSet.size === 0 || (!!selected && !memberSet.has(selected.id))
	);
	const expandedInactive = $derived(showInactive || (!!selected && isDormant(selected.status)));

	const searching = $derived(q.trim().length > 0);

	// When searching we ignore grouping and match across every accessible
	// project (members + others + dormant) so nothing is unreachable.
	const searchResults = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		return projects.filter((p) => p.name.toLowerCase().includes(needle));
	});

	const base = $derived(expandedAll ? projects : projects.filter((p) => memberSet.has(p.id)));
	const live = $derived(base.filter((p) => !isDormant(p.status)));
	const dormant = $derived(base.filter((p) => isDormant(p.status)));

	// Flat list of rows in render order, so keyboard navigation matches what's
	// on screen regardless of search/grouping state.
	const visible = $derived(
		searching ? searchResults : expandedInactive ? [...live, ...dormant] : live
	);

	let inputEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);
	// Start on the current selection so Enter without arrowing is a no-op pick.
	let activeIndex = $state(0);

	$effect(() => {
		activeIndex = Math.max(
			0,
			visible.findIndex((p) => p.key === value)
		);
		inputEl?.focus();
	});

	function pick(key: string) {
		onchange(key as ProjectId);
		onclose();
	}

	async function move(delta: number) {
		if (visible.length === 0) return;
		activeIndex = (activeIndex + delta + visible.length) % visible.length;
		await tick();
		listEl?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			move(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			move(-1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const p = visible[activeIndex];
			if (p) pick(p.key);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onclose();
		}
	}
</script>

{#snippet row(p: PickableProject, i: number)}
	<button
		type="button"
		data-active={i === activeIndex}
		onclick={() => pick(p.key)}
		onmouseenter={() => (activeIndex = i)}
		class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:text-text {isDormant(
			p.status
		)
			? 'opacity-60'
			: ''} {i === activeIndex ? 'bg-surface-2 text-text' : ''}"
	>
		<span class="h-2 w-2 shrink-0 rounded-full" style:background={p.color}></span>
		<span class="text-[13px]">{p.name}</span>
		<span class="ml-auto text-accent {value === p.key ? 'opacity-100' : 'opacity-0'}">
			<Icon name="check" size={13} />
		</span>
	</button>
{/snippet}

<div
	use:clickOutside={onclose}
	use:autoPlace
	in:fly={POPOVER_IN}
	class="absolute top-full z-50 mt-1.5 min-w-[240px] rounded-[10px] border border-border bg-bg-elev p-1.5"
	style:box-shadow="var(--shadow-lg)"
>
	<div class="mb-1.5 flex items-center gap-2 border-b border-border px-2 pt-1 pb-2">
		<span class="text-text-3"><Icon name="search" size={13} /></span>
		<input
			type="text"
			bind:this={inputEl}
			bind:value={q}
			{onkeydown}
			placeholder={m.tasks_search_projects_placeholder()}
			class="flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-text-3"
		/>
	</div>

	<div bind:this={listEl} class="max-h-[300px] overflow-y-auto">
		{#if searching}
			{#each searchResults as p, i (p.key)}
				{@render row(p, i)}
			{/each}
			{#if searchResults.length === 0}
				<div class="px-2 py-3 text-center text-[12.5px] text-text-3">
					{m.tasks_no_projects_match({ q })}
				</div>
			{/if}
		{:else}
			{#each live as p, i (p.key)}
				{@render row(p, i)}
			{/each}

			{#if dormant.length > 0}
				{#if expandedInactive}
					<div class="my-1 border-t border-border"></div>
					{#each dormant as p, i (p.key)}
						{@render row(p, live.length + i)}
					{/each}
				{:else}
					<button
						type="button"
						onclick={() => (showInactive = true)}
						class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-text-3 hover:bg-surface-2 hover:text-text-2"
					>
						<Icon name="chevron" size={11} />
						{m.tasks_show_n_inactive({ n: dormant.length })}
					</button>
				{/if}
			{/if}

			{#if allAccess && memberSet.size > 0 && (!selected || memberSet.has(selected.id))}
				<div class="mt-1 border-t border-border pt-1">
					<button
						type="button"
						onclick={() => (showAll = !showAll)}
						class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-text-3 hover:bg-surface-2 hover:text-text-2"
					>
						<Icon name="chevron" size={11} />
						{expandedAll ? m.tasks_show_only_my_projects() : m.tasks_show_all_projects()}
					</button>
				</div>
			{/if}
		{/if}
	</div>
</div>
