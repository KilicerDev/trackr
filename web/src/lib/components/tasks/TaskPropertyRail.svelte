<script lang="ts">
	// Shared task property rail: project, type, status, priority, assignees, due,
	// estimate, tags. The single source of the popover-backed field chips, used
	// by CreateTaskModal and the bulk "create tasks from to-dos" stepper so the
	// picker wiring isn't duplicated.
	import Icon from '../Icon.svelte';
	import Avatar from '../Avatar.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import LabelChip from '../LabelChip.svelte';
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
		// elsewhere (CreateTaskModal has it in the header).
		showProject?: boolean;
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
		showProject = true
	}: Props = $props();

	// Which popover (if any) is open. Local to this rail instance.
	let pop = $state<string | null>(null);

	// Every tag in use across tasks: the app-wide list from the layout load
	// (complete, works from any page) unioned with tags on currently loaded
	// tasks (fresher — covers tags added since the layout data last loaded).
	const tagSuggestions = $derived.by(() => {
		const d = page.data as { taskTags?: string[]; tasks?: { labels?: string[] }[] };
		const fromTasks = (d.tasks ?? []).flatMap((t) => t.labels ?? []);
		return [...new Set([...(d.taskTags ?? []), ...fromTasks])];
	});

	const prioMeta = $derived(TRACKR_PRIORITIES.find((p) => p.id === priority)!);
	const projectMeta = $derived(project ? projects.find((p) => p.key === project) : undefined);
	const assigneeUsers = $derived(assignees.map((id) => users.find((u) => u.id === id)));
</script>

<div class="flex flex-wrap gap-2">
	{#if showProject}
		<div class="relative">
			<button
				type="button"
				onclick={() => (pop = pop === 'project' ? null : 'project')}
				class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] transition-colors {projectMeta
					? 'border border-border bg-surface hover:border-border-strong'
					: 'border border-dashed border-border text-text-3 hover:border-border-strong hover:text-text'}"
			>
				{#if projectMeta}
					<span class="h-2 w-2 rounded-full" style:background={projectMeta.color}></span>
					<span class="font-medium text-text">{projectMeta.name}</span>
				{:else}
					<span>{m.tasks_select_project()}</span>
				{/if}
				<Icon name="chevron" size={12} class="text-text-3" />
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
			class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong"
		>
			<TypeBadge {type} showLabel={false} />
			<span>{typeLabel(type)}</span>
		</button>
		{#if pop === 'type'}
			<TypePopover value={type} onchange={(v) => (type = v)} onclose={() => (pop = null)} />
		{/if}
	</div>

	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'status' ? null : 'status')}
			class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong"
		>
			<StatusDot {status} />
			<span>{statusLabel(status)}</span>
		</button>
		{#if pop === 'status'}
			<StatusPopover value={status} onchange={(v) => (status = v)} onclose={() => (pop = null)} />
		{/if}
	</div>

	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'priority' ? null : 'priority')}
			class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong"
		>
			{#if prioMeta.bars > 0}<PriorityBars {priority} />{/if}
			<span>{priorityLabel(priority)}</span>
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
			class="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong"
		>
			{#if assignees.length === 1 && assigneeUsers[0]}
				<Avatar user={assigneeUsers[0]} size={20} />
				<span>{assigneeUsers[0].name}</span>
			{:else if assignees.length === 0}
				<span class="text-text-3">{m.common_unassigned()}</span>
			{:else}
				<AvatarStack users={assigneeUsers} size={20} max={3} overlap={5} />
				<span>{m.tasks_n_assignees({ n: assignees.length })}</span>
			{/if}
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
			class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] transition-colors {due
				? 'border border-border bg-surface hover:border-border-strong'
				: 'border border-dashed border-border text-text-3 hover:border-border-strong hover:text-text'}"
		>
			<Icon name="calendar" size={14} />
			{#if due}<span class="font-mono">{formatDateLong(due)}</span>{:else}<span
					>{m.tasks_due_date()}</span
				>{/if}
		</button>
		{#if pop === 'due'}
			<DatePopover value={due} onchange={(v) => (due = v)} onclose={() => (pop = null)} />
		{/if}
	</div>

	<div class="relative">
		<button
			type="button"
			onclick={() => (pop = pop === 'estimate' ? null : 'estimate')}
			class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] transition-colors {estimate
				? 'border border-border bg-surface hover:border-border-strong'
				: 'border border-dashed border-border text-text-3 hover:border-border-strong hover:text-text'}"
		>
			{#if estimate}<span class="text-text-3">{m.tasks_est()}</span><span class="font-mono"
					>{formatEstimate(estimate)}</span
				>{:else}<span>{m.tasks_estimate()}</span>{/if}
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
			class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] transition-colors {tags.length >
			0
				? 'border border-border bg-surface hover:border-border-strong'
				: 'border border-dashed border-border text-text-3 hover:border-border-strong hover:text-text'}"
		>
			{#if tags.length > 0}
				{#each tags.slice(0, 2) as t (t)}<LabelChip id={t} />{/each}
				{#if tags.length > 2}<span class="text-text-3">+{tags.length - 2}</span>{/if}
			{:else}
				<Icon name="bookmark" size={13} /> {m.tasks_tags()}
			{/if}
		</button>
		{#if pop === 'tags'}
			<TagsPopover
				value={tags}
				suggestions={tagSuggestions}
				onchange={(v) => (tags = v)}
				onclose={() => (pop = null)}
			/>
		{/if}
	</div>
</div>
