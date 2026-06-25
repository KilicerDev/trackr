<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/stores/toast.svelte';
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
	import TypePopover from '../popovers/TypePopover.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import AssigneePopover from '../popovers/AssigneePopover.svelte';
	import DatePopover from '../popovers/DatePopover.svelte';
	import EstimatePopover from '../popovers/EstimatePopover.svelte';
	import ProjectPopover from '../popovers/ProjectPopover.svelte';
	import TagsPopover from '../popovers/TagsPopover.svelte';
	import { TRACKR_PRIORITIES } from '$lib/config/taxonomy';
	import { formatDateLong, formatEstimate } from '$lib/utils/format';
	import { page } from '$app/state';
	import type { PriorityId, ProjectId, StatusId, TypeId } from '$lib/types';
	import { statusLabel, priorityLabel, typeLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';
	import AttachmentDropzone from '../attachments/AttachmentDropzone.svelte';
	import StagedFileList from '../attachments/StagedFileList.svelte';
	import { selectStageable } from '$lib/config/attachments';

	interface Prefill {
		project?: string;
		type?: TypeId;
		status?: StatusId;
		priority?: PriorityId;
		assignees?: string[];
		due?: string | null;
		estimate?: number;
		title?: string;
		description?: string | null;
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
	type PickableProject = {
		id: string;
		key: string;
		name: string;
		color: string;
		icon: string;
		status: string;
	};

	interface Props {
		open: boolean;
		prefill?: Prefill;
		onclose: () => void;
		users?: AssignableUser[];
		projects?: PickableProject[];
		currentUserId?: string;
		// Project ids the current user is a member of + whether they can see every
		// project (Trackr team). Forwarded to the project picker so it can default
		// to "my projects" with a "show all" toggle for all-access users.
		memberProjectIds?: string[];
		allAccess?: boolean;
		oncreated?: (displayId: string) => void;
		onerror?: (msg: string) => void;
		// Form action override. Defaults to the global tasks create action; the
		// ticket → task flow points it at the ticket's own `createTask` action.
		action?: string;
		// When set, the new task is linked back to this ticket (carried as a
		// hidden field) and the action above handles the link + ticket sync.
		sourceTicketId?: string;
	}

	let {
		open,
		prefill,
		onclose,
		users: providedUsers,
		projects: providedProjects,
		currentUserId,
		memberProjectIds = [],
		allAccess = false,
		oncreated,
		onerror,
		action = '/tasks?/create',
		sourceTicketId
	}: Props = $props();

	// Prefer explicitly provided lists; otherwise read the app-wide layout data
	// so the modal works from any context without threading props.
	const userList = $derived<AssignableUser[]>(
		providedUsers ?? (page.data as { users?: AssignableUser[] }).users ?? []
	);
	const projectList = $derived<PickableProject[]>(
		providedProjects ?? (page.data as { projects?: PickableProject[] }).projects ?? []
	);
	const meId = $derived(currentUserId ?? '');

	let title = $state('');
	let description = $state('');
	let project = $state<ProjectId | ''>('');
	let type = $state<TypeId>('task');
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
	let fileInput = $state<HTMLInputElement>();
	let stagedFiles = $state<File[]>([]);

	function addFiles(incoming: File[]) {
		const { accepted, errors } = selectStageable(incoming, stagedFiles.length);
		for (const err of errors) showToast('err', err);
		if (accepted.length) stagedFiles = [...stagedFiles, ...accepted];
	}

	function onPick(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		if (target.files?.length) addFiles(Array.from(target.files));
		target.value = '';
	}

	$effect(() => {
		if (open) {
			title = prefill?.title ?? '';
			description = prefill?.description ?? '';
			// No default project: leave the picker empty so the user has to make a
			// deliberate choice — creation is blocked until they do (see submit).
			project = (prefill?.project as ProjectId | undefined) ?? '';
			type = prefill?.type ?? 'task';
			status = prefill?.status ?? 'todo';
			priority = prefill?.priority ?? 'medium';
			assignees = prefill?.assignees ?? [meId];
			due = prefill?.due ?? null;
			estimate = prefill?.estimate;
			tags = [];
			plannedFor = prefill?.plannedFor ?? null;
			pop = null;
			submitting = false;
			stagedFiles = [];
		}
	});

	let prioMeta = $derived(TRACKR_PRIORITIES.find((p) => p.id === priority)!);
	let projectMeta = $derived(project ? projectList.find((p) => p.key === project) : undefined);
	let assigneeUsers = $derived(assignees.map((id) => userList.find((u) => u.id === id)));
	// Creation requires a title and an explicit project choice — no project is
	// defaulted, so the user must pick one.
	let canSubmit = $derived(!submitting && !!title.trim() && !!project);

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			if (canSubmit) formEl?.requestSubmit();
		}
	}
</script>

<svelte:window onkeydown={open ? handleKey : undefined} />

