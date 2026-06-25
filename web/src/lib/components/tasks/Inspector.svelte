<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { page } from '$app/state';
	import { showToast } from '$lib/stores/toast.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import type { PriorityId, StatusId, TypeId, Task } from '$lib/types';
	import Drawer from '../Drawer.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import LabelChip from '../LabelChip.svelte';
	import Avatar from '../Avatar.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import Composer from '../Composer.svelte';
	import MentionText from '../MentionText.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import TimeLogger from './TimeLogger.svelte';
	import AttachmentList from '../attachments/AttachmentList.svelte';
	import AttachmentUploader from '../attachments/AttachmentUploader.svelte';
	import AttachmentDropzone from '../attachments/AttachmentDropzone.svelte';
	import StagedFileList from '../attachments/StagedFileList.svelte';
	import { selectStageable } from '$lib/config/attachments';
	import StatusPopover from '../popovers/StatusPopover.svelte';
	import PriorityPopover from '../popovers/PriorityPopover.svelte';
	import TypePopover from '../popovers/TypePopover.svelte';
	import AssigneePopover from '../popovers/AssigneePopover.svelte';
	import DatePopover from '../popovers/DatePopover.svelte';
	import EstimatePopover from '../popovers/EstimatePopover.svelte';
	import TagsPopover from '../popovers/TagsPopover.svelte';
	import TaskMenuPopover from '../popovers/TaskMenuPopover.svelte';
	import NewMeetingDialog from '../notes/NewMeetingDialog.svelte';
	import {
		TRACKR_PRIORITIES,
		TRACKR_STATUSES,
		TRACKR_TYPES,
		userById as mockUserById,
		formatDateLong,
		formatEstimate
	} from '$lib/data';
	import { resolveProject } from '$lib/stores/lookup.svelte';
	import { statusLabel, priorityLabel, typeLabel } from '$lib/labels';
	import { m } from '$lib/paraglide/messages';

	type AssignableUser = {
		id: string;
		name: string;
		email: string;
		initials: string;
		color: string;
		status: 'active' | 'invited' | 'disabled';
	};

	interface Props {
		task: Task | null;
		onclose: () => void;
		users?: AssignableUser[];
	}
	let { task, onclose, users: providedUsers }: Props = $props();

	function resolveUser(id: string) {
		const real = providedUsers?.find((u) => u.id === id);
		if (real) return real;
		return mockUserById(id);
	}

	// Whether the current user can edit fields on the currently-open task.
	// Mirrors the server gate: edit.any (Trackr team / project.manager) or
	// edit.own (creator). Reassigning is allowed for the same set today.
	type LayoutShape = {
		currentUserId?: string;
		isTrackrTeam?: boolean;
		projects?: { id: string; key: string }[];
		archivedProjects?: { id: string; key: string }[];
		memberRoles?: { projects?: Record<string, string> };
	};

	// The open task's project id — scopes the comment composer's @-mention
	// list to people who can actually see this task. Tasks store the project
	// key, so resolve it via the layout's project lists (archived included so
	// tasks on archived projects stay scoped too).
	const taskProjectId = $derived.by(() => {
		const t = task;
		if (!t) return null;
		const pd = page.data as LayoutShape;
		return (
			pd.projects?.find((p) => p.key === t.project)?.id ??
			pd.archivedProjects?.find((p) => p.key === t.project)?.id ??
			null
		);
	});

	const isTeam = $derived(!!(page.data as LayoutShape).isTrackrTeam);

	// Meeting notes linked to this task (notes feature is team-only). Fetched on
	// demand when a task opens — kept out of the bulk task load.
	type LinkedNote = { id: string; title: string; meetingDate: string | null };
	type MeetingTemplate = { id: string; name: string; icon: string };
	let meetingNotes = $state<LinkedNote[]>([]);
	let meetingTemplates = $state<MeetingTemplate[]>([]);
	let newMeetingOpen = $state(false);

	async function loadMeetingNotes(uuid: string) {
		try {
			const res = await fetch(`/api/tasks/${uuid}/meetings`);
			if (!res.ok) return;
			const data = (await res.json()) as { notes: LinkedNote[]; templates: MeetingTemplate[] };
			// Ignore if the open task changed while we were fetching.
			if (task?.uuid !== uuid) return;
			meetingNotes = data.notes;
			meetingTemplates = data.templates;
		} catch {
			/* non-fatal — section just stays empty */
		}
	}

	$effect(() => {
		const uuid = task?.uuid;
		meetingNotes = [];
		if (uuid && isTeam) void loadMeetingNotes(uuid);
	});

	function meetingDateLabel(d: string | null): string {
		return d ? formatDateLong(d) : '';
	}

	const canEdit = $derived.by(() => {
		const t = task;
		if (!t) return false;
		const pd = page.data as LayoutShape;
		if (pd.isTrackrTeam) return true;
		if (t.createdBy && t.createdBy === pd.currentUserId) return true;
		// Project manager on this specific project.
		const projectId = pd.projects?.find((p) => p.key === t.project)?.id;
		if (projectId) {
			const role = pd.memberRoles?.projects?.[projectId];
			if (role === 'project.manager') return true;
		}
		return false;
	});

	let savingField = $state<string | null>(null);

	async function postAction(
		action: 'update' | 'commentAdd' | 'timeLogAdd' | 'planSet' | 'delete',
		field: string,
		body: Record<string, string | string[]>,
		files: File[] = []
	): Promise<boolean> {
		if (!draft) return false;
		savingField = field;
		const fd = new FormData();
		fd.append('id', draft.id);
		for (const [k, v] of Object.entries(body)) {
			if (Array.isArray(v)) {
				if (v.length === 0) fd.append(k, '__clear__');
				else for (const item of v) fd.append(k, item);
			} else {
				fd.append(k, v);
			}
		}
		for (const file of files) fd.append('attachments', file);
		try {
			const res = await fetch(`/tasks?/${action}`, {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			if (result.type === 'failure') {
				showToast(
					'err',
					(result.data as { message?: string } | undefined)?.message ?? m.tasks_save_failed()
				);
				// Revert optimistic local mutations by re-fetching server state.
				await invalidateAll();
				return false;
			}
			if (result.type === 'error') {
				showToast('err', result.error?.message ?? m.tasks_save_failed());
				await invalidateAll();
				return false;
			}
			if (result.type === 'success') {
				await invalidateAll();
				return true;
			}
			return false;
		} catch {
			showToast('err', m.tasks_network_error_saving());
			await invalidateAll();
			return false;
		} finally {
			savingField = null;
		}
	}

	function patch(field: string, body: Record<string, string | string[]>) {
		return postAction('update', field, body);
	}

	let commentBody = $state('');
	let commentSending = $state(false);
	let commentFiles = $state<File[]>([]);
	let commentFileInput = $state<HTMLInputElement>();

	function addCommentFiles(incoming: File[]) {
		const { accepted, errors } = selectStageable(incoming, commentFiles.length);
		for (const err of errors) showToast('err', err);
		if (accepted.length) commentFiles = [...commentFiles, ...accepted];
	}

	function onCommentPick(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		if (target.files?.length) addCommentFiles(Array.from(target.files));
		target.value = '';
	}

	async function sendComment() {
		const text = commentBody.trim();
		if ((!text && commentFiles.length === 0) || !draft || commentSending) return;
		commentSending = true;
		const ok = await postAction('commentAdd', 'comment', { body: text }, commentFiles);
		commentSending = false;
		if (ok) {
			commentBody = '';
			commentFiles = [];
		}
	}

	async function logTime(entry: { h: number; m: number; date: string; note: string }) {
		await postAction('timeLogAdd', 'timelog', {
			hours: String(entry.h),
			minutes: String(entry.m),
			date: entry.date,
			note: entry.note
		});
	}

	function setPlan(plannedFor: string | null) {
		if (draft) {
			draft.plannedFor = plannedFor;
			draft.inMyPlan = plannedFor !== null ? true : false;
		}
		void postAction('planSet', 'plan', { plannedFor: plannedFor ?? '' });
	}

	function setPlanUndated() {
		if (draft) {
			draft.plannedFor = null;
			draft.inMyPlan = true;
		}
		void postAction('planSet', 'plan', { mode: 'undated' });
	}

	// Local editable state — fresh copy whenever a new task opens
	let draft = $state<Task | null>(null);
	$effect(() => {
		draft = task ? { ...task, assignees: task.assignees ?? [task.assignee] } : null;
		// Reset the compose box when the task changes.
		commentBody = '';
		// Best-effort mark-read so the bell dot clears when the user opens
		// a task they were notified about. Failures are silent — bell state
		// resolves itself on next page load.
		if (task) {
			void fetch('/api/notifications/read', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ entityType: 'task', displayId: task.id })
			}).catch(() => {});
		}
	});

	// ─── Checklist ───────────────────────────────────────────────────────────
	let newChecklistItem = $state('');
	const checklistItems = $derived(draft?.checklist ?? []);
	const checklistDone = $derived(checklistItems.filter((it) => it.done).length);

	function saveChecklist() {
		if (!draft) return;
		void postAction('update', 'checklist', { checklist: JSON.stringify(draft.checklist ?? []) });
	}
	function addChecklistItem() {
		const text = newChecklistItem.trim();
		if (!text || !draft) return;
		draft.checklist = [...(draft.checklist ?? []), { id: crypto.randomUUID(), text, done: false }];
		newChecklistItem = '';
		saveChecklist();
	}
	function toggleChecklistItem(id: string) {
		if (!draft) return;
		draft.checklist = (draft.checklist ?? []).map((it) =>
			it.id === id ? { ...it, done: !it.done } : it
		);
		saveChecklist();
	}
	function editChecklistItem(id: string, text: string) {
		if (!draft) return;
		const t = text.trim();
		draft.checklist = (draft.checklist ?? [])
			.map((it) => (it.id === id ? { ...it, text: t } : it))
			.filter((it) => it.text.length > 0);
		saveChecklist();
	}
	function removeChecklistItem(id: string) {
		if (!draft) return;
		draft.checklist = (draft.checklist ?? []).filter((it) => it.id !== id);
		saveChecklist();
	}

	type PopId =
		| 'type'
		| 'status'
		| 'priority'
		| 'assignees'
		| 'due'
		| 'estimate'
		| 'plan'
		| 'tags'
		| 'menu'
		| null;
	let openPop = $state<PopId>(null);

	// Every tag in use across the loaded tasks — offered as quick picks in the
	// tag popover so existing custom tags are reusable, not just retyped.
	const tagSuggestions = $derived.by(() => {
		const tasks = (page.data as { tasks?: { labels?: string[] }[] }).tasks ?? [];
		const set = new Set<string>();
		for (const t of tasks) for (const l of t.labels ?? []) set.add(l);
		return [...set];
	});

	const canDelete = $derived.by(() => {
		const t = task;
		if (!t) return false;
		const pd = page.data as LayoutShape & { effectivePermissions?: string[] };
		if (pd.isTrackrTeam) return true;
		const projectId = pd.projects?.find((p) => p.key === t.project)?.id;
		if (projectId) {
			const role = pd.memberRoles?.projects?.[projectId];
			if (role === 'project.manager') return true;
		}
		return (pd.effectivePermissions ?? []).includes('project.tasks.delete.any');
	});

	async function deleteTask() {
		if (!draft) return;
		const confirmed = await confirm({
			title: m.tasks_delete_confirm_title({ id: draft.id }),
			message: m.tasks_delete_confirm_message(),
			confirmLabel: m.common_delete(),
			cancelLabel: m.common_cancel(),
			tone: 'danger',
			icon: 'trash'
		});
		if (!confirmed) return;
		const ok = await postAction('delete', 'delete', {});
		if (ok) onclose();
	}

	let status = $derived.by(() => {
		const d = draft;
		return d ? TRACKR_STATUSES.find((s) => s.id === d.status)! : null;
	});
	let prio = $derived.by(() => {
		const d = draft;
		return d ? TRACKR_PRIORITIES.find((p) => p.id === d.priority)! : null;
	});
	let taskType = $derived.by(() => {
		const d = draft;
		return d ? TRACKR_TYPES.find((t) => t.id === (d.type ?? 'task'))! : null;
	});
	let assigneeIds = $derived.by(() => {
		const d = draft;
		return d ? (d.assignees ?? [d.assignee]) : [];
	});
	let assignees = $derived(assigneeIds.map((id) => resolveUser(id)));
	let project = $derived.by(() => {
		const d = draft;
		return d ? resolveProject(d.project) : null;
	});

	let events = $derived.by(() => {
		if (!draft) return [];
		const list: {
			id: string;
			kind: string;
			user: string;
			date: string;
			sortKey: string;
			data?: any;
			files?: import('$lib/config/attachments').AttachmentDTO[];
		}[] = [];
		(draft.comments ?? []).forEach((c, i) =>
			list.push({
				id: `c:${i}`,
				kind: 'comment',
				user: c.user,
				date: c.date,
				sortKey: c.createdAt ?? c.date,
				data: c.text,
				files: c.files
			})
		);
		(draft.timeLogs ?? []).forEach((t, i) =>
			list.push({
				id: `t:${i}`,
				kind: 'time',
				user: t.user,
				date: t.date,
				sortKey: t.createdAt ?? t.date,
				data: t
			})
		);
		if (draft.createdBy && draft.createdAt) {
			list.push({
				id: 'created',
				kind: 'created',
				user: draft.createdBy,
				date: draft.createdAt,
				sortKey: draft.createdAt
			});
		}
		// Newest first. Both ISO timestamps ("2026-05-14T20:01:23.456Z") and
		// plain dates ("2026-05-14") are lex-comparable: the plain date sorts
		// to the start of its day, which is the right place for the "created"
		// event when its full timestamp isn't available.
		return list.sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));
	});

	function toggle(id: PopId) {
		openPop = openPop === id ? null : id;
	}

	function autosize(el: HTMLTextAreaElement, value: string) {
		const resize = () => {
			el.style.height = 'auto';
			el.style.height = el.scrollHeight + 'px';
		};
		resize();
		return {
			update(v: string) {
				if (el.value !== v) el.value = v;
				resize();
			}
		};
	}
