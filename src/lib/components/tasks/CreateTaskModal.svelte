<script lang="ts">
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
		formatDateLong,
		formatEstimate,
		userById
	} from '$lib/data';
	import type { PriorityId, ProjectId, StatusId } from '$lib/types';

	interface Prefill {
		project?: ProjectId;
		status?: StatusId;
		priority?: PriorityId;
		assignees?: string[];
		due?: string | null;
		estimate?: number;
		title?: string;
	}

	interface Props {
		open: boolean;
		prefill?: Prefill;
		onclose: () => void;
		oncreate?: (draft: {
			title: string;
			description: string;
			project: ProjectId;
			status: StatusId;
			priority: PriorityId;
			assignees: string[];
			due: string | null;
			estimate: number | undefined;
			tags: string[];
			files: { name: string; size: string }[];
		}) => void;
	}

	let { open, prefill, onclose, oncreate }: Props = $props();

	let title = $state('');
	let description = $state('');
	let project = $state<ProjectId>('TRACKR');
	let status = $state<StatusId>('todo');
	let priority = $state<PriorityId>('medium');
	let assignees = $state<string[]>(['u6']);
	let due = $state<string | null>(null);
	let estimate = $state<number | undefined>(undefined);
	let tags = $state<string[]>([]);
	let files = $state<{ name: string; size: string }[]>([]);

	let pop = $state<string | null>(null);
	let dragDepth = $state(0);

	// Reset when modal opens with new prefill
	$effect(() => {
		if (open) {
			title = prefill?.title ?? '';
			description = '';
			project = prefill?.project ?? 'TRACKR';
			status = prefill?.status ?? 'todo';
			priority = prefill?.priority ?? 'medium';
			assignees = prefill?.assignees ?? ['u6'];
			due = prefill?.due ?? null;
			estimate = prefill?.estimate;
			tags = [];
			files = [];
			pop = null;
			dragDepth = 0;
		}
	});

	let statusMeta = $derived(TRACKR_STATUSES.find((s) => s.id === status)!);
	let prioMeta = $derived(TRACKR_PRIORITIES.find((p) => p.id === priority)!);
	let projectMeta = $derived(TRACKR_PROJECTS[project]);
	let assigneeUsers = $derived(assignees.map((id) => userById(id)));

	function submit() {
		if (!title.trim()) return;
		oncreate?.({
			title: title.trim(),
			description,
			project,
			status,
			priority,
			assignees,
			due,
			estimate,
			tags,
			files
		});
		onclose();
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			submit();
		}
	}

	function addFiles(list: FileList | null) {
		if (!list) return;
		const incoming = Array.from(list).map((f) => ({
			name: f.name,
			size: f.size > 1_000_000 ? `${(f.size / 1_000_000).toFixed(1)} MB` : `${Math.round(f.size / 1000)} KB`
		}));
		files = [...files, ...incoming];
	}

	function onDragEnter(e: DragEvent) {
		e.preventDefault();
		dragDepth++;
	}
	function onDragLeave(e: DragEvent) {
		e.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
	}
	function onDragOver(e: DragEvent) {
		e.preventDefault();
	}
	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragDepth = 0;
		addFiles(e.dataTransfer?.files ?? null);
	}

	let fileInputEl = $state<HTMLInputElement>();
</script>

<svelte:window onkeydown={open ? handleKey : undefined} />

<Modal {open} {onclose} maxWidth={640}>
	<div
		role="form"
		aria-label="Create task"
		ondragenter={onDragEnter}
		ondragleave={onDragLeave}
		ondragover={onDragOver}
		ondrop={onDrop}
		class="relative"
	>
		{#if dragDepth > 0}
			<div class="absolute inset-2 z-30 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-accent/10 backdrop-blur-sm text-accent text-[13.5px] font-medium pointer-events-none">
				<div class="flex items-center gap-2">
					<Icon name="paperclip" size={16} /> Drop files to attach
				</div>
			</div>
		{/if}

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
					<ProjectPopover value={project} onchange={(v) => (project = v)} onclose={() => (pop = null)} />
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
				bind:value={title}
				placeholder="Task title…"
				class="w-full bg-transparent border-0 outline-none text-[19px] font-semibold tracking-[-0.01em] text-text placeholder:text-text-3 mb-2"
			/>
			<textarea
				bind:value={description}
				placeholder="Add a description…"
				rows="3"
				class="w-full resize-none bg-transparent border-0 outline-none text-[13.5px] leading-relaxed text-text-2 placeholder:text-text-3"
			></textarea>

			{#if files.length > 0}
				<div class="space-y-1.5 mt-3 mb-3">
					{#each files as f, i (i)}
						<div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border text-[12.5px]">
							<Icon name="paperclip" size={13} class="text-text-3" />
							<span class="truncate">{f.name}</span>
							<span class="ml-auto font-mono text-[11px] text-text-3">{f.size}</span>
							<button
								type="button"
								onclick={() => (files = files.filter((_, j) => j !== i))}
								class="text-text-3 hover:text-text"
								aria-label="Remove file"
							>
								<Icon name="x" size={11} />
							</button>
						</div>
					{/each}
				</div>
			{/if}

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
						{#if assignees.length === 1}
							<Avatar user={assigneeUsers[0]} size={18} />
							<span>{assigneeUsers[0]?.name}</span>
						{:else if assignees.length === 0}
							<span class="text-text-3">Unassigned</span>
						{:else}
							<AvatarStack users={assigneeUsers} size={18} max={3} overlap={5} />
							<span>{assignees.length} assignees</span>
						{/if}
					</button>
					{#if pop === 'assignees'}
						<AssigneePopover value={assignees} onchange={(v) => (assignees = v)} onclose={() => (pop = null)} />
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
		</div>

		<!-- Foot -->
		<div class="flex items-center gap-2 px-5 py-3 border-t border-border bg-bg/40 rounded-b-2xl">
			<input
				bind:this={fileInputEl}
				type="file"
				multiple
				class="hidden"
				onchange={(e) => addFiles((e.target as HTMLInputElement).files)}
			/>
			<IconButton size={32} ariaLabel="Attach" onclick={() => fileInputEl?.click()}>
				<Icon name="paperclip" size={14} />
			</IconButton>
			<span class="text-[11.5px] text-text-3">
				<Kbd>⌘↵</Kbd> to create
			</span>
			<div class="ml-auto flex items-center gap-2">
				<Button size="sm" variant="default" onclick={onclose}>Cancel</Button>
				<Button size="sm" variant="primary" disabled={!title.trim()} onclick={submit}>
					Create task
				</Button>
			</div>
		</div>
	</div>
</Modal>
