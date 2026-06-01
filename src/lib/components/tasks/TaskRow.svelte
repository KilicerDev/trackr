<script lang="ts">
	import type { Task } from '$lib/types';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import LabelChip from '../LabelChip.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import Avatar from '../Avatar.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_PRIORITIES, formatDateShort, dueCountdown } from '$lib/data';
	import { resolveUser } from '$lib/lookup.svelte';

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
	class="group grid items-center gap-3 w-full text-left border-b border-border/60 px-5 transition-colors
	{selected ? 'bg-[var(--row-active)]' : 'hover:bg-[var(--row-hover)]'}"
	style:grid-template-columns="22px 88px 1fr 110px 88px 88px 96px 30px"
	style:height="var(--row-h)"
>
	<StatusDot status={task.status} />
	<span class="font-mono text-[12px] text-text-3 truncate">{task.id}</span>
	<span class="flex items-center gap-2 min-w-0">
		<span class="shrink-0"><TypeBadge type={task.type ?? 'task'} showLabel={false} /></span>
		<span class="truncate text-[13.5px] text-text">{task.title}</span>
		{#if task.plannedFor || task.inMyPlan}
			<span
				class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] text-accent shrink-0"
				style:background="rgba(239,122,109,0.14)"
				title={task.plannedFor
					? `Planned for ${formatDateShort(task.plannedFor)}`
					: 'In your week (no date set)'}
			>
				{#if task.plannedFor}
					<Icon name="calendar" size={12} />
					<span class="font-mono">{formatDateShort(task.plannedFor)}</span>
				{:else}
					<Icon name="bookmark" size={12} />
					<span>This week</span>
				{/if}
			</span>
		{/if}
		{#each task.labels as l (l)}
			<LabelChip id={l} />
		{/each}
	</span>
	<span class="flex items-center gap-2 text-[12.5px] text-text-3">
		{#if task.priority !== 'none'}
			<PriorityBars priority={task.priority} />
			<span>{prio.label}</span>
		{:else}
			<span class="text-text-4">—</span>
		{/if}
	</span>
	<span class="text-[12px]">
		{#if !task.due}
			<span class="font-mono text-text-3">—</span>
		{:else if due && due.label}
			<span class={DUE_TONE[due.tone]} title={formatDateShort(task.due)}>{due.label}</span>
		{:else}
			<span class="font-mono text-text-3">{formatDateShort(task.due)}</span>
		{/if}
	</span>
	<span class="font-mono text-[12px] text-text-3">
		{formatDateShort(task.updated)}
	</span>
	<span class="flex justify-start">
		<Avatar user={assignee} size={22} />
	</span>
	<span class="opacity-0 group-hover:opacity-100 text-text-3 transition-opacity">
		<Icon name="chevron-r" size={14} />
	</span>
</button>
