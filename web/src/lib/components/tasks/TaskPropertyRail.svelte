<script lang="ts">
	// Shared task property rail: project, type, status, priority, assignees, due,
	// estimate, tags. The single source of the popover-backed field chips, used
	// by CreateTaskModal and the bulk "create tasks from to-dos" stepper so the
	// picker wiring isn't duplicated.
	import Icon from '../Icon.svelte';
	import Avatar from '../Avatar.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import StatusPopover from '../popovers/StatusPopover.svelte';
	import PriorityPopover from '../popovers/PriorityPopover.svelte';
	import TypePopover from '../popovers/TypePopover.svelte';
	import AssigneePopover from '../popovers/AssigneePopover.svelte';
	import DatePopover from '../popovers/DatePopover.svelte';
	import EstimatePopover from '../popovers/EstimatePopover.svelte';
	import ProjectPopover from '../popovers/ProjectPopover.svelte';
	import TagsPopover from '../popovers/TagsPopover.svelte';
	import { TRACKR_PRIORITIES } from '$lib/config/taxonomy';
	import { formatDateLong, formatEstimate } from '$lib/utils/format';
	import type { PriorityId, ProjectId, StatusId, TypeId } from '$lib/types';
	import { statusLabel, priorityLabel, typeLabel } from '$lib/utils/labels';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import { labelMeta } from '$lib/utils/label-meta';

	type AssignableUser = {
		id: string;
		name: string;
		email: string;
		initials: string;
		color: string;
		status: 'active' | 'invited' | 'disabled';
	};
	type PickableProject = {
		id: string;
		key: string;
		name: string;
		color: string;
		icon: string;
		status: string;
	};

	interface Props {
		project: ProjectId | '';
		type: TypeId;
		status: StatusId;
		priority: PriorityId;
		assignees: string[];
		due: string | null;
		estimate: number | undefined;
		tags: string[];
		projects: PickableProject[];
		users: AssignableUser[];
		memberProjectIds?: string[];
		allAccess?: boolean;
		// Hide the project chip when the host renders its own project picker
		// elsewhere.
		showProject?: boolean;
		/**
		 * `chips` (default): a wrapping row of chips (bulk create). `list`: one
		 * label / value row per property, for a side column (create dialog).
		 */
		layout?: 'chips' | 'list';
		/** Show the "My week" (planned for) property; bind `plannedFor`. */
		showPlanned?: boolean;
		plannedFor?: string | null;
	}

	let {
		project = $bindable(),
		type = $bindable(),
		status = $bindable(),
		priority = $bindable(),
		assignees = $bindable(),
		due = $bindable(),
		estimate = $bindable(),
		tags = $bindable(),
		projects,
		users,
		memberProjectIds = [],
		allAccess = false,
		showProject = true,
		layout = 'chips',
		showPlanned = false,
		plannedFor = $bindable(null)
	}: Props = $props();
	const list = $derived(layout === 'list');

	// Which popover (if any) is open. Local to this rail instance.
	let pop = $state<string | null>(null);

	// Tags on the currently loaded tasks, offered as quick picks right away;
	// the popover fetches the complete app-wide vocabulary itself (kind="task").
	const tagSuggestions = $derived.by(() => {
		const d = page.data as { tasks?: { labels?: string[] }[] };
		return [...new Set((d.tasks ?? []).flatMap((t) => t.labels ?? []))];
	});

	const prioMeta = $derived(TRACKR_PRIORITIES.find((p) => p.id === priority)!);
	const projectMeta = $derived(project ? projects.find((p) => p.key === project) : undefined);
	const assigneeUsers = $derived(assignees.map((id) => users.find((u) => u.id === id)));

	// One style per layout. Chips: a solid hairline chip, same height for all;
	// an empty value is the same chip with muted text (no dashed outlines).
	// List: a full-width label / value row that tints on hover. The open
	// picker's control gets the accent ring / tint.
	function chip(filled: boolean, key: string): string {
		if (list) {
			return `grid w-full grid-cols-[84px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] leading-5 transition-colors hover:bg-surface ${
				filled ? 'text-text' : 'text-text-3'
			} ${pop === key ? 'bg-surface' : ''}`;
		}
		return `inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[13px] leading-none transition-colors hover:border-border-strong ${
			filled ? 'text-text' : 'text-text-3 hover:text-text-2'
		} ${pop === key ? 'ring-2 ring-accent/40' : ''}`;
	}
	// In the list layout the value sits in the row's second column.
	const valueCls = $derived(list ? 'flex min-w-0 items-center gap-1.5 truncate' : 'contents');
	const LABELS: Record<string, () => string> = {
		project: m.tasks_group_project,
		type: m.tasks_panel_type,
		status: m.tasks_panel_status,
		priority: m.tasks_panel_priority,
		assignees: m.tasks_panel_assignees,
		due: m.tasks_panel_due,
		plan: m.tasks_panel_plan,
		estimate: m.tasks_estimate,
		tags: m.tasks_tags
	};
