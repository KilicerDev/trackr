<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { Task } from '$lib/types';
	import BoardCard from '$lib/components/tasks/BoardCard.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { resolveProject } from '$lib/stores/lookup.svelte';
	import { taskTimeMinutes } from '$lib/utils/task';
	import { m } from '$lib/paraglide/messages';

	type Day = { iso: string; label: string; dayOfMonth: number; tasks: Task[]; minutes: number };
	let {
		days,
		todayIso,
		showDone,
		unscheduled,
		unscheduledTabs,
		onselect,
		onadd
	}: {
		days: Day[];
		todayIso: string;
		showDone: boolean;
		unscheduled: Task[];
		unscheduledTabs: Snippet;
		onselect: (task: Task) => void;
		onadd: (iso: string) => void;
	} = $props();

	let board = $state<HTMLDivElement>();
	const capacity = 8 * 60;
	const formatMinutes = (minutes: number) =>
		`${Math.floor(minutes / 60)}h${minutes % 60 ? `${minutes % 60}m` : ''}`;

	// Start at today only when entering the board. Task selection, filters,
	// and week navigation must preserve the user's horizontal scroll position.
	onMount(() => {
		const today = todayIso;
		const element = board;
		let cancelled = false;
		if (element) {
			void tick().then(() => {
				if (cancelled) return;
				const column = element.querySelector<HTMLElement>(`[data-date="${today}"]`);
				element.scrollLeft = column
					? column.getBoundingClientRect().left -
						element.getBoundingClientRect().left +
						element.scrollLeft
					: 0;
			});
		}
		return () => {
			cancelled = true;
		};
	});
</script>

{#snippet card(task: Task, planned: boolean)}
	{@const project = resolveProject(task.project)}
	<div>
		<div class="mb-1.5 flex min-w-0 items-center gap-1.5 px-1 text-[12px] text-text-3">
			<span
				class="h-2 w-2 shrink-0 rounded-full"
				style:background={project?.color ?? 'var(--text-3)'}
			></span>
			<span class="truncate">{project?.name ?? task.project}</span>
		</div>
		<BoardCard
			{task}
			showPlanned={!planned}
			timeLabel={formatMinutes(taskTimeMinutes(task) ?? 60)}
			onclick={() => onselect(task)}
		/>
	</div>
{/snippet}

<div
	bind:this={board}
	class="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
	role="region"
	aria-label={m.tasks_view_board()}
	tabindex="0"
>
	<div class="flex h-full min-h-0">
		{#each days as day, index (day.iso)}
			{@const today = day.iso === todayIso}
			{@const visible = day.tasks.filter((task) => showDone || task.status !== 'done')}
			{@const hidden = day.tasks.length - visible.length}
			<section
				data-date={day.iso}
				aria-label={day.label}
				class="flex h-full w-[85vw] max-w-[300px] shrink-0 flex-col border-r border-border"
			>
				<div
					class="grid shrink-0 grid-rows-[1.5rem_1.75rem] gap-2 border-b border-border bg-surface/40 px-4 py-3"
				>
					<div class="flex items-center gap-2">
						<h2
							class="text-[14px] font-semibold {today
								? 'text-accent'
								: index >= 5
									? 'text-text-2'
									: 'text-text'}"
						>
							{day.label}
						</h2>
						<span class="font-mono text-[13px] text-text-3">{day.dayOfMonth}</span>
						{#if today}
							<span
								class="rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent"
								>{m.common_today()}</span
							>
						{/if}
						<span class="ml-auto font-mono text-[12px] text-text-3">{visible.length}</span>
					</div>
					<div class="flex items-center gap-3">
						<div class="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
							<div
								class="h-full {day.minutes > capacity
									? 'bg-prio-urgent'
									: today
										? 'bg-accent'
										: 'bg-text-3'}"
								style:width="{Math.min(100, (day.minutes / capacity) * 100)}%"
							></div>
						</div>
						<span class="font-mono text-[12px] text-text-3">{formatMinutes(day.minutes)}</span>
					</div>
				</div>
				<div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
					{#if hidden > 0}
						<p class="px-1 text-[12px] text-text-3">{m.week_done_hidden({ n: hidden })}</p>
					{/if}
					{#each visible as task (task.id)}
						{@render card(task, true)}
					{/each}
					<button
						type="button"
						onclick={() => onadd(day.iso)}
						class="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[13px] text-text-3 transition-colors hover:border-border-strong hover:text-text"
					>
						<Icon name="plus" size={13} />
						{m.week_add_task()}
					</button>
				</div>
			</section>
		{/each}
		<section
			aria-label={m.week_unscheduled()}
			class="flex h-full w-[85vw] max-w-[300px] shrink-0 flex-col"
		>
			<div
				class="grid shrink-0 grid-rows-[1.5rem_1.75rem] gap-2 border-b border-border bg-surface/40 px-4 py-3"
			>
				<div class="flex items-center gap-2">
					<h2 class="text-[14px] font-semibold text-text">{m.week_unscheduled()}</h2>
					<span class="ml-auto font-mono text-[12px] text-text-3">{unscheduled.length}</span>
				</div>
				<div class="flex items-center">
					{@render unscheduledTabs()}
				</div>
			</div>
			<div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
				{#each unscheduled as task (task.id)}
					{@render card(task, false)}
				{:else}
					<div class="px-1 py-4 text-[13px]">
						<p class="text-text-2">{m.week_inbox_zero()}</p>
						<p class="mt-1 text-text-3">{m.week_unscheduled_hint()}</p>
					</div>
				{/each}
			</div>
		</section>
	</div>
</div>
