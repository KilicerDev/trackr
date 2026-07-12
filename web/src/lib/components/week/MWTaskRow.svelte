<script lang="ts">
	import type { Task } from '$lib/types';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import Avatar from '../Avatar.svelte';
	import { formatEstimate } from '$lib/utils/format';
	import { loggedMinutes } from '$lib/utils/task';
	import { resolveProject, resolveUser } from '$lib/stores/lookup.svelte';
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
	class="group flex w-full items-center gap-2.5 border-b border-border/40 px-3.5 py-2 text-left transition-colors last:border-b-0 hover:bg-[var(--row-hover)]"
>
	<StatusDot status={task.status} />
	<span class="w-[86px] shrink-0 font-mono text-[12px] text-text-3">{task.id}</span>
	<span class="shrink-0"><TypeBadge type={task.type ?? 'task'} showLabel={false} /></span>
	<span
		class="flex-1 truncate text-[14px] text-text {task.status === 'done'
			? 'text-text-3 line-through'
			: ''}">{task.title}</span
	>
	{#if task.priority !== 'none'}
		<PriorityBars priority={task.priority} />
	{/if}
	{#if timeMinutes}
		<span
			class="w-[54px] shrink-0 whitespace-nowrap text-right font-mono text-[12px] {logged > 0 ? 'text-text-2' : 'text-text-3'}"
			title={logged > 0 ? m.week_time_logged() : m.week_time_estimated()}
			>{formatEstimate(timeMinutes)}</span
		>
	{/if}
	<span
		class="h-2 w-2 rounded-full"
		style:background={project?.color ?? '#7c7c84'}
		title={project?.name ?? ''}
	></span>
	<Avatar user={assignee} size={22} />
</button>
