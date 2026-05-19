<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/toast.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import Button from '../Button.svelte';
	import Kbd from '../Kbd.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import LabelChip from '../LabelChip.svelte';
	import StatusPopover from '../popovers/StatusPopover.svelte';
	import PriorityPopover from '../popovers/PriorityPopover.svelte';
	import AssigneePopover from '../popovers/AssigneePopover.svelte';
	import DatePopover from '../popovers/DatePopover.svelte';
	import EstimatePopover from '../popovers/EstimatePopover.svelte';
	import ProjectPopover from '../popovers/ProjectPopover.svelte';
	import TagsPopover from '../popovers/TagsPopover.svelte';
	import {
		TRACKR_PRIORITIES,
		TRACKR_PROJECTS,
		TRACKR_STATUSES,
		TRACKR_USERS,
		formatDateLong,
		formatEstimate
	} from '$lib/data';
	import type { PriorityId, ProjectId, StatusId } from '$lib/types';

	interface Prefill {
		project?: string;
		status?: StatusId;
		priority?: PriorityId;
		assignees?: string[];
		due?: string | null;
		estimate?: number;
		title?: string;
		plannedFor?: string | null;
	}

	type AssignableUser = {
		id: string;
		name: string;
		email: string;
		initials: string;
		color: string;
		status: 'active' | 'invited' | 'disabled';
	};
	type PickableProject = { key: string; name: string; color: string; icon: string };

	interface Props {
		open: boolean;
		prefill?: Prefill;
		onclose: () => void;
		users?: AssignableUser[];
		projects?: PickableProject[];
		currentUserId?: string;
		oncreated?: (displayId: string) => void;
		onerror?: (msg: string) => void;
	}

	let {
		open,
		prefill,
		onclose,
		users: providedUsers,
		projects: providedProjects,
		currentUserId,
		oncreated,
		onerror
	}: Props = $props();

	// Fall back to mock data if real lists weren't provided — keeps the
	// modal usable from contexts that haven't been wired to DB yet.
	const userList = $derived<AssignableUser[]>(providedUsers ?? TRACKR_USERS);
	const projectList = $derived<PickableProject[]>(
		providedProjects ??
			(Object.keys(TRACKR_PROJECTS) as ProjectId[]).map((id) => ({
				key: id,
				name: TRACKR_PROJECTS[id].name,
				color: TRACKR_PROJECTS[id].color,
				icon: TRACKR_PROJECTS[id].icon
			}))
	);
	const meId = $derived(currentUserId ?? 'u6');

	let title = $state('');
	let description = $state('');
	let project = $state<ProjectId>('TRACKR');
	let status = $state<StatusId>('todo');
	let priority = $state<PriorityId>('medium');
	let assignees = $state<string[]>([]);
	let due = $state<string | null>(null);
	let estimate = $state<number | undefined>(undefined);
	let tags = $state<string[]>([]);
	let plannedFor = $state<string | null>(null);

	let pop = $state<string | null>(null);
	let submitting = $state(false);
	let formEl = $state<HTMLFormElement>();

	$effect(() => {
		if (open) {
			title = prefill?.title ?? '';
			description = '';
			const defaultProject = (projectList[0]?.key as ProjectId) ?? 'TRACKR';
			project = (prefill?.project as ProjectId | undefined) ?? defaultProject;
			status = prefill?.status ?? 'todo';
			priority = prefill?.priority ?? 'medium';
			assignees = prefill?.assignees ?? [meId];
			due = prefill?.due ?? null;
			estimate = prefill?.estimate;
			tags = [];
			plannedFor = prefill?.plannedFor ?? null;
			pop = null;
			submitting = false;
		}
	});

	let statusMeta = $derived(TRACKR_STATUSES.find((s) => s.id === status)!);
	let prioMeta = $derived(TRACKR_PRIORITIES.find((p) => p.id === priority)!);
	let projectMeta = $derived(
		projectList.find((p) => p.key === project) ?? projectList[0] ?? { key: '', name: '—', color: '#7c7c84', icon: '?' }
	);
	let assigneeUsers = $derived(assignees.map((id) => userList.find((u) => u.id === id)));

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			formEl?.requestSubmit();
		}
	}
