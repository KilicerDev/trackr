<script lang="ts">
	import type { Task } from '$lib/types';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import LabelChip from '../LabelChip.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import Avatar from '../Avatar.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_PRIORITIES } from '$lib/config/taxonomy';
	import { formatDateShort, dueCountdown } from '$lib/utils/format';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { priorityLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		task: Task;
		selected?: boolean;
		onclick?: () => void;
	}
	let { task, selected = false, onclick }: Props = $props();

	let prio = $derived(TRACKR_PRIORITIES.find((p) => p.id === task.priority)!);
	let assignee = $derived(resolveUser(task.assignee));

	// Suppress the countdown for completed tasks — a finished task isn't
	// "overdue". Only show the live indicator while work is still pending.
	let due = $derived(task.status === 'done' ? null : dueCountdown(task.due));
	const DUE_TONE: Record<string, string> = {
		overdue: 'text-[#ef4f5e] font-medium',
		urgent: 'text-accent',
		soon: 'text-[#d8a24a]'
	};
</script>

<button
	type="button"
	{onclick}
	class="group grid w-full grid-cols-[22px_minmax(0,1fr)_auto_28px] items-center gap-3 border-b border-border/60 px-5 text-left transition-colors md:grid-cols-[22px_88px_minmax(0,1fr)_110px_88px_88px_96px_30px]
	{selected ? 'bg-[var(--row-active)]' : 'hover:bg-[var(--row-hover)]'}"
	style:height="var(--row-h)"
>
	<StatusDot status={task.status} />
	<span class="hidden truncate font-mono text-[13px] text-text-3 md:block">{task.id}</span>
	<span class="flex min-w-0 items-center gap-2">
		<span class="shrink-0"><TypeBadge type={task.type ?? 'task'} showLabel={false} /></span>
		<span class="truncate text-[14px] text-text">{task.title}</span>
		{#if task.plannedFor || task.inMyPlan}
			<span
				class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent-soft px-2 py-0.5 text-[12px] text-accent"
				title={task.plannedFor
					? m.tasks_planned_for({ date: formatDateShort(task.plannedFor) })
					: m.tasks_in_your_week_no_date()}
			>
				{#if task.plannedFor}
					<Icon name="calendar" size={13} />
					<span class="font-mono">{formatDateShort(task.plannedFor)}</span>
				{:else}
					<Icon name="bookmark" size={13} />
					<span>{m.tasks_this_week()}</span>
				{/if}
			</span>
		{/if}
		<span class="hidden md:contents">
			{#each task.labels as l (l)}
				<LabelChip id={l} />
			{/each}
		</span>
		{#if task.checklist && task.checklist.length > 0}
			<span
				class="inline-flex items-center gap-1 text-[12px] {task.checklist.every((i) => i.done)
					? 'text-[#7fc8a9]'
					: 'text-text-3'}"
				title={m.tasks_checklist()}
			>
				<Icon name="check-square" size={12} />
				<span class="font-mono"
					>{task.checklist.filter((i) => i.done).length}/{task.checklist.length}</span
				>
			</span>
		{/if}
	</span>
	<span class="hidden items-center gap-2 text-[14px] text-text-3 md:flex">
		{#if task.priority !== 'none'}
			<PriorityBars priority={task.priority} />
			<span>{priorityLabel(prio.id)}</span>
		{:else}
			<span class="text-text-4">—</span>
		{/if}
	</span>
	<span class="text-[13px]">
		{#if !task.due}
			<span class="font-mono text-text-3">—</span>
		{:else if due && due.label}
			<span class={DUE_TONE[due.tone]} title={formatDateShort(task.due)}>{due.label}</span>
		{:else}
			<span class="font-mono text-text-3">{formatDateShort(task.due)}</span>
		{/if}
	</span>
	<span class="hidden font-mono text-[13px] text-text-3 md:block">
		{formatDateShort(task.updated)}
	</span>
	<span class="flex justify-start">
		<Avatar user={assignee} size={24} />
	</span>
	<span class="hidden text-text-3 opacity-0 transition-opacity group-hover:opacity-100 md:block">
		<Icon name="chevron-r" size={15} />
	</span>
</button>
