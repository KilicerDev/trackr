<script lang="ts">
	import type { Task, ProjectId, StatusId, PriorityId } from '$lib/types';
	import { TRACKR_PRIORITIES, TRACKR_STATUSES } from '$lib/config/taxonomy';
	import { statusLabel, priorityLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';
	import { resolveProject, resolveUser } from '$lib/stores/lookup.svelte';
	import { page } from '$app/state';
	import BoardCard from './BoardCard.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import { readCollapsed, saveCollapsed } from '$lib/stores/view';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { sortTasks, DEFAULT_TASK_BOARD_SORT, type TaskSort } from '$lib/utils/sort';

	export type BoardGroup = 'project' | 'status' | 'priority' | 'assignee' | 'none';
	export type BoardSub = 'none' | 'status' | 'priority' | 'assignee';

	interface Props {
		tasks: Task[];
		group?: BoardGroup;
		sub?: BoardSub;
		// Card order inside each column / subgroup (see $lib/utils/sort).
		sort?: TaskSort;
		onSelect?: (t: Task) => void;
		onAddInProject?: (pid: ProjectId, statusId?: StatusId) => void;
		// View-state key (e.g. 'tasks') to remember collapsed columns under.
		// Omitted → collapse state is session-only, as before.
		persistKey?: string;
		// Server-persisted snapshot of collapsed ids per grouping, used as the
		// SSR/first-paint fallback when localStorage isn't available yet.
		initialCollapsed?: Record<string, string[]>;
	}
	let {
		tasks,
		group = 'project',
		sub = 'status',
		sort = DEFAULT_TASK_BOARD_SORT,
		onSelect,
		onAddInProject,
		persistKey,
		initialCollapsed
	}: Props = $props();

	interface ColumnDef {
		key: string;
		label: string;
		color: string;
		project?: ProjectId;
		statusId?: StatusId;
		priorityId?: PriorityId;
		userId?: string;
		tasks: Task[];
	}

	let columns = $derived.by<ColumnDef[]>(() => {
		if (group === 'project') {
			// Use the projects exposed by the layout load — falls back to
			// keys that only appear on tasks (defensive in case of drift).
			type ProjectMeta = { key: string; name: string; color: string };
			const dbProjects = (page.data as { projects?: ProjectMeta[] }).projects ?? [];
			const fromTasks = Array.from(new Set(tasks.map((t) => t.project)));
			const orderedKeys = [
				...dbProjects.map((p) => p.key),
				...fromTasks.filter((k) => !dbProjects.some((p) => p.key === k))
			];
			return orderedKeys
				.map((key) => {
					const p = resolveProject(key);
					return {
						key,
						label: p?.name ?? key,
						color: p?.color ?? '#7c7c84',
						project: key as ProjectId,
						tasks: tasks.filter((t) => t.project === key)
					};
				})
				.filter((c) => c.tasks.length > 0);
		}
		if (group === 'status') {
			return TRACKR_STATUSES.map((s) => ({
				key: s.id,
				label: statusLabel(s.id),
				color: s.dot,
				statusId: s.id as StatusId,
				tasks: tasks.filter((t) => t.status === s.id)
			}));
		}
		if (group === 'priority') {
			return [...TRACKR_PRIORITIES].reverse().map((p) => ({
				key: p.id,
				label: priorityLabel(p.id),
				color: p.color,
				priorityId: p.id as PriorityId,
				tasks: tasks.filter((t) => t.priority === p.id)
			}));
		}
		if (group === 'assignee') {
			const ids = Array.from(new Set(tasks.flatMap((t) => t.assignees ?? [t.assignee])));
			return ids
				.map((uid) => {
					const u = resolveUser(uid);
					return {
						key: uid,
						label: u?.name ?? uid,
						color: u?.color ?? '#666',
						userId: uid,
						tasks: tasks.filter((t) => (t.assignees ?? [t.assignee]).includes(uid))
					};
				})
				.sort((a, b) => a.label.localeCompare(b.label));
		}
		return [{ key: 'all', label: m.tasks_all_tasks(), color: 'transparent', tasks }];
	});

	const loadCollapsed = () =>
		persistKey
			? readCollapsed(persistKey, 'boardCollapsed', group, initialCollapsed)
			: new Set<string>();
	let collapsed = $state(loadCollapsed());
	// Re-hydrate when the grouping changes — each grouping mode has its own
	// key namespace and its own remembered set. (The mount run just re-reads
	// the same initial value.)
	$effect(() => {
		collapsed = loadCollapsed();
	});
	function toggle(key: string) {
		const n = new Set(collapsed);
		n.has(key) ? n.delete(key) : n.add(key);
		collapsed = n;
		if (persistKey) saveCollapsed(persistKey, 'boardCollapsed', group, n);
	}

	// Map a project key to its detail page. resolveProject doesn't expose the DB
	// id, so read it off page.data (where the route id lives).
	function projectHref(key: string | undefined): string | undefined {
		if (!key) return undefined;
		const p = (page.data as { projects?: { id: string; key: string }[] }).projects?.find(
			(x) => x.key === key
		);
		return p ? `/projects/${p.id}` : undefined;
	}

	interface SubGroupDef {
		key: string;
		label: string;
		color?: string;
		statusId?: StatusId;
		priorityId?: PriorityId;
		userId?: string;
		tasks: Task[];
	}

	function subGroupsForColumn(col: ColumnDef): SubGroupDef[] {
		const items = col.tasks;
		if (sub === 'none' || sub === group) {
			return [
				{
					key: `${col.key}:all`,
					label: '',
					tasks: sortTasks(items, sort)
				}
			];
		}
		if (sub === 'status') {
			return TRACKR_STATUSES.map((s) => ({
				key: `${col.key}:${s.id}`,
				label: statusLabel(s.id),
				color: s.dot,
				statusId: s.id as StatusId,
				tasks: sortTasks(
					items.filter((t) => t.status === s.id),
					sort
				)
			})).filter((g) => g.tasks.length > 0);
		}
		if (sub === 'priority') {
			return [...TRACKR_PRIORITIES]
				.reverse()
				.map((p) => ({
					key: `${col.key}:${p.id}`,
					label: priorityLabel(p.id),
					color: p.color,
					priorityId: p.id as PriorityId,
					tasks: sortTasks(
						items.filter((t) => t.priority === p.id),
						sort
					)
				}))
				.filter((g) => g.tasks.length > 0);
		}
		// assignee
		const ids = Array.from(new Set(items.flatMap((t) => t.assignees ?? [t.assignee])));
		return ids
			.map((uid) => {
				const u = resolveUser(uid);
				return {
					key: `${col.key}:${uid}`,
					label: u?.name ?? uid,
					color: u?.color,
					userId: uid,
					tasks: sortTasks(
						items.filter((t) => (t.assignees ?? [t.assignee]).includes(uid)),
						sort
					)
				};
			})
			.filter((g) => g.tasks.length > 0)
			.sort((a, b) => a.label.localeCompare(b.label));
	}
</script>

<div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
	<div class="flex h-full">
		{#each columns as col (col.key)}
			{@const groups = subGroupsForColumn(col)}
			<div
				class="flex w-[85vw] max-w-[363px] shrink-0 flex-col border-r border-border last:border-r-0"
			>
				<div class="flex items-center gap-2 border-b border-border px-4 py-3">
					{#if col.statusId}
						<StatusDot status={col.statusId} size={12} />
					{:else if col.userId}
						{@const u = resolveUser(col.userId)}
						<Avatar user={u} size={17} />
					{:else if col.priorityId && col.priorityId !== 'none'}
						<PriorityBars priority={col.priorityId} />
					{:else if col.color !== 'transparent'}
						<span class="h-2.5 w-2.5 rounded-full" style:background={col.color}></span>
					{/if}
					{#if projectHref(col.project)}
						<a
							href={projectHref(col.project)}
							class="truncate text-[14px] font-semibold text-text hover:underline"
							title={m.tasks_open_project({ name: col.label })}
						>
							{col.label}
						</a>
					{:else}
						<span class="truncate text-[14px] font-semibold text-text">{col.label}</span>
					{/if}
					<span class="font-mono text-[12px] text-text-3">{col.tasks.length}</span>
					<span class="ml-auto">
						<IconButton
							size={26}
							ariaLabel={m.tasks_add_task()}
							onclick={() => onAddInProject?.(col.project ?? ('TRACKR' as ProjectId), col.statusId)}
						>
							<Icon name="plus" size={14} />
						</IconButton>
					</span>
				</div>
				<div class="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
					{#each groups as g (g.key)}
						{@const isCollapsed = collapsed.has(g.key)}
						<div>
							{#if g.label}
								<button
									type="button"
									onclick={() => toggle(g.key)}
									class="flex w-full items-center gap-2 px-1 py-1 text-left text-[12px] font-medium tracking-[0.08em] text-text-3 uppercase hover:text-text"
								>
									<span class="text-text-4 transition-transform {isCollapsed ? '-rotate-90' : ''}">
										<Icon name="chevron" size={11} />
									</span>
									{#if g.statusId}
										<StatusDot status={g.statusId} size={12} />
									{:else if g.priorityId && g.priorityId !== 'none'}
										<PriorityBars priority={g.priorityId} />
									{:else if g.userId}
										{@const u = resolveUser(g.userId)}
										<Avatar user={u} size={15} />
									{:else if g.color}
										<span class="h-2 w-2 rounded-full" style:background={g.color}></span>
									{/if}
									<span>{g.label}</span>
									<span class="ml-auto font-mono text-text-4">{g.tasks.length}</span>
								</button>
							{/if}
							{#if !isCollapsed}
								<div
									class="mt-1.5 space-y-2"
									transition:slide={{ duration: 180, easing: cubicOut }}
								>
									{#each g.tasks as t (t.id)}
										<BoardCard task={t} onclick={() => onSelect?.(t)} />
									{/each}
								</div>
							{/if}
						</div>
					{/each}
					<button
						type="button"
						onclick={() => onAddInProject?.(col.project ?? ('TRACKR' as ProjectId), col.statusId)}
						class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-[13px] text-text-3 transition-colors hover:border-border-strong hover:text-text"
					>
						<Icon name="plus" size={13} />
						{m.tasks_new_task()}
					</button>
				</div>
			</div>
		{/each}
	</div>
</div>
