<script lang="ts">
	import type { TaskSummary } from '$lib/types';
	import { isClosedStatus } from '$lib/utils/task';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_PRIORITIES, TRACKR_TYPES } from '$lib/config/taxonomy';
	import { labelMeta } from '$lib/utils/label-meta';
	import { formatDateShort, formatEstimate, dueCountdown } from '$lib/utils/format';
	import { loggedMinutes } from '$lib/utils/task';
	import { resolveProject, resolveUser } from '$lib/stores/lookup.svelte';
	import { priorityLabel, statusLabel, typeLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		task: TaskSummary;
		selected?: boolean;
		onclick?: () => void;
		// My-week rows sit under their planned day's header, so the planned-date
		// chip is redundant there.
		showPlanned?: boolean;
		// My week trades the "updated" column for logged/estimated time —
		// capacity is that page's currency.
		showTime?: boolean;
		/** My Week: the minutes this row counts for on its day (else logged/estimate). */
		minutes?: number;
		/**
		 * My Week: why the task is on this day besides being planned there —
		 * `carried` (unfinished, rolled over from an earlier day) or `chunk` (I
		 * worked on it that day). `label` is the ready-to-show text.
		 */
		dayNote?: { kind: 'carried' | 'chunk'; label: string };
		/** Show the project (dot + name) after the title — My Week, where rows
		 *  from several projects share a day. */
		showProject?: boolean;
	}
	let {
		task,
		selected = false,
		onclick,
		showPlanned = true,
		showTime = false,
		minutes,
		dayNote,
		showProject = false
	}: Props = $props();
	let project = $derived(showProject ? resolveProject(task.project) : undefined);

	let prio = $derived(TRACKR_PRIORITIES.find((p) => p.id === task.priority)!);
	let type = $derived(TRACKR_TYPES.find((t) => t.id === (task.type ?? 'task')) ?? TRACKR_TYPES[0]);
	// Tags stay quiet (dot + text) and at most two show; the rest is "+N".
	const MAX_TAGS = 2;
	let shownTags = $derived(task.labels.slice(0, MAX_TAGS).map((l) => labelMeta(l)));
	let moreTags = $derived(Math.max(0, task.labels.length - MAX_TAGS));
	let working = $derived(task.status === 'in_progress' || task.status === 'in_review');
	// Every assignee, not just the primary one — matches the ticket row and
	// the board card. Legacy rows without an `assignees` array fall back to
	// the single `assignee`.
	let assignees = $derived((task.assignees ?? [task.assignee]).map((id) => resolveUser(id)));
	let assigneeCount = $derived(assignees.filter(Boolean).length);
	// The trailing column is fixed at 60px so date columns stay aligned across
	// rows: three 24px avatars at 6px overlap fill it exactly, and beyond three
	// we show two plus a "+N" badge, which is the same width.
	let avatarMax = $derived(assigneeCount > 3 ? 2 : 3);
	// Real logged time when any exists, otherwise the estimate.
	let logged = $derived(loggedMinutes(task));
	let timeMinutes = $derived(minutes ?? (logged > 0 ? logged : task.estimate));

	// Suppress the countdown for completed tasks — a finished task isn't
	// "overdue". Only show the live indicator while work is still pending.
	let due = $derived(isClosedStatus(task.status) ? null : dueCountdown(task.due));
	// Open prerequisites. When any exist the link indicator replaces the
	// status dot in the leading column; the status stays in its tooltip.
	let openDeps = $derived(
		task.blocked ? (task.dependsOn ?? []).filter((d) => !isClosedStatus(d.status)).length : 0
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
	class="grid w-full grid-cols-[30px_minmax(0,1fr)_auto_60px] items-center gap-3 border-b border-border/60 px-5 text-left transition-colors {showProject
		? 'md:grid-cols-[30px_92px_minmax(0,1fr)_150px_24px_92px_64px_60px]'
		: 'md:grid-cols-[30px_92px_minmax(0,1fr)_24px_92px_64px_60px]'}
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
	<span class="hidden truncate font-mono text-[12px] leading-none text-text-4 md:block"
		>{task.id}</span
	>
	<span class="flex min-w-0 items-center gap-2">
		<!-- Type as a plain icon, coloured only for bugs. -->
		<span
			class="shrink-0 text-text-4"
			style:color={type.id === 'bug' ? type.color : undefined}
			title={typeLabel(task.type ?? 'task')}
		>
			<Icon name={type.icon} size={13} stroke={2} />
		</span>
		<span class="truncate text-[14px] text-text">{task.title}</span>
		{#if showPlanned && (task.plannedFor || task.inMyPlan)}
			<span
				class="inline-flex shrink-0 items-center gap-1 text-[12px] text-accent"
				title={task.plannedFor
					? m.tasks_planned_for({ date: formatDateShort(task.plannedFor) })
					: m.tasks_in_your_week_no_date()}
			>
				<Icon name="bookmark" size={12} />
				{#if task.plannedFor}
					<span class="font-mono">{formatDateShort(task.plannedFor)}</span>
				{:else}
					<span>{m.tasks_this_week()}</span>
				{/if}
			</span>
		{/if}
		{#if dayNote}
			<span
				class="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[12px] {dayNote.kind ===
				'carried'
					? 'bg-[color-mix(in_srgb,var(--color-status-paused)_16%,transparent)] text-[var(--color-status-paused)]'
					: 'bg-surface-2 text-text-3'}"
			>
				<Icon name={dayNote.kind === 'carried' ? 'refresh' : 'calendar'} size={12} />
				<span>{dayNote.label}</span>
			</span>
		{/if}
		{#if shownTags.length}
			<span
				class="hidden shrink-0 items-center gap-2.5 text-[12px] leading-none text-text-3 md:inline-flex"
			>
				{#each shownTags as t (t.label)}
					<span class="inline-flex items-center gap-1">
						<span class="h-1.5 w-1.5 rounded-full" style:background={t.color}></span>
						{t.label}
					</span>
				{/each}
				{#if moreTags > 0}
					<span class="font-mono text-text-4" title={task.labels.slice(MAX_TAGS).join(', ')}
						>+{moreTags}</span
					>
				{/if}
			</span>
		{/if}
		{#if working && task.checklistTotal > 0}
			<span
				class="inline-flex items-center gap-1 text-[12px] {task.checklistDone ===
				task.checklistTotal
					? 'text-[#7fc8a9]'
					: 'text-text-3'}"
				title={m.tasks_checklist()}
			>
				<Icon name="check-square" size={12} />
				<span class="font-mono">{task.checklistDone}/{task.checklistTotal}</span>
			</span>
		{/if}
	</span>
	{#if showProject}
		<!-- Own column, so project names line up row under row. leading-none
		     keeps the dot centred on the small text. -->
		<span
			class="hidden min-w-0 items-center gap-1.5 text-[12px] leading-none text-text-3 md:flex"
			title={project?.name ?? task.project}
		>
			<span
				class="h-1.5 w-1.5 shrink-0 rounded-full"
				style:background={project?.color ?? 'var(--text-4)'}
			></span>
			<span class="truncate">{project?.name ?? task.project}</span>
		</span>
	{/if}
	<!-- Priority as bars only (label in the tooltip); empty for none. -->
	<span class="hidden items-center md:flex" title={priorityLabel(prio.id)}>
		{#if task.priority !== 'none'}<PriorityBars priority={task.priority} />{/if}
	</span>
	<!-- Due: the countdown when near or past, otherwise a muted date; empty
	     when there is none. -->
	<span class="text-[13px]">
		{#if task.due && due && due.label}
			<span class={DUE_TONE[due.tone]} title={formatDateShort(task.due)}>{due.label}</span>
		{:else if task.due}
			<span class="font-mono text-[12px] text-text-4">{formatDateShort(task.due)}</span>
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
		<span
			class="hidden font-mono text-[12px] leading-none text-text-4 md:block"
			title={m.tasks_updated()}
		>
			{formatDateShort(task.updated)}
		</span>
	{/if}
	<span class="flex justify-end">
		{#if assigneeCount > 0}
			<AvatarStack users={assignees} size={22} max={avatarMax} overlap={6} />
		{:else}
			<span class="h-[22px] w-[22px] rounded-full border border-dashed border-border-strong"></span>
		{/if}
	</span>
</button>