</script>

<svelte:window onkeydown={open ? handleKey : undefined} />

<Modal {open} {onclose} maxWidth={640}>
	<form
		bind:this={formEl}
		method="POST"
		action="/tasks?/create"
		use:enhance={() => {
			submitting = true;
			return async ({ result }: { result: ActionResult }) => {
				submitting = false;
				if (result.type === 'success') {
					const data = result.data as { displayId?: string } | undefined;
					oncreated?.(data?.displayId ?? '');
					await invalidateAll();
					onclose();
				} else if (result.type === 'failure') {
					const msg =
						(result.data as { message?: string } | undefined)?.message ?? 'Failed to create task.';
					showToast('err', msg);
					onerror?.(msg);
				} else if (result.type === 'error') {
					const msg = result.error?.message ?? 'Failed to create task.';
					showToast('err', msg);
					onerror?.(msg);
				}
			};
		}}
		aria-label="Create task"
		class="relative"
	>
		<!-- Head -->
		<div class="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-border">
			<div class="relative">
				<button
					type="button"
					onclick={() => (pop = pop === 'project' ? null : 'project')}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-border-strong text-[12.5px] transition-colors"
				>
					<span class="w-2 h-2 rounded-full" style:background={projectMeta.color}></span>
					<span class="text-text font-medium">{projectMeta.name}</span>
					<Icon name="chevron" size={11} class="text-text-3" />
				</button>
				{#if pop === 'project'}
					<ProjectPopover
						value={project}
						onchange={(v) => (project = v)}
						onclose={() => (pop = null)}
						projects={projectList}
					/>
				{/if}
			</div>
			<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4 ml-1">New task</div>
			<button
				type="button"
				onclick={onclose}
				class="ml-auto w-8 h-8 grid place-items-center rounded-lg text-text-3 hover:text-text hover:bg-surface transition-colors"
				aria-label="Close"
			>
				<Icon name="x" size={14} />
			</button>
		</div>

		<!-- Body -->
		<div class="px-5 pt-4 pb-3">
			<input
				type="text"
				name="title"
				bind:value={title}
				required
				placeholder="Task title…"
				class="w-full bg-transparent border-0 outline-none text-[19px] font-semibold tracking-[-0.01em] text-text placeholder:text-text-3 mb-2"
			/>
			<textarea
				name="description"
				bind:value={description}
				placeholder="Add a description…"
				rows="3"
				class="w-full resize-none bg-transparent border-0 outline-none text-[13.5px] leading-relaxed text-text-2 placeholder:text-text-3"
			></textarea>

			<!-- Property rail -->
			<div class="flex flex-wrap gap-2 mt-4">
				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'status' ? null : 'status')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-border-strong text-[12.5px] transition-colors"
					>
						<StatusDot {status} />
						<span>{statusMeta.label}</span>
					</button>
					{#if pop === 'status'}
						<StatusPopover value={status} onchange={(v) => (status = v)} onclose={() => (pop = null)} />
					{/if}
				</div>

				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'priority' ? null : 'priority')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-border-strong text-[12.5px] transition-colors"
					>
						{#if prioMeta.bars > 0}<PriorityBars {priority} />{/if}
						<span>{prioMeta.label}</span>
					</button>
					{#if pop === 'priority'}
						<PriorityPopover value={priority} onchange={(v) => (priority = v)} onclose={() => (pop = null)} />
					{/if}
				</div>

				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'assignees' ? null : 'assignees')}
						class="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-border-strong text-[12.5px] transition-colors"
					>
						{#if assignees.length === 1 && assigneeUsers[0]}
							<Avatar user={assigneeUsers[0]} size={18} />
							<span>{assigneeUsers[0].name}</span>
						{:else if assignees.length === 0}
							<span class="text-text-3">Unassigned</span>
						{:else}
							<AvatarStack users={assigneeUsers} size={18} max={3} overlap={5} />
							<span>{assignees.length} assignees</span>
						{/if}
					</button>
					{#if pop === 'assignees'}
						<AssigneePopover
							value={assignees}
							onchange={(v) => (assignees = v)}
							onclose={() => (pop = null)}
							users={userList}
						/>
					{/if}
				</div>

				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'due' ? null : 'due')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] transition-colors {due ? 'bg-surface border border-border hover:border-border-strong' : 'border border-dashed border-border text-text-3 hover:text-text hover:border-border-strong'}"
					>
						<Icon name="calendar" size={13} />
						{#if due}<span class="font-mono">{formatDateLong(due)}</span>{:else}<span>Due date</span>{/if}
					</button>
					{#if pop === 'due'}
						<DatePopover value={due} onchange={(v) => (due = v)} onclose={() => (pop = null)} />
					{/if}
				</div>

				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'estimate' ? null : 'estimate')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] transition-colors {estimate ? 'bg-surface border border-border hover:border-border-strong' : 'border border-dashed border-border text-text-3 hover:text-text hover:border-border-strong'}"
					>
						{#if estimate}<span class="text-text-3">Est</span><span class="font-mono">{formatEstimate(estimate)}</span>{:else}<span>Estimate</span>{/if}
					</button>
					{#if pop === 'estimate'}
						<EstimatePopover value={estimate} onchange={(v) => (estimate = v)} onclose={() => (pop = null)} />
					{/if}
				</div>

				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'tags' ? null : 'tags')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] transition-colors {tags.length > 0 ? 'bg-surface border border-border hover:border-border-strong' : 'border border-dashed border-border text-text-3 hover:text-text hover:border-border-strong'}"
					>
						{#if tags.length > 0}
							{#each tags.slice(0, 2) as t (t)}<LabelChip id={t} />{/each}
							{#if tags.length > 2}<span class="text-text-3">+{tags.length - 2}</span>{/if}
						{:else}
							<Icon name="bookmark" size={12} /> Tags
						{/if}
					</button>
					{#if pop === 'tags'}
						<TagsPopover value={tags} onchange={(v) => (tags = v)} onclose={() => (pop = null)} />
					{/if}
				</div>
			</div>

			<!-- Hidden inputs carry state into the form submit -->
			<input type="hidden" name="project" value={project} />
			<input type="hidden" name="status" value={status} />
			<input type="hidden" name="priority" value={priority} />
			<input type="hidden" name="due" value={due ?? ''} />
			<input type="hidden" name="estimate" value={estimate ?? ''} />
			<input type="hidden" name="plannedFor" value={plannedFor ?? ''} />
			{#each assignees as a (a)}
				<input type="hidden" name="assignees" value={a} />
			{/each}
			{#each tags as t (t)}
				<input type="hidden" name="tags" value={t} />
			{/each}

		</div>

		<!-- Foot -->
		<div class="flex items-center gap-2 px-5 py-3 border-t border-border bg-bg/40 rounded-b-2xl">
			<span class="text-[11.5px] text-text-3">
				<Kbd>⌘↵</Kbd> to create
			</span>
			<div class="ml-auto flex items-center gap-2">
				<Button size="sm" variant="default" onclick={onclose}>Cancel</Button>
				<button
					type="submit"
					disabled={submitting || !title.trim()}
					class="inline-flex items-center gap-1.5 rounded-lg font-medium text-[13px] transition-[background,border-color,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px] px-[11px] py-[7px] bg-accent text-white border border-transparent hover:bg-accent-strong shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_4px_12px_rgba(239,122,109,0.25)]"
				>
					{submitting ? 'Creating…' : 'Create task'}
				</button>
			</div>
		</div>
	</form>
</Modal>
