<script lang="ts">
	import type { Task } from '$lib/types';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import Icon from '../Icon.svelte';
	import { formatDateLong, formatDateShort, formatEstimate, dueCountdown } from '$lib/utils/format';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		task: Task;
		onclick?: () => void;
	}
	let { task, onclick }: Props = $props();

	let assignees = $derived((task.assignees ?? [task.assignee]).map((id) => resolveUser(id)));

	// Same nearing/overdue indicator as the list view; suppressed for done tasks.
	let dueDate = $derived(task.endDate ?? task.due);
	let due = $derived(task.status === 'done' ? null : dueCountdown(dueDate));
	const DUE_TONE: Record<string, string> = {
		overdue: 'text-[#ef4f5e] font-medium',
		urgent: 'text-accent',
		soon: 'text-[#d8a24a]'
	};
</script>

<button
	type="button"
	{onclick}
	class="group block w-full rounded-xl border border-border bg-bg-elev px-3 py-2.5 text-left shadow-[0_1px_0_rgba(255,255,255,0.02)_inset] transition-colors hover:bg-surface"
>
	<div class="mb-1.5 flex items-center gap-2">
		<StatusDot status={task.status} />
		{#if task.type}
			<TypeBadge type={task.type} />
		{/if}
		<span class="font-mono text-[10.5px] text-text-3">{task.id}</span>
		{#if task.plannedFor || task.inMyPlan}
			<span
				class="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] text-accent"
				style:background="rgba(239,122,109,0.14)"
				title={task.plannedFor
					? m.tasks_planned_for({ date: formatDateShort(task.plannedFor) })
					: m.tasks_in_your_week_no_date()}
			>
				{#if task.plannedFor}
					<Icon name="calendar" size={12} />
					<span class="font-mono">{formatDateShort(task.plannedFor)}</span>
				{:else}
					<Icon name="bookmark" size={12} />
					<span>{m.tasks_this_week()}</span>
				{/if}
			</span>
		{/if}
	</div>
	<div class="mb-1.5 line-clamp-3 text-[13px] leading-snug font-medium text-text">
		{task.title}
	</div>
	<div class="flex items-center gap-2 text-[11px] text-text-3">
		{#if task.priority !== 'none'}
			<PriorityBars priority={task.priority} />
		{/if}
		{#if dueDate}
			{#if due && due.label}
				<span
					class="inline-flex items-center gap-1 {DUE_TONE[due.tone]}"
					title={formatDateLong(dueDate)}
				>
					<Icon name="calendar" size={11} />
					<span>{due.label}</span>
				</span>
			{:else}
				<span class="inline-flex items-center gap-1">
					<Icon name="calendar" size={11} />
					<span class="font-mono">{formatDateLong(dueDate)}</span>
				</span>
			{/if}
		{/if}
		{#if task.estimate}
			<span class="font-mono">{formatEstimate(task.estimate)}</span>
		{/if}
		{#if task.checklist && task.checklist.length > 0}
			<span
				class="inline-flex items-center gap-1 {task.checklist.every((i) => i.done)
					? 'text-[#7fc8a9]'
					: ''}"
				title={m.tasks_checklist()}
			>
				<Icon name="check-square" size={11} />
				<span class="font-mono"
					>{task.checklist.filter((i) => i.done).length}/{task.checklist.length}</span
				>
			</span>
		{/if}
		<span class="ml-auto">
			<AvatarStack users={assignees} size={20} max={3} overlap={5} />
		</span>
	</div>
</button>
