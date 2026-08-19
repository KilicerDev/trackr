<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/stores/toast.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import Kbd from '../Kbd.svelte';
	import ProjectPopover from '../popovers/ProjectPopover.svelte';
	import TaskPropertyRail from './TaskPropertyRail.svelte';
	import RichTextInput from '../RichTextInput.svelte';
	import { page } from '$app/state';
	import type { PriorityId, ProjectId, StatusId, TypeId } from '$lib/types';
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

	let projectMeta = $derived(project ? projectList.find((p) => p.key === project) : undefined);
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
							projects={projectList}
							{memberProjectIds}
							{allAccess}
						/>
					{/if}
				</div>
				<div class="ml-1 text-[12px] tracking-[0.08em] text-text-4 uppercase">
					{m.tasks_new_task()}
				</div>
				<button
					type="button"
					onclick={onclose}
					class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
					aria-label={m.common_close()}
				>
					<Icon name="x" size={15} />
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
					class="mb-2 w-full border-0 bg-transparent text-[22px] font-semibold tracking-[-0.01em] text-text outline-none placeholder:text-text-3"
				/>
				<RichTextInput
					bind:value={description}
					placeholder={m.tasks_description_placeholder()}
					flavor="document"
					mentions={false}
					rows={3}
					maxRows={10}
					class="w-full border-0 bg-transparent text-[14px] leading-relaxed text-text-2"
				/>

				<!-- Property rail (shared with the bulk-create stepper). Project is
				     picked in the modal header, so its chip is hidden here. -->
				<div class="mt-4">
					<TaskPropertyRail
						bind:project
						bind:type
						bind:status
						bind:priority
						bind:assignees
						bind:due
						bind:estimate
						bind:tags
						projects={projectList}
						users={userList}
						{memberProjectIds}
						{allAccess}
						showProject={false}
					/>
				</div>

				<!-- Hidden inputs carry state into the form submit -->
				{#if sourceTicketId}
					<input type="hidden" name="sourceTicketId" value={sourceTicketId} />
				{/if}
				<input type="hidden" name="description" value={description} />
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
						class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[14px] text-text-3 transition-colors hover:border-border-strong hover:text-text"
					>
						<Icon name="paperclip" size={14} />
						<span>{m.tasks_attach_files()}</span>
					</button>
					<input bind:this={fileInput} type="file" multiple hidden onchange={onPick} />
				</div>
			</div>

			<!-- Foot -->
			<div class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3">
				<span class="text-[12px] text-text-3">
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
