<script lang="ts">
	// Task card for boards (tasks board, project board, My Week). Kept quiet so
	// a full column stays scannable: the title leads, then one muted meta line.
	// - Status shows only when the board isn't already grouped by status
	//   (`showStatus`), or as the link icon when prerequisites are open.
	// - The type is a small icon next to the id, coloured only for bugs.
	// - The due date appears only once it's close or past ("3 days left").
	// - The checklist count appears only while the task is being worked on.
	// - No border: a soft surface that brightens on hover.
	import type { TaskSummary } from '$lib/types';
	import { isClosedStatus } from '$lib/utils/task';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_TYPES } from '$lib/config/taxonomy';
	import { formatDateLong, formatDateShort, dueCountdown } from '$lib/utils/format';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { statusLabel, typeLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		task: TaskSummary;
		onclick?: () => void;
		/** Planned-for date in the meta line (off inside My Week's day columns). */
		showPlanned?: boolean;
		/** Off when the board is grouped by status: the group header says it. */
		showStatus?: boolean;
		/** Time shown in the meta line (My Week passes the day's minutes). */
		timeLabel?: string;
		/**
		 * My Week: why the task is on this day besides being planned there —
		 * `carried` (unfinished, rolled over from an earlier day) or `chunk` (I
		 * worked on it that day). `label` is the ready-to-show text.
		 */
		dayNote?: { kind: 'carried' | 'chunk'; label: string };
	}
	let {
		task,
		onclick,
		showPlanned = true,
		showStatus = true,
		timeLabel,
		dayNote
	}: Props = $props();

	let assignees = $derived((task.assignees ?? [task.assignee]).map((id) => resolveUser(id)));
	let type = $derived(TRACKR_TYPES.find((t) => t.id === (task.type ?? 'task')) ?? TRACKR_TYPES[0]);

	// Due: only the countdown, and only when it's near or past and still open.
	let dueDate = $derived(task.endDate ?? task.due);
	let due = $derived(isClosedStatus(task.status) ? null : dueCountdown(dueDate));
	let openDeps = $derived(
		task.blocked ? (task.dependsOn ?? []).filter((d) => !isClosedStatus(d.status)).length : 0
	);
	let working = $derived(task.status === 'in_progress' || task.status === 'in_review');
	const DUE_TONE: Record<string, string> = {
		overdue: 'text-[#ef4f5e]',
		urgent: 'text-accent',
		soon: 'text-[#d8a24a]'
	};
</script>

<button
	type="button"
	{onclick}
	class="group block w-full rounded-lg bg-bg-elev px-3 py-2.5 text-left transition-colors hover:bg-surface"
>
	<div class="line-clamp-2 text-[14px] leading-snug text-text">{task.title}</div>

	{#if dayNote}
		<div class="mt-1.5">
			<span
				class="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] {dayNote.kind ===
				'carried'
					? 'bg-[color-mix(in_srgb,var(--color-status-paused)_16%,transparent)] text-[var(--color-status-paused)]'
					: 'bg-surface-2 text-text-3'}"
			>
				<Icon name={dayNote.kind === 'carried' ? 'refresh' : 'calendar'} size={12} />
				<span>{dayNote.label}</span>
			</span>
		</div>
	{/if}

	<div class="mt-2 flex min-w-0 items-center gap-2 text-[12px] leading-5 text-text-3">
		{#if openDeps > 0}
			<span
				class="inline-flex items-center gap-0.5 text-[var(--color-status-paused)]"
				title="{openDeps === 1
					? m.tasks_blocked_badge_title_one()
					: m.tasks_blocked_badge_title({ n: openDeps })} · {statusLabel(task.status)}"
			>
				<Icon name="link" size={12} />
				<span class="font-mono">{openDeps}</span>
			</span>
		{:else if showStatus}
			<span title={statusLabel(task.status)}><StatusDot status={task.status} size={12} /></span>
		{/if}
		<span
			class="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-text-4"
			title={typeLabel(task.type ?? 'task')}
		>
			<span style:color={type.id === 'bug' ? type.color : undefined}>
				<Icon name={type.icon} size={12} stroke={2} />
			</span>
			{task.id}
		</span>
		{#if task.priority !== 'none'}
			<PriorityBars priority={task.priority} />
		{/if}
		{#if due && due.label}
			<span
				class="inline-flex shrink-0 items-center gap-1 {DUE_TONE[due.tone] ?? ''}"
				title={formatDateLong(dueDate)}
			>
				<Icon name="calendar" size={12} />
				{due.label}
			</span>
		{/if}
		{#if showPlanned && (task.plannedFor || task.inMyPlan)}
			<span
				class="inline-flex shrink-0 items-center gap-1 text-accent"
				title={task.plannedFor
					? m.tasks_planned_for({ date: formatDateShort(task.plannedFor) })
					: m.tasks_in_your_week_no_date()}
			>
				<Icon name="bookmark" size={12} />
				{#if task.plannedFor}<span class="font-mono">{formatDateShort(task.plannedFor)}</span>{/if}
			</span>
		{/if}
		{#if timeLabel}
			<span class="shrink-0 font-mono">{timeLabel}</span>
		{/if}
		{#if working && task.checklistTotal > 0}
			<span
				class="inline-flex shrink-0 items-center gap-1 {task.checklistDone === task.checklistTotal
					? 'text-[#7fc8a9]'
					: ''}"
				title={m.tasks_checklist()}
			>
				<Icon name="check-square" size={12} />
				<span class="font-mono">{task.checklistDone}/{task.checklistTotal}</span>
			</span>
		{/if}
		<span class="ml-auto shrink-0">
			<AvatarStack users={assignees} size={22} max={3} overlap={5} />
		</span>
	</div>
</button>