</script>

<Drawer open={!!task} {onclose}>
	{#if draft && status && prio && project}
		<div class="flex items-center gap-2 border-b border-border px-5 pt-4 pb-3">
			<TypeBadge type={draft.type ?? 'task'} idText={draft.id} showLabel={false} />
			<span class="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-text-3">
				{project.name}
			</span>
			{#if savingField}
				<span class="inline-flex items-center gap-1.5 text-[11px] text-text-3">
					<span
						class="h-2.5 w-2.5 animate-spin rounded-full border border-text-3 border-t-transparent"
					></span>
					{m.common_saving()}
				</span>
			{/if}
			<div class="ml-auto flex items-center gap-1">
				<IconButton size={28} ariaLabel={m.tasks_copy_link()}
					><Icon name="link" size={14} /></IconButton
				>
				<div class="relative">
					<IconButton size={28} ariaLabel={m.tasks_more()} onclick={() => toggle('menu')}>
						<Icon name="settings" size={14} />
					</IconButton>
					{#if openPop === 'menu'}
						<TaskMenuPopover
							{canDelete}
							ondelete={() => void deleteTask()}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>
				<IconButton size={28} ariaLabel={m.common_close()} onclick={onclose}
					><Icon name="x" size={14} /></IconButton
				>
			</div>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-24">
			<textarea
				use:autosize={draft.title}
				value={draft.title}
				rows="1"
				placeholder={m.tasks_untitled()}
				readonly={!canEdit}
				oninput={(e) => {
					const el = e.currentTarget;
					if (draft) draft.title = el.value;
					el.style.height = 'auto';
					el.style.height = el.scrollHeight + 'px';
				}}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						(e.currentTarget as HTMLTextAreaElement).blur();
					}
				}}
				onblur={(e) => {
					const next = e.currentTarget.value.trim();
					if (!draft || next === (task?.title ?? '')) return;
					if (!next) {
						if (draft) draft.title = task?.title ?? '';
						e.currentTarget.value = task?.title ?? '';
						return;
					}
					void patch('title', { title: next });
				}}
				class="mb-4 w-full resize-none border-0 bg-transparent text-[20px] leading-tight font-semibold tracking-[-0.012em] text-text outline-none placeholder:text-text-4"
			></textarea>

			<!-- properties rail -->
			<div class="mb-5 flex flex-wrap gap-2">
				<!-- TYPE -->
				{#if taskType}
					<div class="relative">
						<button
							type="button"
							onclick={() => toggle('type')}
							disabled={!canEdit}
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {canEdit
								? 'hover:border-border-strong'
								: ''} {openPop === 'type' ? 'ring-2 ring-accent/40' : ''}"
						>
							<TypeBadge type={draft.type ?? 'task'} showLabel={false} />
							<span>{typeLabel(draft.type ?? 'task')}</span>
						</button>
						{#if openPop === 'type'}
							<TypePopover
								value={draft.type ?? 'task'}
								onchange={(v: TypeId) => {
									if (draft) draft.type = v;
									void patch('type', { type: v });
								}}
								onclose={() => (openPop = null)}
							/>
						{/if}
					</div>
				{/if}

				<!-- STATUS -->
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('status')}
						disabled={!canEdit}
						class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {canEdit
							? 'hover:border-border-strong'
							: ''} {openPop === 'status' ? 'ring-2 ring-accent/40' : ''}"
					>
						<StatusDot status={draft.status} />
						<span>{statusLabel(draft.status)}</span>
					</button>
					{#if openPop === 'status'}
						<StatusPopover
							value={draft.status}
							onchange={(v: StatusId) => {
								if (draft) draft.status = v;
								void patch('status', { status: v });
							}}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>

				<!-- PRIORITY -->
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('priority')}
						disabled={!canEdit}
						class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {canEdit
							? 'hover:border-border-strong'
							: ''} {openPop === 'priority' ? 'ring-2 ring-accent/40' : ''}"
					>
						{#if prio.bars > 0}
							<PriorityBars priority={draft.priority} />
						{/if}
						<span>{priorityLabel(draft.priority)}</span>
					</button>
					{#if openPop === 'priority'}
						<PriorityPopover
							value={draft.priority}
							onchange={(v: PriorityId) => {
								if (draft) draft.priority = v;
								void patch('priority', { priority: v });
							}}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>

				<!-- ASSIGNEES -->
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('assignees')}
						disabled={!canEdit}
						class="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {canEdit
							? 'hover:border-border-strong'
							: ''} {openPop === 'assignees' ? 'ring-2 ring-accent/40' : ''}"
					>
						{#if assignees.length === 1}
							<Avatar user={assignees[0]} size={18} />
							<span>{assignees[0]?.name}</span>
						{:else if assignees.length === 0}
							<span class="text-text-3">{m.common_unassigned()}</span>
						{:else}
							<AvatarStack users={assignees} size={18} max={3} overlap={5} />
							<span>{m.tasks_n_assignees({ n: assignees.length })}</span>
						{/if}
					</button>
					{#if openPop === 'assignees'}
						<AssigneePopover
							value={assigneeIds}
							onchange={(v) => {
								if (draft) {
									draft.assignees = v;
									if (v.length > 0) draft.assignee = v[0];
									else draft.assignee = '';
								}
								void patch('assignees', { assignees: v });
							}}
							onclose={() => (openPop = null)}
							users={providedUsers}
						/>
					{/if}
				</div>

				<!-- DUE -->
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('due')}
						disabled={!canEdit}
						class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {draft.due
							? 'border border-border bg-surface'
							: 'border border-dashed border-border text-text-3'} {canEdit
							? draft.due
								? 'hover:border-border-strong'
								: 'hover:border-border-strong hover:text-text'
							: ''} {openPop === 'due' ? 'ring-2 ring-accent/40' : ''}"
					>
						<Icon name="calendar" size={13} />
						{#if draft.due}
							<span class="font-mono">{formatDateLong(draft.due)}</span>
						{:else}
							<span>{m.tasks_due_date()}</span>
						{/if}
					</button>
					{#if openPop === 'due'}
						<DatePopover
							value={draft.due}
							onchange={(v) => {
								if (draft) draft.due = v;
								void patch('due', { due: v ?? '' });
							}}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>

				<!-- PLAN FOR (My Week) -->
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('plan')}
						class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors {draft.inMyPlan
							? 'border border-transparent bg-accent-soft text-accent'
							: 'border border-dashed border-border text-text-3 hover:border-border-strong hover:text-text'} {openPop ===
						'plan'
							? 'ring-2 ring-accent/40'
							: ''}"
						style:background={draft.inMyPlan ? 'rgba(239,122,109,0.14)' : ''}
					>
						<Icon name="bookmark" size={13} />
						{#if draft.plannedFor}
							<span class="font-mono">{formatDateLong(draft.plannedFor)}</span>
						{:else if draft.inMyPlan}
							<span>{m.tasks_in_my_week()}</span>
						{:else}
							<span>{m.tasks_plan_for()}</span>
						{/if}
					</button>
					{#if openPop === 'plan'}
						<DatePopover
							value={draft.plannedFor ?? null}
							onchange={(v) => setPlan(v)}
							onclose={() => (openPop = null)}
							undatedLabel={m.tasks_add_to_week_no_date()}
							onundated={setPlanUndated}
							undatedActive={!!draft.inMyPlan && !draft.plannedFor}
						/>
					{/if}
				</div>

				<!-- ESTIMATE -->
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('estimate')}
						disabled={!canEdit}
						class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {draft.estimate
							? 'border border-border bg-surface'
							: 'border border-dashed border-border text-text-3'} {canEdit
							? draft.estimate
								? 'hover:border-border-strong'
								: 'hover:border-border-strong hover:text-text'
							: ''} {openPop === 'estimate' ? 'ring-2 ring-accent/40' : ''}"
					>
						{#if draft.estimate}
							<span class="text-text-3">{m.tasks_est()}</span>
							<span class="font-mono">{formatEstimate(draft.estimate)}</span>
						{:else}
							<span>{m.tasks_estimate()}</span>
						{/if}
					</button>
					{#if openPop === 'estimate'}
						<EstimatePopover
							value={draft.estimate}
							onchange={(v) => {
								if (draft) draft.estimate = v;
								void patch('estimate', { estimate: v != null ? String(v) : '' });
							}}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>
			</div>

			<textarea
				use:autosize={draft.description ?? ''}
				value={draft.description ?? ''}
				rows="3"
				placeholder={m.tasks_description_placeholder()}
				readonly={!canEdit}
				oninput={(e) => {
					const el = e.currentTarget;
					if (draft) draft.description = el.value || undefined;
					el.style.height = 'auto';
					el.style.height = el.scrollHeight + 'px';
				}}
				onblur={(e) => {
					const next = e.currentTarget.value;
					const current = task?.description ?? '';
					if (next === current) return;
					void patch('description', { description: next });
				}}
				class="mb-5 min-h-[60px] w-full resize-none border-0 bg-transparent text-[13.5px] leading-relaxed text-text-2 outline-none placeholder:text-text-4"
			></textarea>

			{#if canEdit || checklistItems.length > 0}
				{@const total = checklistItems.length}
				{@const allDone = total > 0 && checklistDone === total}
				<div class="mb-6">
					<div class="mb-2.5 flex items-center gap-2.5">
						<div class="text-[11px] tracking-[0.08em] text-text-4 uppercase">
							{m.tasks_checklist()}
						</div>
						{#if total > 0}
							<span class="font-mono text-[11px] {allDone ? 'text-[#7fc8a9]' : 'text-text-3'}">
								{checklistDone}/{total}
							</span>
							<div class="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
								<div
									class="h-full rounded-full transition-all duration-300 {allDone
										? 'bg-[#7fc8a9]'
										: 'bg-accent'}"
									style:width="{(checklistDone / total) * 100}%"
								></div>
							</div>
						{/if}
					</div>
					<div
						class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface/40"
					>
						{#each checklistItems as item (item.id)}
							<div
								class="group flex items-center gap-2.5 px-2.5 py-2 transition-colors hover:bg-surface-2/60"
							>
								<button
									type="button"
									disabled={!canEdit}
									onclick={() => toggleChecklistItem(item.id)}
									aria-label={item.text}
									class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border-[1.5px] transition-all {item.done
										? 'border-accent bg-accent text-white'
										: 'border-border-strong hover:border-accent/60'} disabled:cursor-default"
								>
									{#if item.done}<Icon name="check" size={12} />{/if}
								</button>
								{#if canEdit}
									<input
										value={item.text}
										onblur={(e) => editChecklistItem(item.id, e.currentTarget.value)}
										onkeydown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												(e.currentTarget as HTMLInputElement).blur();
											}
										}}
										class="flex-1 border-0 bg-transparent text-[13px] outline-none {item.done
											? 'text-text-4 line-through'
											: 'text-text-2'}"
									/>
									<button
										type="button"
										onclick={() => removeChecklistItem(item.id)}
										aria-label={m.common_delete()}
										class="grid h-5 w-5 shrink-0 place-items-center rounded text-text-4 opacity-0 transition-colors group-hover:opacity-100 hover:text-accent"
									>
										<Icon name="x" size={12} />
									</button>
								{:else}
									<span
										class="flex-1 text-[13px] {item.done
											? 'text-text-4 line-through'
											: 'text-text-2'}">{item.text}</span
									>
								{/if}
							</div>
						{/each}
						{#if canEdit}
							<div class="flex items-center gap-2.5 px-2.5 py-2">
								<span class="grid h-[18px] w-[18px] shrink-0 place-items-center text-text-4">
									<Icon name="plus" size={13} />
								</span>
								<input
									bind:value={newChecklistItem}
									placeholder={m.tasks_checklist_add()}
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											addChecklistItem();
										}
									}}
									class="flex-1 border-0 bg-transparent text-[13px] text-text-2 outline-none placeholder:text-text-4"
								/>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			{#if draft.parent || draft.sourceTicket || (draft.labels && draft.labels.length > 0) || canEdit}
				<div class="mb-6 flex flex-wrap items-center gap-2">
					{#if draft.parent}
						<span
							class="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 font-mono text-[11.5px] text-text-3"
						>
							<Icon name="chevron-r" size={11} />
							{draft.parent}
						</span>
					{/if}
					{#if draft.sourceTicket}
						<a
							href="/tickets/{draft.sourceTicket.id}"
							title={m.tasks_source_ticket()}
							class="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 text-[11.5px] text-text-3 transition-colors hover:border-border-strong hover:text-text"
						>
							<Icon name="link" size={11} />
							<span class="font-mono">{draft.sourceTicket.displayId}</span>
						</a>
					{/if}
					{#each draft.labels as l (l)}<LabelChip id={l} />{/each}
					{#if canEdit}
						<div class="relative">
							<button
								type="button"
								onclick={() => toggle('tags')}
								class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-1 text-[12px] text-text-3 transition-colors hover:border-border-strong hover:text-text {openPop ===
								'tags'
									? 'ring-2 ring-accent/40'
									: ''}"
							>
								<Icon name="bookmark" size={12} />
								<span>{draft.labels.length > 0 ? m.tasks_add_tag() : m.tasks_add_tags()}</span>
							</button>
							{#if openPop === 'tags'}
								<TagsPopover
									value={draft.labels}
									suggestions={tagSuggestions}
									onchange={(v) => {
										if (draft) draft.labels = v;
										void patch('tags', { tags: v });
									}}
									onclose={() => (openPop = null)}
								/>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			{#if draft.uuid}
				<div class="mb-6">
					<div class="mb-2 flex items-center justify-between">
						<div class="text-[11px] tracking-[0.08em] text-text-4 uppercase">
							{m.tasks_attachments()}{#if draft.files?.length}<span class="ml-1.5 text-text-3"
									>{draft.files.length}</span
								>{/if}
						</div>
						<AttachmentUploader entityType="task" entityId={draft.uuid} />
					</div>
					{#if draft.files?.length}
						<AttachmentList
							attachments={draft.files}
							canDelete={canEdit}
							currentUserId={(page.data as { currentUserId?: string }).currentUserId ?? null}
						/>
					{:else}
						<p class="text-[12.5px] text-text-3">{m.tasks_no_files_attached()}</p>
					{/if}
				</div>
			{/if}

			{#if isTeam && draft.uuid}
				<div class="mb-6">
					<div class="mb-2 flex items-center justify-between">
						<div class="text-[11px] tracking-[0.08em] text-text-4 uppercase">
							{m.notes_section_meetings()}{#if meetingNotes.length}<span class="ml-1.5 text-text-3"
									>{meetingNotes.length}</span
								>{/if}
						</div>
						{#if taskProjectId}
							<button
								type="button"
								onclick={() => (newMeetingOpen = true)}
								class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-1 text-[12px] text-text-3 transition-colors hover:border-border-strong hover:text-text"
							>
								<Icon name="plus" size={12} />
								{m.notes_new_meeting()}
							</button>
						{/if}
					</div>
					{#if meetingNotes.length}
						<div class="grid gap-1.5">
							{#each meetingNotes as n (n.id)}
								<a
									href="/notes/{n.id}"
									class="group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:border-border-strong"
								>
									<Icon name="users" size={14} class="shrink-0 text-text-3" />
									<span class="flex-1 truncate text-[13px] text-text-2 group-hover:text-text"
										>{n.title || m.notes_untitled()}</span
									>
									{#if n.meetingDate}
										<span class="shrink-0 text-[11.5px] text-text-4"
											>{meetingDateLabel(n.meetingDate)}</span
										>
									{/if}
								</a>
							{/each}
						</div>
					{:else}
						<p class="text-[12.5px] text-text-3">{m.notes_task_no_meetings()}</p>
					{/if}
				</div>
			{/if}

			<div class="mt-4">
				<div class="mb-3 text-[11px] tracking-[0.08em] text-text-4 uppercase">
					{m.tasks_activity()}
				</div>
				<div class="mb-4">
					<TimeLogger task={draft} onlog={logTime} />
				</div>
				<div class="relative space-y-4 pl-7">
					<span class="absolute top-2 bottom-2 left-[10px] w-px bg-border"></span>
					{#each events as e (e.id)}
						{@const u = resolveUser(e.user)}
						<div class="relative">
							<span
								class="absolute top-0.5 -left-7 grid h-5 w-5 place-items-center rounded-full border border-border bg-bg-elev"
							>
								{#if e.kind === 'comment'}
									<Avatar user={u} size={18} />
								{:else if e.kind === 'time'}
									<Icon name="calendar" size={11} />
								{:else if e.kind === 'created'}
									<Icon name="plus" size={11} />
								{/if}
							</span>
							<div class="text-[12.5px] text-text-2">
								<span class="font-medium text-text">{u?.name ?? e.user}</span>
								{#if e.kind === 'comment'}{m.tasks_event_commented()}
								{:else if e.kind === 'time'}{m.tasks_event_logged()}
									<span class="font-medium text-text">{formatEstimate(e.data.minutes)}</span>
								{:else if e.kind === 'created'}{m.tasks_event_created()}
								{/if}
								<span class="font-mono text-text-4">· {e.date}</span>
							</div>
							{#if e.kind === 'comment'}
								<div
									class="mt-2 rounded-lg border border-border bg-surface p-3 text-[13px] leading-relaxed whitespace-pre-wrap text-text"
								>
									<MentionText text={e.data} />
								</div>
								{#if e.files?.length}
									<div class="mt-2">
										<AttachmentList
											attachments={e.files}
											canDelete={canEdit}
											currentUserId={(page.data as { currentUserId?: string }).currentUserId ??
												null}
										/>
									</div>
								{/if}
							{:else if e.kind === 'time' && e.data.note}
								<div class="mt-1.5 text-[12.5px] text-text-3 italic">{e.data.note}</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<div
				class="mt-8 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4 text-[11px] text-text-4"
			>
				{#if draft.createdBy}<span
						>{m.tasks_created_by()}
						<span class="text-text-2">{resolveUser(draft.createdBy)?.name ?? '—'}</span></span
					>{/if}
				{#if draft.createdAt}<span
						>{m.tasks_created()} <span class="font-mono text-text-3">{draft.createdAt}</span></span
					>{/if}
				<span>{m.tasks_updated()} <span class="font-mono text-text-3">{draft.updated}</span></span>
			</div>
		</div>

		<div class="p-3">
			<AttachmentDropzone
				onfiles={addCommentFiles}
				disabled={commentSending}
				label={m.tasks_drop_files_to_comment()}
			>
				{#if commentFiles.length}
					<div class="mb-2">
						<StagedFileList
							files={commentFiles}
							disabled={commentSending}
							onremove={(i) => (commentFiles = commentFiles.filter((_, idx) => idx !== i))}
						/>
					</div>
				{/if}
				<Composer
					bind:value={commentBody}
					placeholder={m.tasks_write_a_comment()}
					sending={commentSending}
					onsend={sendComment}
					projectId={taskProjectId}
				>
					{#snippet rightActions()}
						<button
							type="button"
							aria-label={m.tasks_attach_files()}
							title={m.tasks_attach_files()}
							onclick={() => commentFileInput?.click()}
							class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
						>
							<Icon name="paperclip" size={14} />
						</button>
					{/snippet}
				</Composer>
				<input bind:this={commentFileInput} type="file" multiple hidden onchange={onCommentPick} />
			</AttachmentDropzone>
		</div>

		{#if isTeam && taskProjectId}
			<NewMeetingDialog
				bind:open={newMeetingOpen}
				projects={(
					page.data as {
						projects?: { id: string; key: string; name: string; color: string; status: string }[];
					}
				).projects ?? []}
				templates={meetingTemplates}
				tasks={[]}
				presetProjectId={taskProjectId}
				presetTaskId={draft.uuid ?? ''}
				presetTaskRef={draft.id}
				presetTaskTitle={draft.title}
				locked
			/>
		{/if}
	{/if}
</Drawer>
