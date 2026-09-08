<script lang="ts">
	import type { Task } from '$lib/types';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import LabelChip from '../LabelChip.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import Avatar from '../Avatar.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_PRIORITIES } from '$lib/config/taxonomy';
	import { formatDateShort, formatEstimate, dueCountdown } from '$lib/utils/format';
	import { loggedMinutes } from '$lib/utils/task';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { priorityLabel, statusLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		task: Task;
		selected?: boolean;
		onclick?: () => void;
		// My-week rows sit under their planned day's header, so the planned-date
		// chip is redundant there.
		showPlanned?: boolean;
		// My week trades the "updated" column for logged/estimated time —
		// capacity is that page's currency.
		showTime?: boolean;
	}
	let { task, selected = false, onclick, showPlanned = true, showTime = false }: Props = $props();

	let prio = $derived(TRACKR_PRIORITIES.find((p) => p.id === task.priority)!);
	let assignee = $derived(resolveUser(task.assignee));
	// Real logged time when any exists, otherwise the estimate.
	let logged = $derived(loggedMinutes(task));
	let timeMinutes = $derived(logged > 0 ? logged : task.estimate);

	// Suppress the countdown for completed tasks — a finished task isn't
	// "overdue". Only show the live indicator while work is still pending.
	let due = $derived(task.status === 'done' ? null : dueCountdown(task.due));
	// Open prerequisites. When any exist the link indicator replaces the
	// status dot in the leading column; the status stays in its tooltip.
	let openDeps = $derived(
		task.blocked ? (task.dependsOn ?? []).filter((d) => d.status !== 'done').length : 0
	);
	const DUE_TONE: Record<string, string> = {
		overdue: 'text-[#ef4f5e] font-medium',
		urgent: 'text-accent',
		soon: 'text-[#d8a24a]'
	};
</script>

<button
	type="button"
	{onclick}
	class="grid w-full grid-cols-[30px_minmax(0,1fr)_auto_28px] items-center gap-3 border-b border-border/60 px-5 text-left transition-colors md:grid-cols-[30px_88px_minmax(0,1fr)_110px_88px_88px_28px]
	{selected ? 'bg-[var(--row-active)]' : 'hover:bg-[var(--row-hover)]'}"
	style:height="var(--row-h)"
>
	{#if openDeps > 0}
		<span
			class="inline-flex items-center gap-0.5 text-[var(--color-status-paused)]"
			title="{openDeps === 1
				? m.tasks_blocked_badge_title_one()
				: m.tasks_blocked_badge_title({ n: openDeps })} · {statusLabel(task.status)}"
		>
			<Icon name="link" size={13} />
			<span class="font-mono text-[12px]">{openDeps}</span>
		</span>
	{:else}
		<StatusDot status={task.status} />
	{/if}
	<span class="hidden truncate font-mono text-[13px] text-text-3 md:block">{task.id}</span>
	<span class="flex min-w-0 items-center gap-2">
		<span class="shrink-0"><TypeBadge type={task.type ?? 'task'} showLabel={false} /></span>
		<span class="truncate text-[14px] text-text">{task.title}</span>
		{#if showPlanned && (task.plannedFor || task.inMyPlan)}
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
	{#if showTime}
		<span
			class="hidden font-mono text-[13px] md:block {logged > 0 ? 'text-text-2' : 'text-text-3'}"
			title={timeMinutes
				? logged > 0
					? m.week_time_logged()
					: m.week_time_estimated()
				: undefined}
		>
			{timeMinutes ? formatEstimate(timeMinutes) : '—'}
		</span>
	{:else}
		<span class="hidden font-mono text-[13px] text-text-3 md:block">
			{formatDateShort(task.updated)}
		</span>
	{/if}
	<span class="flex justify-end">
		<Avatar user={assignee} size={24} />
	</span>
</button>
