<script lang="ts">
	import type { Task, ProjectId } from '$lib/types';
	import { TRACKR_PRIORITIES, TRACKR_STATUSES } from '$lib/config/taxonomy';
	import { statusLabel, priorityLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';
	import { resolveProject, resolveUser } from '$lib/stores/lookup.svelte';
	import { page } from '$app/state';
	import TaskRow from './TaskRow.svelte';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import { readCollapsed, saveCollapsed } from '$lib/stores/view';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	type GroupBy = 'status' | 'priority' | 'assignee' | 'project' | 'none';

	interface Props {
		tasks: Task[];
		group?: GroupBy;
		onSelect?: (t: Task) => void;
		selectedId?: string;
		onAddInProject?: (pid: ProjectId) => void;
		// View-state key (e.g. 'tasks') to remember collapsed groups under.
		// Omitted → collapse state is session-only, as before.
		persistKey?: string;
	}
	let { tasks, group = 'status', onSelect, selectedId, onAddInProject, persistKey }: Props =
		$props();

	const loadCollapsed = () =>
		persistKey ? readCollapsed(persistKey, 'listCollapsed', group) : new Set<string>();
	let collapsed = $state(loadCollapsed());
	// Re-hydrate when the grouping changes — each grouping mode has its own
	// id namespace and its own remembered set. (The mount run just re-reads
	// the same initial value.)
	$effect(() => {
		collapsed = loadCollapsed();
	});

	function toggle(id: string) {
		const next = new Set(collapsed);
		next.has(id) ? next.delete(id) : next.add(id);
		collapsed = next;
		if (persistKey) saveCollapsed(persistKey, 'listCollapsed', group, next);
	}

	// Map a project key (the group id when grouping by project) to its detail
	// page. resolveProject doesn't expose the DB id, so read it off page.data.
	function projectHref(key: string): string | undefined {
		const p = (page.data as { projects?: { id: string; key: string }[] }).projects?.find(
			(x) => x.key === key
		);
		return p ? `/projects/${p.id}` : undefined;
	}

	let groups = $derived.by(() => {
		if (group === 'none') {
			return [{ id: 'all', label: '', dot: 'transparent', tasks }];
		}
		if (group === 'status') {
			return TRACKR_STATUSES.map((s) => ({
				id: s.id,
				label: statusLabel(s.id),
				dot: s.dot,
				tasks: tasks.filter((t) => t.status === s.id)
			})).filter((g) => g.tasks.length > 0);
		}
		if (group === 'priority') {
			return [...TRACKR_PRIORITIES]
				.reverse()
				.map((p) => ({
					id: p.id,
					label: priorityLabel(p.id),
					dot: p.color,
					tasks: tasks.filter((t) => t.priority === p.id)
				}))
				.filter((g) => g.tasks.length > 0);
		}
		if (group === 'project') {
			// Stable alphabetical group order so the section headers don't
			// reshuffle every time a task's updatedAt changes.
			const keys = Array.from(new Set(tasks.map((t) => t.project)));
			return keys
				.map((key) => {
					const p = resolveProject(key);
					return {
						id: key,
						label: p?.name ?? key,
						dot: p?.color ?? '#7c7c84',
						tasks: tasks.filter((t) => t.project === key)
					};
				})
				.filter((g) => g.tasks.length > 0)
				.sort((a, b) => a.label.localeCompare(b.label));
		}
		// assignee
		const ids = Array.from(new Set(tasks.flatMap((t) => t.assignees ?? [t.assignee])));
		return ids
			.map((uid) => {
				const u = resolveUser(uid);
				return {
					id: uid,
					label: u?.name ?? uid,
					dot: u?.color ?? '#666',
					tasks: tasks.filter((t) => (t.assignees ?? [t.assignee]).includes(uid))
				};
			})
			.filter((g) => g.tasks.length > 0)
			.sort((a, b) => a.label.localeCompare(b.label));
	});

	// Touch `page.data` so the lookup helpers stay reactive when the layout
	// data refreshes. Without this, switching projects mid-session can leave
	// stale labels in already-derived group headers.
	$effect(() => {
		void page.data;
	});
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-auto">
	{#each groups as g (g.id)}
		{@const isCollapsed = collapsed.has(g.id)}
		{@const done = g.tasks.filter((t) => t.status === 'done' || t.status === 'in_review').length}
		{@const pct = g.tasks.length === 0 ? 0 : Math.round((done / g.tasks.length) * 100)}
		<div>
			{#if g.label}
				{@const href = group === 'project' ? projectHref(g.id) : undefined}
				<div
					class="sticky top-0 z-[5] flex h-10 w-full items-center gap-2.5 border-y border-border bg-surface pr-3 pl-5"
				>
					<button
						type="button"
						onclick={() => toggle(g.id)}
						aria-label={g.label}
						class="group flex h-full shrink-0 items-center gap-2.5"
					>
						<span class="text-text-3 transition-transform {isCollapsed ? '-rotate-90' : ''}">
							<Icon name="chevron" size={13} />
						</span>
						<span class="h-2 w-2 rounded-full" style:background={g.dot}></span>
					</button>
					{#if href}
						<a
							{href}
							class="truncate text-[14px] font-semibold text-text hover:underline"
							title={m.tasks_open_project({ name: g.label })}
						>
							{g.label}
						</a>
					{:else}
						<span class="truncate text-[14px] font-semibold text-text">{g.label}</span>
					{/if}
					<button
						type="button"
						onclick={() => toggle(g.id)}
						aria-label={g.label}
						class="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left"
					>
						<span class="font-mono text-[12px] text-text-3">{g.tasks.length}</span>
						<div class="h-1 w-24 overflow-hidden rounded-full bg-surface">
							<div class="h-full" style:width="{pct}%" style:background={g.dot}></div>
						</div>
						<span class="font-mono text-[11px] text-text-4">{pct}%</span>
					</button>
					{#if group === 'project'}
						<IconButton
							size={26}
							ariaLabel={m.tasks_add_task()}
							onclick={() => onAddInProject?.(g.id as ProjectId)}
						>
							<Icon name="plus" size={14} />
						</IconButton>
					{/if}
				</div>
			{/if}
			{#if !isCollapsed}
				<div transition:slide={{ duration: 180, easing: cubicOut }}>
					{#each g.tasks as t (t.id)}
						<TaskRow task={t} selected={selectedId === t.id} onclick={() => onSelect?.(t)} />
					{/each}
					{#if group === 'project'}
						<button
							type="button"
							onclick={() => onAddInProject?.(g.id as ProjectId)}
							class="flex h-9 w-full items-center gap-1.5 border-b border-border px-5 text-left text-[13px] text-text-3 transition-colors hover:bg-surface hover:text-text"
						>
							<Icon name="plus" size={13} />
							{m.tasks_new_task()}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/each}
</div>
