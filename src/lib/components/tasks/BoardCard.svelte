<script lang="ts">
	import type { Task } from '$lib/types';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import Icon from '../Icon.svelte';
	import { formatDateLong, formatDateShort, formatEstimate } from '$lib/data';
	import { resolveUser } from '$lib/lookup.svelte';

	interface Props {
		task: Task;
		onclick?: () => void;
	}
	let { task, onclick }: Props = $props();

	let assignees = $derived((task.assignees ?? [task.assignee]).map((id) => resolveUser(id)));
</script>

<button
	type="button"
	{onclick}
	class="group block w-full text-left bg-bg-elev hover:bg-surface border border-border rounded-xl px-3 py-2.5 transition-colors shadow-[0_1px_0_rgba(255,255,255,0.02)_inset]"
>
	<div class="flex items-center gap-2 mb-1.5">
		<StatusDot status={task.status} />
		{#if task.type}
			<TypeBadge type={task.type} />
		{/if}
		<span class="font-mono text-[10.5px] text-text-3">{task.id}</span>
		{#if task.plannedFor || task.inMyPlan}
			<span
				class="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] text-accent"
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
	</div>
	<div class="text-[13px] font-medium text-text leading-snug mb-1.5 line-clamp-3">
		{task.title}
	</div>
	<div class="flex items-center gap-2 text-[11px] text-text-3">
		{#if task.priority !== 'none'}
			<PriorityBars priority={task.priority} />
		{/if}
		{#if task.endDate || task.due}
			<span class="inline-flex items-center gap-1">
				<Icon name="calendar" size={11} />
				<span class="font-mono">{formatDateLong(task.endDate ?? task.due!)}</span>
			</span>
		{/if}
		{#if task.estimate}
			<span class="font-mono">{formatEstimate(task.estimate)}</span>
		{/if}
		<span class="ml-auto">
			<AvatarStack users={assignees} size={20} max={3} overlap={5} />
		</span>
	</div>
</button>