</script>

<div class={list ? 'flex flex-col gap-px' : 'flex flex-wrap gap-2'}>
	{#if showProject}
		<div class="relative">
			<button
				type="button"
				onclick={() => (pop = pop === 'project' ? null : 'project')}
				class={chip(!!projectMeta, 'project')}
			>
				{#if list}<span class="text-text-3">{LABELS.project()}</span>{/if}
				<span class={valueCls}>
					{#if projectMeta}
						<span class="h-2 w-2 rounded-full" style:background={projectMeta.color}></span>
						<span class="font-medium">{projectMeta.name}</span>
					{:else}
						<span>{m.tasks_select_project()}</span>
					{/if}
					<Icon name="chevron" size={12} class="text-text-3" />
				</span>
			</button>
			{#if pop === 'project'}
				<ProjectPopover
					value={project}
					onchange={(v) => (project = v)}
					onclose={() => (pop = null)}
					{projects}
					{memberProjectIds}
					{allAccess}
				/>
			{/if}
		</div>
	{/if}

	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'type' ? null : 'type')}
			class={chip(true, 'type')}
		>
			{#if list}<span class="text-text-3">{LABELS.type()}</span>{/if}
			<span class={valueCls}>
				<TypeBadge {type} showLabel={false} />
				<span>{typeLabel(type)}</span>
			</span>
		</button>
		{#if pop === 'type'}
			<TypePopover value={type} onchange={(v) => (type = v)} onclose={() => (pop = null)} />
		{/if}
	</div>

	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'status' ? null : 'status')}
			class={chip(true, 'status')}
		>
			{#if list}<span class="text-text-3">{LABELS.status()}</span>{/if}
			<span class={valueCls}>
				<StatusDot {status} />
				<span>{statusLabel(status)}</span>
			</span>
		</button>
		{#if pop === 'status'}
			<StatusPopover value={status} onchange={(v) => (status = v)} onclose={() => (pop = null)} />
		{/if}
	</div>

	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'priority' ? null : 'priority')}
			class={chip(true, 'priority')}
		>
			{#if list}<span class="text-text-3">{LABELS.priority()}</span>{/if}
			<span class={valueCls}>
				{#if prioMeta.bars > 0}<PriorityBars {priority} />{/if}
				<span>{priorityLabel(priority)}</span>
			</span>
		</button>
		{#if pop === 'priority'}
			<PriorityPopover
				value={priority}
				onchange={(v) => (priority = v)}
				onclose={() => (pop = null)}
			/>
		{/if}
	</div>

	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'assignees' ? null : 'assignees')}
			class={chip(assignees.length > 0, 'assignees')}
		>
			{#if list}<span class="text-text-3">{LABELS.assignees()}</span>{/if}
			<span class={valueCls}>
				{#if assignees.length === 1 && assigneeUsers[0]}
					<Avatar user={assigneeUsers[0]} size={22} />
					<span>{assigneeUsers[0].name}</span>
				{:else if assignees.length === 0}
					<span>{m.common_unassigned()}</span>
				{:else}
					<AvatarStack users={assigneeUsers} size={22} max={3} overlap={5} />
					<span>{m.tasks_n_assignees({ n: assignees.length })}</span>
				{/if}
			</span>
		</button>
		{#if pop === 'assignees'}
			<AssigneePopover
				internalOnly
				value={assignees}
				onchange={(v) => (assignees = v)}
				onclose={() => (pop = null)}
				{users}
			/>
		{/if}
	</div>

	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'due' ? null : 'due')}
			class={chip(!!due, 'due')}
		>
			{#if list}<span class="text-text-3">{LABELS.due()}</span>{/if}
			<span class={valueCls}>
				<Icon name="calendar" size={13} />
				{#if due}<span class="font-mono">{formatDateLong(due)}</span>{:else}<span
						>{list ? m.tasks_panel_set_due() : m.tasks_due_date()}</span
					>{/if}
			</span>
		</button>
		{#if pop === 'due'}
			<DatePopover value={due} onchange={(v) => (due = v)} onclose={() => (pop = null)} />
		{/if}
	</div>

	{#if showPlanned}
		<div class="relative">
			<button
				type="button"
				onclick={() => (pop = pop === 'plan' ? null : 'plan')}
				class={chip(!!plannedFor, 'plan')}
			>
				{#if list}<span class="text-text-3">{LABELS.plan()}</span>{/if}
				<span class={valueCls}>
					<Icon name="bookmark" size={13} />
					{#if plannedFor}<span class="font-mono">{formatDateLong(plannedFor)}</span>{:else}<span
							>{m.tasks_panel_set_plan()}</span
						>{/if}
				</span>
			</button>
			{#if pop === 'plan'}
				<DatePopover
					value={plannedFor ?? null}
					onchange={(v) => (plannedFor = v)}
					onclose={() => (pop = null)}
				/>
			{/if}
		</div>
	{/if}

	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'estimate' ? null : 'estimate')}
			class={chip(!!estimate, 'estimate')}
		>
			{#if list}<span class="text-text-3">{LABELS.estimate()}</span>{/if}
			<span class={valueCls}>
				{#if estimate}<span class="text-text-3">{m.tasks_est()}</span><span class="font-mono"
						>{formatEstimate(estimate)}</span
					>{:else}<span>{list ? m.tasks_panel_set_estimate() : m.tasks_estimate()}</span>{/if}
			</span>
		</button>
		{#if pop === 'estimate'}
			<EstimatePopover
				value={estimate}
				onchange={(v) => (estimate = v)}
				onclose={() => (pop = null)}
			/>
		{/if}
	</div>

	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'tags' ? null : 'tags')}
			class={chip(tags.length > 0, 'tags')}
		>
			{#if list}<span class="text-text-3">{LABELS.tags()}</span>{/if}
			<span class={valueCls}>
				{#if tags.length > 0}
					{#each tags.slice(0, 2) as t (t)}
						{@const l = labelMeta(t)}
						<span class="inline-flex items-center gap-1">
							<span class="h-1.5 w-1.5 rounded-full" style:background={l.color}></span>
							{l.label}
						</span>
					{/each}
					{#if tags.length > 2}<span class="text-text-3">+{tags.length - 2}</span>{/if}
				{:else if list}{m.tasks_add_tags()}{:else}<Icon name="bookmark" size={13} />
					{m.tasks_tags()}{/if}
			</span>
		</button>
		{#if pop === 'tags'}
			<TagsPopover
				value={tags}
				suggestions={tagSuggestions}
				kind="task"
				onchange={(v) => (tags = v)}
				onclose={() => (pop = null)}
			/>
		{/if}
	</div>
</div>
