<script lang="ts">
	import type { Task, ProjectId, StatusId, PriorityId } from '$lib/types';
	import {
		TRACKR_PRIORITIES,
		TRACKR_PROJECTS,
		TRACKR_STATUSES,
		TRACKR_USERS,
		userById
	} from '$lib/data';
	import BoardCard from './BoardCard.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';

	export type BoardGroup = 'project' | 'status' | 'priority' | 'assignee' | 'none';
	export type BoardSub = 'none' | 'status' | 'priority' | 'assignee';

	interface Props {
		tasks: Task[];
		group?: BoardGroup;
		sub?: BoardSub;
		onSelect?: (t: Task) => void;
		onAddInProject?: (pid: ProjectId, statusId?: StatusId) => void;
	}
	let { tasks, group = 'project', sub = 'status', onSelect, onAddInProject }: Props = $props();

	const prioRank: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };

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
			return (Object.keys(TRACKR_PROJECTS) as ProjectId[]).map((pid) => ({
				key: pid,
				label: TRACKR_PROJECTS[pid].name,
				color: TRACKR_PROJECTS[pid].color,
				project: pid,
				tasks: tasks.filter((t) => t.project === pid)
			}));
		}
		if (group === 'status') {
			return TRACKR_STATUSES.map((s) => ({
				key: s.id,
				label: s.label,
				color: s.dot,
				statusId: s.id as StatusId,
				tasks: tasks.filter((t) => t.status === s.id)
			}));
		}
		if (group === 'priority') {
			return [...TRACKR_PRIORITIES].reverse().map((p) => ({
				key: p.id,
				label: p.label,
				color: p.color,
				priorityId: p.id as PriorityId,
				tasks: tasks.filter((t) => t.priority === p.id)
			}));
		}
		if (group === 'assignee') {
			const ids = Array.from(new Set(tasks.flatMap((t) => t.assignees ?? [t.assignee])));
			return ids.map((uid) => {
				const u = userById(uid);
				return {
					key: uid,
					label: u?.name ?? uid,
					color: u?.color ?? '#666',
					userId: uid,
					tasks: tasks.filter((t) => (t.assignees ?? [t.assignee]).includes(uid))
				};
			});
		}
		return [{ key: 'all', label: 'All tasks', color: 'transparent', tasks }];
	});

	let collapsed = $state(new Set<string>());
	function toggle(key: string) {
		const n = new Set(collapsed);
		n.has(key) ? n.delete(key) : n.add(key);
		collapsed = n;
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
					tasks: items.sort((a, b) => prioRank[b.priority] - prioRank[a.priority])
				}
			];
		}
		if (sub === 'status') {
			return TRACKR_STATUSES.map((s) => ({
				key: `${col.key}:${s.id}`,
				label: s.label,
				color: s.dot,
				statusId: s.id as StatusId,
				tasks: items
					.filter((t) => t.status === s.id)
					.sort((a, b) => prioRank[b.priority] - prioRank[a.priority])
			})).filter((g) => g.tasks.length > 0);
		}
		if (sub === 'priority') {
			return [...TRACKR_PRIORITIES]
				.reverse()
				.map((p) => ({
					key: `${col.key}:${p.id}`,
					label: p.label,
					color: p.color,
					priorityId: p.id as PriorityId,
					tasks: items.filter((t) => t.priority === p.id)
				}))
				.filter((g) => g.tasks.length > 0);
		}
		// assignee
		const ids = Array.from(new Set(items.flatMap((t) => t.assignees ?? [t.assignee])));
		return ids
			.map((uid) => {
				const u = userById(uid);
				return {
					key: `${col.key}:${uid}`,
					label: u?.name ?? uid,
					color: u?.color,
					userId: uid,
					tasks: items.filter((t) => (t.assignees ?? [t.assignee]).includes(uid))
				};
			})
			.filter((g) => g.tasks.length > 0);
	}
</script>

<div class="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
	<div class="flex h-full">
		{#each columns as col (col.key)}
			{@const groups = subGroupsForColumn(col)}
			<div class="flex flex-col w-[330px] shrink-0 border-r border-border last:border-r-0">
				<div class="flex items-center gap-2 px-4 py-3 border-b border-border">
					{#if col.statusId}
						<StatusDot status={col.statusId} size={11} />
					{:else if col.userId}
						{@const u = userById(col.userId)}
						<Avatar user={u} size={16} />
					{:else if col.priorityId && col.priorityId !== 'none'}
						<PriorityBars priority={col.priorityId} />
					{:else if col.color !== 'transparent'}
						<span class="w-2.5 h-2.5 rounded-full" style:background={col.color}></span>
					{/if}
					<span class="text-[13px] font-semibold text-text">{col.label}</span>
					<span class="font-mono text-[11px] text-text-3">{col.tasks.length}</span>
					<span class="ml-auto">
						<IconButton
							size={24}
							ariaLabel="Add task"
							onclick={() => onAddInProject?.(col.project ?? ('TRACKR' as ProjectId), col.statusId)}
						>
							<Icon name="plus" size={13} />
						</IconButton>
					</span>
				</div>
				<div class="flex-1 overflow-y-auto space-y-3 px-3.5 py-3">
					{#each groups as g (g.key)}
						{@const isCollapsed = collapsed.has(g.key)}
						<div>
							{#if g.label}
								<button
									type="button"
									onclick={() => toggle(g.key)}
									class="flex items-center gap-2 w-full px-1 py-1 text-left text-[10.5px] uppercase tracking-[0.08em] font-medium text-text-3 hover:text-text"
								>
									<span class="text-text-4 transition-transform {isCollapsed ? '-rotate-90' : ''}">
										<Icon name="chevron" size={10} />
									</span>
									{#if g.statusId}
										<StatusDot status={g.statusId} size={11} />
									{:else if g.priorityId && g.priorityId !== 'none'}
										<PriorityBars priority={g.priorityId} />
									{:else if g.userId}
										{@const u = userById(g.userId)}
										<Avatar user={u} size={14} />
									{:else if g.color}
										<span class="w-2 h-2 rounded-full" style:background={g.color}></span>
									{/if}
									<span>{g.label}</span>
									<span class="ml-auto font-mono text-text-4">{g.tasks.length}</span>
								</button>
							{/if}
							{#if !isCollapsed}
								<div class="space-y-2 mt-1.5">
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
						class="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-text-3 hover:text-text hover:border-border-strong transition-colors text-[12px]"
					>
						<Icon name="plus" size={12} /> New task
					</button>
				</div>
			</div>
		{/each}
	</div>
</div>
