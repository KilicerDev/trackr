<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Select from '$lib/components/Select.svelte';
	import ProjectPopover from '$lib/components/popovers/ProjectPopover.svelte';
	import TaskPopover from '$lib/components/popovers/TaskPopover.svelte';
	import DatePopover from '$lib/components/popovers/DatePopover.svelte';
	import { formatDateLong } from '$lib/utils/format';
	import type { ProjectId } from '$lib/types';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';

	type Project = { id: string; key: string; name: string; color: string; status: string };
	type Template = { id: string; name: string; icon: string };
	type Task = { id: string; number: number; title: string; projectId: string };

	let {
		open = $bindable(false),
		projects,
		templates,
		tasks = [],
		// Preset / locked mode: when launched from a task, the project + task are
		// fixed and shown as static chips instead of pickers.
		presetProjectId = '',
		presetTaskId = '',
		presetTaskRef = '',
		presetTaskTitle = '',
		locked = false
	}: {
		open: boolean;
		projects: Project[];
		templates: Template[];
		tasks?: Task[];
		presetProjectId?: string;
		presetTaskId?: string;
		presetTaskRef?: string;
		presetTaskTitle?: string;
		locked?: boolean;
	} = $props();

	let pop = $state<'project' | 'task' | 'date' | null>(null);
	const selectedProject = $derived(projects.find((p) => p.id === projectId) ?? null);
	const memberProjectIds = $derived(
		Object.keys(
			(page.data as { memberRoles?: { projects?: Record<string, string> } }).memberRoles
				?.projects ?? {}
		)
	);
	const allAccess = $derived(!!(page.data as { isTrackrTeam?: boolean }).isTrackrTeam);

	function todayISO(): string {
		// yyyy-mm-dd for the date input, in local time.
		const d = new Date();
		const off = d.getTimezoneOffset();
		return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
	}

	let projectId = $state('');
	let taskId = $state('');
	let templateId = $state('');
	let submitting = $state(false);
	let meetingDate = $state(todayISO());
	// Title defaults to the meeting date (YYYY-MM-DD) and tracks it until the
	// user types their own — then we leave their text alone.
	let title = $state(todayISO());
	let titleDirty = $state(false);

	$effect(() => {
		if (!titleDirty) title = meetingDate;
	});

	// Seed presets on open. In locked mode (launched from a task) the project
	// AND task are fixed; an unlocked preset (launched from a project page) only
	// pre-selects the project and stays editable — the `!projectId` guard keeps
	// a manual switch intact while the dialog is open.
	$effect(() => {
		if (!open) return;
		if (locked) {
			projectId = presetProjectId;
			taskId = presetTaskId;
		} else if (presetProjectId && !projectId) {
			projectId = presetProjectId;
		}
	});

	// Tasks for the chosen project. Clear the selection if it no longer belongs.
	const projectKey = $derived(projects.find((p) => p.id === projectId)?.key ?? '');
	const projectTasks = $derived(projectId ? tasks.filter((t) => t.projectId === projectId) : []);
	$effect(() => {
		// In locked mode the task is preset and the picker list isn't loaded, so
		// don't treat the preset id as "invalid".
		if (!locked && taskId && !projectTasks.some((t) => t.id === taskId)) taskId = '';
	});

	// Tasks of the chosen project, shaped for the task picker.
	const taskRows = $derived(
		projectTasks.map((t) => ({ id: t.id, ref: `${projectKey}-${t.number}`, title: t.title }))
	);
	const selectedTask = $derived(taskRows.find((t) => t.id === taskId) ?? null);

	// Options for the Template Select dropdown.
	const templateOptions = $derived([
		{ value: '', label: m.notes_template_blank() },
		...templates.map((t) => ({ value: t.id, label: t.name }))
	]);

	function close() {
		open = false;
		pop = null;
		projectId = '';
		taskId = '';
		templateId = '';
		meetingDate = todayISO();
		title = todayISO();
		titleDirty = false;
	}
</script>

