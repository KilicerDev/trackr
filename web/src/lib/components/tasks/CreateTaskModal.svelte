<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/stores/toast.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import Kbd from '../Kbd.svelte';
	import TaskPropertyRail from './TaskPropertyRail.svelte';
	import { QUIET_ADD } from './panel/styles';
	import RichTextInput from '../RichTextInput.svelte';
	import { page } from '$app/state';
	import type { PriorityId, ProjectId, StatusId, TypeId } from '$lib/types';
	import { m } from '$lib/paraglide/messages';
	import AttachmentDropzone from '../attachments/AttachmentDropzone.svelte';
	import StagedFileList from '../attachments/StagedFileList.svelte';
	import { formatBytes, selectStageable, type AttachmentDTO } from '$lib/config/attachments';

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
		// When set, the new task is linked to the note it was created from (a
		// meeting's action item), so the task lists that meeting.
		sourceNoteId?: string;
		/**
		 * Existing files offered to the new task (a ticket's own files and those
		 * posted in its conversation). Shown as a list the user can trim; the
		 * kept ids are sent as `carryAttachmentIds`.
		 */
		carryAttachments?: AttachmentDTO[];
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
		sourceTicketId,
		sourceNoteId,
		carryAttachments
	}: Props = $props();

	// The offered files the user still keeps (reset each time the modal opens).
	let carried = $state<AttachmentDTO[]>([]);

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
			submitting = false;
			stagedFiles = [];
			carried = [...(carryAttachments ?? [])];
		}
	});

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
			<!-- Head: just the title and close; the project is the first chip
			     in the property rail, like every other property. -->
			<div class="flex items-center gap-2 border-b border-border px-5 py-3">
				<h2 class="text-[14px] font-medium text-text-2">{m.tasks_new_task()}</h2>
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

				<!-- Property rail (shared with the bulk-create stepper), project
				     first. -->
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
					/>
				</div>

				<!-- Hidden inputs carry state into the form submit -->
				{#if sourceTicketId}
					<input type="hidden" name="sourceTicketId" value={sourceTicketId} />
				{/if}
				{#if sourceNoteId}
					<input type="hidden" name="sourceNoteId" value={sourceNoteId} />
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
					{#if carryAttachments}
						<!-- The ticket's files: kept ones are copied to the task (the
						     stored file is shared, not duplicated). -->
						<input type="hidden" name="carrySelection" value="1" />
						{#each carried as a (a.id)}
							<input type="hidden" name="carryAttachmentIds" value={a.id} />
						{/each}
						{#if carryAttachments.length}
							<div class="text-[12px] font-medium text-text-3">
								{m.tasks_from_ticket_files({
									kept: carried.length,
									total: carryAttachments.length
								})}
							</div>
							{#if carried.length}
								<ul class="flex flex-col gap-1.5">
									{#each carried as a (a.id)}
										<li
											class="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2 py-1.5"
										>
											{#if a.hasThumbnail}
												<img
													src="/api/attachments/{a.id}?thumb"
													alt=""
													class="h-8 w-8 shrink-0 rounded-md border border-border object-cover"
												/>
											{:else}
												<span
													class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-2 text-text-3"
												>
													<Icon name="file" size={16} />
												</span>
											{/if}
											<div class="min-w-0 flex-1">
												<div class="truncate text-[14px] text-text">{a.filename}</div>
												<div class="text-[12px] text-text-3">{formatBytes(a.sizeBytes)}</div>
											</div>
											<button
												type="button"
												disabled={submitting}
												onclick={() => (carried = carried.filter((x) => x.id !== a.id))}
												aria-label={m.tasks_remove_carried_file({ name: a.filename })}
												title={m.tasks_remove_carried_file({ name: a.filename })}
												class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-3 transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50"
											>
												<Icon name="x" size={14} />
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						{/if}
					{/if}
					{#if stagedFiles.length}
						<StagedFileList
							files={stagedFiles}
							disabled={submitting}
							onremove={(i) => (stagedFiles = stagedFiles.filter((_, idx) => idx !== i))}
						/>
					{/if}
					<input bind:this={fileInput} type="file" multiple hidden onchange={onPick} />
				</div>
			</div>

			<!-- Foot -->
			<!-- Foot: attach on the left (files can also be dropped anywhere on
			     the dialog); the shortcut hint and two equal-height buttons on the
			     right. -->
			<div class="flex items-center gap-2 rounded-b-2xl border-t border-border px-5 py-3">
				<button type="button" onclick={() => fileInput?.click()} class="{QUIET_ADD} -ml-2">
					<Icon name="paperclip" size={14} />
					{m.tasks_attach_files()}
				</button>
				<div class="ml-auto flex items-center gap-3">
					<span class="hidden items-center gap-1.5 text-[12px] text-text-4 sm:inline-flex">
						<Kbd>⌘↵</Kbd>
						{m.tasks_to_create()}
					</span>
					<Button variant="default" class="h-9" onclick={onclose}>{m.common_cancel()}</Button>
					<Button type="submit" variant="primary" class="h-9" disabled={!canSubmit}>
						{submitting ? m.common_creating() : m.tasks_create_task()}
					</Button>
				</div>
			</div>
		</AttachmentDropzone>
	</form>
</Modal>
