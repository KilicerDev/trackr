<script lang="ts">
	import type { Task } from '$lib/types';
	import { TRACKR_PRIORITIES, TRACKR_STATUSES } from '$lib/data';
	import { resolveProject, resolveUser } from '$lib/lookup.svelte';
	import { page } from '$app/state';
	import TaskRow from './TaskRow.svelte';
	import Icon from '../Icon.svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	type GroupBy = 'status' | 'priority' | 'assignee' | 'project' | 'none';

	interface Props {
		tasks: Task[];
		group?: GroupBy;
		onSelect?: (t: Task) => void;
		selectedId?: string;
	}
	let { tasks, group = 'status', onSelect, selectedId }: Props = $props();

	let collapsed = $state(new Set<string>());

	function toggle(id: string) {
		const next = new Set(collapsed);
		next.has(id) ? next.delete(id) : next.add(id);
		collapsed = next;
	}

	let groups = $derived.by(() => {
		if (group === 'none') {
			return [{ id: 'all', label: '', dot: 'transparent', tasks }];
		}
		if (group === 'status') {
			return TRACKR_STATUSES.map((s) => ({
				id: s.id,
				label: s.label,
				dot: s.dot,
				tasks: tasks.filter((t) => t.status === s.id)
			})).filter((g) => g.tasks.length > 0);
		}
		if (group === 'priority') {
			return [...TRACKR_PRIORITIES]
				.reverse()
				.map((p) => ({
					id: p.id,
					label: p.label,
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

<div class="flex flex-col min-h-0 flex-1 overflow-auto">
	{#each groups as g (g.id)}
		{@const isCollapsed = collapsed.has(g.id)}
		{@const done = g.tasks.filter((t) => t.status === 'done' || t.status === 'in_review').length}
		{@const pct = g.tasks.length === 0 ? 0 : Math.round((done / g.tasks.length) * 100)}
		<div>
			{#if g.label}
				<button
					type="button"
					onclick={() => toggle(g.id)}
					class="group sticky top-0 z-[5] flex items-center gap-2.5 w-full px-5 h-10 bg-surface border-y border-border text-left"
				>
					<span class="transition-transform text-text-3 {isCollapsed ? '-rotate-90' : ''}">
						<Icon name="chevron" size={12} />
					</span>
					<span class="w-2 h-2 rounded-full" style:background={g.dot}></span>
					<span class="text-[13px] font-semibold text-text">{g.label}</span>
					<span class="font-mono text-[11px] text-text-3">{g.tasks.length}</span>
					<div class="ml-2 w-24 h-1 rounded-full bg-surface overflow-hidden">
						<div class="h-full" style:width="{pct}%" style:background={g.dot}></div>
					</div>
					<span class="font-mono text-[10px] text-text-4">{pct}%</span>
				</button>
			{/if}
			{#if !isCollapsed}
				<div transition:slide={{ duration: 180, easing: cubicOut }}>
					{#each g.tasks as t (t.id)}
						<TaskRow task={t} selected={selectedId === t.id} onclick={() => onSelect?.(t)} />
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>