<Modal {open} onclose={close} maxWidth={484}>
	<div class="flex items-center justify-between border-b border-border/70 px-5 py-4">
		<h2 class="text-[15px] font-semibold text-text">{m.notes_new_meeting()}</h2>
		<button
			type="button"
			onclick={close}
			class="grid h-7 w-7 place-items-center rounded-md text-text-3 hover:bg-surface-2 hover:text-text"
			aria-label={m.common_cancel()}
		>
			<Icon name="x" size={16} />
		</button>
	</div>

	<form
		method="POST"
		action="/notes?/createMeeting"
		use:enhance={() => {
			submitting = true;
			return async ({ result }) => {
				submitting = false;
				if (result.type === 'success' && result.data?.id) {
					close();
					await goto(`/notes/${result.data.id}`, { invalidateAll: true });
				} else if (result.type === 'failure') {
					showToast('err', (result.data?.message as string) ?? m.notes_toast_create_failed());
				}
			};
		}}
		class="grid gap-4 px-5 py-4"
	>
		<label class="grid gap-1.5">
			<span class="text-[13px] font-medium text-text-3">{m.notes_field_title()}</span>
			<input
				bind:value={title}
				oninput={() => (titleDirty = true)}
				maxlength="120"
				placeholder={m.notes_field_title_placeholder()}
				class="rounded-lg border border-border bg-surface px-3 py-2 text-[15px] text-text outline-none focus:border-accent"
			/>
		</label>

		<div class="grid gap-1.5">
			<span class="text-[13px] font-medium text-text-3"
				>{m.notes_field_project()} <span class="text-accent">*</span></span
			>
			{#if locked}
				<div
					class="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[14px] text-text-2"
				>
					{#if selectedProject}
						<span class="h-2 w-2 shrink-0 rounded-full" style:background={selectedProject.color}
						></span>
						<span class="truncate">{selectedProject.name}</span>
					{/if}
				</div>
			{:else}
				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'project' ? null : 'project')}
						class="flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-[14px] transition-colors {pop ===
						'project'
							? 'border-border-strong ring-2 ring-accent/30'
							: 'border-border hover:border-border-strong'}"
					>
						{#if selectedProject}
							<span class="flex items-center gap-2 truncate">
								<span class="h-2 w-2 shrink-0 rounded-full" style:background={selectedProject.color}
								></span>
								<span class="truncate text-text">{selectedProject.name}</span>
							</span>
						{:else}
							<span class="text-text-3">{m.notes_field_project_placeholder()}</span>
						{/if}
						<Icon name="chevron" size={13} class="shrink-0 text-text-3" />
					</button>
					{#if pop === 'project'}
						<ProjectPopover
							value={(selectedProject?.key ?? '') as ProjectId}
							onchange={(key) => (projectId = projects.find((p) => p.key === key)?.id ?? '')}
							onclose={() => (pop = null)}
							{projects}
							{memberProjectIds}
							{allAccess}
						/>
					{/if}
				</div>
			{/if}
			<input type="hidden" name="projectId" value={projectId} />
		</div>

		<div class="grid gap-1.5">
			<span class="text-[13px] font-medium text-text-3">{m.notes_field_task()}</span>
			{#if locked}
				<div
					class="flex h-9 w-full items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[14px] text-text-2"
				>
					{#if presetTaskRef}
						<span class="shrink-0 font-mono text-[12px] text-text-3">{presetTaskRef}</span>
					{/if}
					<span class="truncate">{presetTaskTitle}</span>
				</div>
			{:else}
				<div class="relative">
					<button
						type="button"
						disabled={!projectId || projectTasks.length === 0}
						onclick={() => (pop = pop === 'task' ? null : 'task')}
						class="flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-[14px] transition-colors disabled:opacity-50 {pop ===
						'task'
							? 'border-border-strong ring-2 ring-accent/30'
							: 'border-border hover:border-border-strong'}"
					>
						{#if selectedTask}
							<span class="flex items-center gap-1.5 truncate">
								<span class="shrink-0 font-mono text-[12px] text-text-3">{selectedTask.ref}</span>
								<span class="truncate text-text">{selectedTask.title}</span>
							</span>
						{:else}
							<span class="truncate text-text-3">
								{!projectId
									? m.notes_field_task_pick_project_first()
									: projectTasks.length === 0
										? m.notes_field_task_none_in_project()
										: m.notes_field_task_placeholder()}
							</span>
						{/if}
						<Icon name="chevron" size={13} class="shrink-0 text-text-3" />
					</button>
					{#if pop === 'task'}
						<TaskPopover
							value={taskId}
							onchange={(v) => (taskId = v)}
							onclose={() => (pop = null)}
							tasks={taskRows}
							noneLabel={m.notes_field_task_placeholder()}
						/>
					{/if}
				</div>
			{/if}
			<input type="hidden" name="taskId" value={taskId} />
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div class="grid gap-1.5">
				<span class="text-[13px] font-medium text-text-3">{m.notes_field_date()}</span>
				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'date' ? null : 'date')}
						class="flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-[14px] transition-colors {pop ===
						'date'
							? 'border-border-strong ring-2 ring-accent/30'
							: 'border-border hover:border-border-strong'}"
					>
						<span class="truncate text-text">{formatDateLong(meetingDate)}</span>
						<Icon name="calendar" size={14} class="shrink-0 text-text-3" />
					</button>
					{#if pop === 'date'}
						<DatePopover
							value={meetingDate}
							onchange={(v) => (meetingDate = v ?? todayISO())}
							onclose={() => (pop = null)}
						/>
					{/if}
				</div>
				<input type="hidden" name="meetingDate" value={meetingDate} />
			</div>
			<div class="grid gap-1.5">
				<span class="text-[13px] font-medium text-text-3">{m.notes_field_template()}</span>
				<Select
					bind:value={templateId}
					options={templateOptions}
					ariaLabel={m.notes_field_template()}
					maxWidth={190}
				/>
				<input type="hidden" name="templateId" value={templateId} />
			</div>
		</div>

		<input type="hidden" name="title" value={title} />

		<div class="flex justify-end gap-2 pt-1">
			<button
				type="button"
				onclick={close}
				class="rounded-lg px-3 py-1.5 text-[14px] text-text-2 hover:bg-surface-2"
			>
				{m.common_cancel()}
			</button>
			<button
				type="submit"
				disabled={submitting || !projectId}
				class="rounded-lg bg-accent px-3.5 py-1.5 text-[14px] font-medium text-white hover:opacity-90 disabled:opacity-50"
			>
				{m.notes_create()}
			</button>
		</div>
	</form>
</Modal>
