<script lang="ts">
	import type { Task } from '$lib/types';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import Avatar from '../Avatar.svelte';
	import { formatEstimate, loggedMinutes } from '$lib/data';
	import { resolveProject, resolveUser } from '$lib/lookup.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		task: Task;
		onclick?: () => void;
	}
	let { task, onclick }: Props = $props();
	let assignee = $derived(resolveUser(task.assignee));
	let project = $derived(resolveProject(task.project));
	// Show real logged time when any has been logged, otherwise the estimate.
	let logged = $derived(loggedMinutes(task));
	let timeMinutes = $derived(logged > 0 ? logged : task.estimate);
</script>

<button
	type="button"
	{onclick}
	class="group flex items-center gap-2.5 w-full px-3.5 py-2 hover:bg-[var(--row-hover)] transition-colors text-left border-b border-border/40 last:border-b-0"
>
	<StatusDot status={task.status} />
	<span class="font-mono text-[11.5px] text-text-3 w-[78px] shrink-0">{task.id}</span>
	<span class="shrink-0"><TypeBadge type={task.type ?? 'task'} showLabel={false} /></span>
	<span class="text-[13px] text-text truncate flex-1 {task.status === 'done' ? 'line-through text-text-3' : ''}">{task.title}</span>
	{#if task.priority !== 'none'}
		<PriorityBars priority={task.priority} />
	{/if}
	{#if timeMinutes}
		<span
			class="font-mono text-[11px] w-10 text-right {logged > 0 ? 'text-text-2' : 'text-text-3'}"
			title={logged > 0 ? m.week_time_logged() : m.week_time_estimated()}
		>{formatEstimate(timeMinutes)}</span>
	{/if}
	<span
		class="w-2 h-2 rounded-full"
		style:background={project?.color ?? '#7c7c84'}
		title={project?.name ?? ''}
	></span>
	<Avatar user={assignee} size={20} />
</button>
