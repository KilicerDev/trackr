<script lang="ts">
	import type { Task } from '$lib/types';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import LabelChip from '../LabelChip.svelte';
	import Avatar from '../Avatar.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_PRIORITIES, formatDateShort } from '$lib/data';
	import { resolveUser } from '$lib/lookup.svelte';

	interface Props {
		task: Task;
		selected?: boolean;
		onclick?: () => void;
	}
	let { task, selected = false, onclick }: Props = $props();

	let prio = $derived(TRACKR_PRIORITIES.find((p) => p.id === task.priority)!);
	let assignee = $derived(resolveUser(task.assignee));
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
		<span class="truncate text-[13.5px] text-text">{task.title}</span>
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
	<span class="font-mono text-[12px] text-text-3">
		{#if task.due}{formatDateShort(task.due)}{:else}—{/if}
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