<Modal {open} {onclose} maxWidth={640}>
	<form
		bind:this={formEl}
		method="POST"
		{action}
		enctype="multipart/form-data"
		use:enhance={({ formData, cancel }) => {
			// Belt-and-suspenders: never submit without a project even if some
			// path bypasses the disabled button.
			if (!project) {
				cancel();
				return;
			}
			// Staged files ride along with the form; the create action attaches
			// them to the new task after it exists.
			for (const file of stagedFiles) formData.append('attachments', file);
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
						(result.data as { message?: string } | undefined)?.message ??
						m.tasks_failed_to_create();
					showToast('err', msg);
					onerror?.(msg);
				} else if (result.type === 'error') {
					const msg = result.error?.message ?? m.tasks_failed_to_create();
					showToast('err', msg);
					onerror?.(msg);
				}
			};
		}}
		aria-label={m.tasks_create_task()}
		class="relative"
	>
		<AttachmentDropzone
			onfiles={addFiles}
			disabled={submitting}
			label={m.tasks_drop_files_to_attach()}
		>
			<!-- Head -->
			<div class="flex items-center gap-2 border-b border-border px-5 pt-4 pb-3">
				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'project' ? null : 'project')}
						class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors {projectMeta
							? 'border border-border bg-surface hover:border-border-strong'
							: 'border border-dashed border-border text-text-3 hover:border-border-strong hover:text-text'}"
					>
						{#if projectMeta}
							<span class="h-2 w-2 rounded-full" style:background={projectMeta.color}></span>
							<span class="font-medium text-text">{projectMeta.name}</span>
						{:else}
							<span>{m.tasks_select_project()}</span>
						{/if}
						<Icon name="chevron" size={11} class="text-text-3" />
					</button>
					{#if pop === 'project'}
						<ProjectPopover
							value={project}
							onchange={(v) => (project = v)}
							onclose={() => (pop = null)}
							projects={projectList}
							{memberProjectIds}
							{allAccess}
						/>
					{/if}
				</div>
				<div class="ml-1 text-[11px] tracking-[0.08em] text-text-4 uppercase">
					{m.tasks_new_task()}
				</div>
				<button
					type="button"
					onclick={onclose}
					class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
					aria-label={m.common_close()}
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
					placeholder={m.tasks_title_placeholder()}
					class="mb-2 w-full border-0 bg-transparent text-[20px] font-semibold tracking-[-0.01em] text-text outline-none placeholder:text-text-3"
				/>
				<textarea
					name="description"
					bind:value={description}
					placeholder={m.tasks_description_placeholder()}
					rows="3"
					class="w-full resize-none border-0 bg-transparent text-[13px] leading-relaxed text-text-2 outline-none placeholder:text-text-3"
				></textarea>

				<!-- Property rail -->
				<div class="mt-4 flex flex-wrap gap-2">
					<div class="relative">
						<button
							type="button"
							onclick={() => (pop = pop === 'type' ? null : 'type')}
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] transition-colors hover:border-border-strong"
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
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] transition-colors hover:border-border-strong"
						>
							<StatusDot {status} />
							<span>{statusLabel(status)}</span>
						</button>
						{#if pop === 'status'}
							<StatusPopover
								value={status}
								onchange={(v) => (status = v)}
								onclose={() => (pop = null)}
							/>
						{/if}
					</div>

					<div class="relative">
						<button
							type="button"
							onclick={() => (pop = pop === 'priority' ? null : 'priority')}
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] transition-colors hover:border-border-strong"
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
							class="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] transition-colors hover:border-border-strong"
						>
							{#if assignees.length === 1 && assigneeUsers[0]}
								<Avatar user={assigneeUsers[0]} size={18} />
								<span>{assigneeUsers[0].name}</span>
							{:else if assignees.length === 0}
								<span class="text-text-3">{m.common_unassigned()}</span>
							{:else}
								<AvatarStack users={assigneeUsers} size={18} max={3} overlap={5} />
								<span>{m.tasks_n_assignees({ n: assignees.length })}</span>
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
							class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors {due
								? 'border border-border bg-surface hover:border-border-strong'
								: 'border border-dashed border-border text-text-3 hover:border-border-strong hover:text-text'}"
						>
							<Icon name="calendar" size={13} />
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
							class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors {estimate
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
							class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors {tags.length >
							0
								? 'border border-border bg-surface hover:border-border-strong'
								: 'border border-dashed border-border text-text-3 hover:border-border-strong hover:text-text'}"
						>
							{#if tags.length > 0}
								{#each tags.slice(0, 2) as t (t)}<LabelChip id={t} />{/each}
								{#if tags.length > 2}<span class="text-text-3">+{tags.length - 2}</span>{/if}
							{:else}
								<Icon name="bookmark" size={12} /> {m.tasks_tags()}
							{/if}
						</button>
						{#if pop === 'tags'}
							<TagsPopover value={tags} onchange={(v) => (tags = v)} onclose={() => (pop = null)} />
						{/if}
					</div>
				</div>

				<!-- Hidden inputs carry state into the form submit -->
				{#if sourceTicketId}
					<input type="hidden" name="sourceTicketId" value={sourceTicketId} />
				{/if}
				<input type="hidden" name="project" value={project} />
				<input type="hidden" name="type" value={type} />
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

				<!-- Attachments -->
				<div class="mt-4 space-y-2">
					{#if stagedFiles.length}
						<StagedFileList
							files={stagedFiles}
							disabled={submitting}
							onremove={(i) => (stagedFiles = stagedFiles.filter((_, idx) => idx !== i))}
						/>
					{/if}
					<button
						type="button"
						onclick={() => fileInput?.click()}
						class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[13px] text-text-3 transition-colors hover:border-border-strong hover:text-text"
					>
						<Icon name="paperclip" size={13} />
						<span>{m.tasks_attach_files()}</span>
					</button>
					<input bind:this={fileInput} type="file" multiple hidden onchange={onPick} />
				</div>
			</div>

			<!-- Foot -->
			<div class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3">
				<span class="text-[11px] text-text-3">
					<Kbd>⌘↵</Kbd>
					{m.tasks_to_create()}
				</span>
				<div class="ml-auto flex items-center gap-2">
					<Button variant="default" onclick={onclose}>{m.common_cancel()}</Button>
					<Button type="submit" variant="primary" disabled={!canSubmit}>
						{submitting ? m.common_creating() : m.tasks_create_task()}
					</Button>
				</div>
			</div>
		</AttachmentDropzone>
	</form>
</Modal>
