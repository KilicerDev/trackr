<script lang="ts">
	// The panel's time card: logged vs estimate at a glance, with a bar that
	// turns warning-coloured past the estimate, and the Log time form.
	import type { Task } from '$lib/types';
	import Icon from '../../Icon.svelte';
	import TimeLogger from '../TimeLogger.svelte';
	import { loggedMinutes } from '$lib/utils/task';
	import { timeSummary } from '$lib/utils/task-panel';
	import { formatEstimate } from '$lib/utils/format';
	import { SECTION_ACTION } from './styles';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		task: Task;
		onlog: (entry: { h: number; m: number; date: string; note: string }) => void;
		/** Date the log form starts on (My Week: the day the task was opened from). */
		defaultDate?: string;
	}
	let { task, onlog, defaultDate }: Props = $props();

	let open = $state(false);

	// Entries win over the aggregate while the panel has them (patched locally
	// right after a log, before the summary refreshes).
	const logged = $derived(
		task.timeLogs?.length ? task.timeLogs.reduce((s, t) => s + t.minutes, 0) : loggedMinutes(task)
	);
	const s = $derived(timeSummary(logged, task.estimate));
	const fmt = (mins: number) => (mins > 0 ? formatEstimate(mins) : '0m');
</script>

<div class="mb-5 space-y-2">
	<div class="rounded-xl border border-border bg-surface/40 px-4 py-3.5">
		<div class="flex items-start gap-3">
			<div class="min-w-0">
				<div class="text-[12px] text-text-3">{m.tasks_panel_logged()}</div>
				<div class="mt-0.5 flex items-baseline gap-1.5">
					<span class="font-mono text-[22px] leading-tight font-semibold text-text"
						>{fmt(s.logged)}</span
					>
					{#if s.estimate !== null}
						<span class="font-mono text-[13px] text-text-3">/ {formatEstimate(s.estimate)}</span>
					{/if}
				</div>
			</div>
			<button
				type="button"
				onclick={() => (open = !open)}
				aria-expanded={open}
				class="{SECTION_ACTION} ml-auto {open ? 'ring-2 ring-accent/40' : ''}"
			>
				<Icon name="plus" size={13} />
				{m.tasks_log_time()}
			</button>
		</div>

		<div class="mt-3 flex h-1.5 overflow-hidden rounded-full bg-surface-2">
			<div class="h-full bg-accent transition-[width]" style:width="{s.fillPct}%"></div>
			{#if s.overPct > 0}
				<div
					class="h-full bg-[var(--color-status-paused)] transition-[width]"
					style:width="{s.overPct}%"
				></div>
			{/if}
		</div>

		<div class="mt-2 flex items-center text-[12px] text-text-3">
			{#if s.estimate !== null}
				<span>{m.tasks_panel_estimate({ time: formatEstimate(s.estimate) })}</span>
				{#if s.over > 0}
					<span class="ml-auto font-mono text-[var(--color-status-paused)]"
						>{m.tasks_panel_over({ time: formatEstimate(s.over) })}</span
					>
				{:else}
					<span class="ml-auto font-mono">{m.tasks_panel_left({ time: fmt(s.left) })}</span>
				{/if}
			{:else}
				<span>{m.tasks_panel_no_estimate()}</span>
			{/if}
		</div>
	</div>

	<TimeLogger {task} {onlog} {defaultDate} trigger="none" bind:open />
</div>
