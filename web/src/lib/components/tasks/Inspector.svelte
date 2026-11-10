<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { isClosedStatus } from '$lib/utils/task';
	import { deserialize } from '$app/forms';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { fetchTaskDetail } from '$lib/api/tasks';
	import type { ActionResult } from '@sveltejs/kit';
	import type { PriorityId, StatusId, TypeId, Task, TaskLink, TaskSummary } from '$lib/types';
	import Drawer from '../Drawer.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import Composer from '../Composer.svelte';
	import MentionText from '../MentionText.svelte';
	import RichTextInput from '../RichTextInput.svelte';
	import Checklist from '../Checklist.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import TaskTimeCard from './panel/TaskTimeCard.svelte';
	import SectionHeader from './panel/SectionHeader.svelte';
	import PropertyRow from './panel/PropertyRow.svelte';
	import { CHIP, CHIP_INTERACTIVE, OPEN_RING, ROW_CARD, SECTION_ACTION } from './panel/styles';
	import { linkedItems, type LinkedKind } from '$lib/utils/task-panel';
	import { labelMeta } from '$lib/utils/label-meta';
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
	import DependencyPopover from '../popovers/DependencyPopover.svelte';
	import TaskMenuPopover from '../popovers/TaskMenuPopover.svelte';
	import NewMeetingDialog from '../notes/NewMeetingDialog.svelte';
	import { TRACKR_PRIORITIES, TRACKR_STATUSES, TRACKR_TYPES } from '$lib/config/taxonomy';
	import { dueCountdown, formatDateLong, formatEstimate } from '$lib/utils/format';
	import { resolveProject } from '$lib/stores/lookup.svelte';
	import { taskChannelLabel, statusLabel, priorityLabel, typeLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';

	type AssignableUser = {
		id: string;
		name: string;
		email: string;
		initials: string;
		color: string;
		status: 'active' | 'invited' | 'disabled';
	};
	type AttachmentUploaderHandle = { upload: (files: File[]) => Promise<void> };

	interface Props {
		// Display id of the open task (null = closed). The full task is fetched
		// on open; `summary` (the list row, when the page has it) seeds the
		// header and property rail so they render before the fetch lands.
		taskId: string | null;
		summary?: TaskSummary | null;
		onclose: () => void;
		users?: AssignableUser[];
		// Open another task by display id (dependency chips). Pages that hold the
		// selection pass this so the drawer switches in place; without it the
		// chip falls back to the /tasks deep link.
		onopen?: (displayId: string) => void;
		/** Default date for the time logger (My Week: the day the task was opened from). */
		logDate?: string;
	}
	let { taskId, summary = null, onclose, users: providedUsers, onopen, logDate }: Props = $props();

	// The loaded detail for `taskId`; null until the fetch lands or when the
	// task cannot be read. `loadSeq` drops responses for a task that is no
	// longer the open one.
	let task = $state<Task | null>(null);
	let loading = $state(false);
	let loadSeq = 0;

	async function load(id: string) {
		const seq = ++loadSeq;
		loading = true;
		try {
			const detail = await fetchTaskDetail(id);
			if (seq !== loadSeq) return;
			task = detail;
			if (!detail) showToast('err', m.tasks_err_task_not_found());
		} catch {
			if (seq === loadSeq) showToast('err', m.tasks_network_error_saving());
		} finally {
			if (seq === loadSeq) loading = false;
		}
	}

	// Re-fetch the open task after a mutation so the detail (comments, time
	// logs, files, dependents) reflects the server, then refresh the list the
	// page holds via its `app:tasks` dependency — instead of reloading every
	// load function on the page.
	async function refresh() {
		if (taskId) await load(taskId);
	}
	async function afterMutation() {
		await Promise.all([refresh(), invalidate('app:tasks')]);
	}

	// Plain left-clicks switch the drawer; modified clicks keep the link's
	// native open-in-new-tab behaviour.
	function openTask(e: MouseEvent, displayId: string) {
		if (!onopen || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
		e.preventDefault();
		onopen(displayId);
	}

	function resolveUser(id: string) {
		const source = providedUsers ?? (page.data as { users?: AssignableUser[] }).users;
		return source?.find((u) => u.id === id);
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
		const t = draft;
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
		const t = draft;
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
	let taskAttachmentUploader = $state<AttachmentUploaderHandle>();

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
				await afterMutation();
				return false;
			}
			if (result.type === 'error') {
				showToast('err', result.error?.message ?? m.tasks_save_failed());
				await afterMutation();
				return false;
			}
			if (result.type === 'success') {
				// A deleted task has nothing left to re-fetch; the caller closes.
				if (action === 'delete') await invalidate('app:tasks');
				else await afterMutation();
				return true;
			}
			return false;
		} catch {
			showToast('err', m.tasks_network_error_saving());
			await afterMutation();
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

	// Local editable state. Seeded from the list row the moment a task opens,
	// replaced by the fetched detail when it lands, and rebuilt after every
	// refresh. Two effects on purpose: the one keyed on the open task resets
	// the compose box and starts the fetch; the one keyed on the detail only
	// rebuilds the draft, so a refresh after a mutation never wipes a comment
	// being typed.
	let draft = $state<Task | null>(null);
	$effect(() => {
		const id = taskId;
		// `summary` changes whenever the page's list refreshes; that must not
		// re-run the open sequence, so read it without tracking.
		const seed = untrack(() => summary);
		task = null;
		draft = id && seed ? { ...seed, assignees: seed.assignees ?? [seed.assignee] } : null;
		// Reset the compose box when the task changes.
		commentBody = '';
		commentFiles = [];
		if (!id) return;
		void load(id);
		// Best-effort mark-read so the bell dot clears when the user opens
		// a task they were notified about. After the write we invalidate the
		// shared notifications key so the bell + inbox refresh in sync.
		void fetch('/api/notifications/read', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ entityType: 'task', displayId: id })
		})
			.then(() => invalidate('app:notifications'))
			.catch(() => {});
	});
	$effect(() => {
		const t = task;
		if (t) draft = { ...t, assignees: t.assignees ?? [t.assignee] };
	});

	// ─── Checklist ───────────────────────────────────────────────────────────
	const checklistItems = $derived(draft?.checklist ?? []);

	function onChecklistChange(items: { id: string; text: string; done: boolean }[]) {
		if (!draft) return;
		draft.checklist = items;
		void postAction('update', 'checklist', { checklist: JSON.stringify(items) });
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
		| 'deps'
		| 'menu'
		| null;
	let openPop = $state<PopId>(null);

	// ─── Dependencies ────────────────────────────────────────────────────────
	// Prerequisites live on the draft as TaskLinks so add/remove render at once;
	// the server gets uuids (whole-array replace, `__clear__` for empty).
	const dependsOn = $derived(draft?.dependsOn ?? []);
	const dependents = $derived(draft?.dependents ?? []);
	const openPrerequisites = $derived(dependsOn.filter((d) => !isClosedStatus(d.status)));
	const isBlocked = $derived(openPrerequisites.length > 0);
	const byRef = (a: TaskLink, b: TaskLink) =>
		a.id.localeCompare(b.id, undefined, { numeric: true });

	function setDependencies(next: TaskLink[]) {
		if (!draft) return;
		draft.dependsOn = next.length ? next : undefined;
		draft.blocked = next.some((d) => !isClosedStatus(d.status));
		void patch('dependsOn', { dependsOn: next.map((d) => d.uuid) });
	}
	function toggleDependency(link: TaskLink) {
		const has = dependsOn.some((d) => d.uuid === link.uuid);
		setDependencies(
			has ? dependsOn.filter((d) => d.uuid !== link.uuid) : [...dependsOn, link].sort(byRef)
		);
	}
	// Same-project tasks already on the page — instant picker results while
	// the complete list is fetched.
	const dependencySeed = $derived.by(() => {
		const d = draft;
		if (!d) return [];
		const all = (page.data as { tasks?: Task[] }).tasks ?? [];
		return all
			.filter((t) => t.project === d.project && t.uuid && t.uuid !== d.uuid)
			.map<TaskLink>((t) => ({ uuid: t.uuid!, id: t.id, title: t.title, status: t.status }));
	});

	// Tags on the currently loaded tasks, offered as quick picks right away;
	// the popover fetches the complete app-wide vocabulary itself (kind="task").
	const tagSuggestions = $derived.by(() => {
		const d = page.data as { tasks?: { labels?: string[] }[] };
		return [...new Set((d.tasks ?? []).flatMap((t) => t.labels ?? []))];
	});

	const canDelete = $derived.by(() => {
		const t = draft;
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

	// Due countdown chip: only while the task is open and the date is near or past.
	const dueChip = $derived.by(() => {
		const d = draft;
		if (!d?.due || isClosedStatus(d.status)) return null;
		const c = dueCountdown(d.due);
		if (!c || !c.label) return null;
		if (c.tone !== 'overdue') return c;
		const n = -c.days;
		return {
			...c,
			label: n === 1 ? m.tasks_panel_overdue_one() : m.tasks_panel_overdue_days({ n })
		};
	});
	const DUE_CHIP: Record<string, string> = {
		overdue: 'bg-[#ef4f5e]/15 text-[#ef4f5e]',
		urgent: 'bg-accent-soft text-accent',
		soon: 'bg-[#d8a24a]/15 text-[#d8a24a]'
	};
	const DUE_TEXT: Record<string, string> = {
		overdue: 'text-[#ef4f5e]',
		urgent: 'text-accent',
		soon: 'text-[#d8a24a]',
		normal: ''
	};
	// Property values: quiet until hovered, so the list reads like a summary.
	const PROP_VALUE =
		'inline-flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[14px] text-text transition-colors hover:bg-surface disabled:cursor-default disabled:hover:bg-transparent';

	// Prerequisites, dependents, source ticket and parent in one "Linked" list.
	const linked = $derived(
		linkedItems({
			dependsOn,
			dependents,
			sourceTicket: draft?.sourceTicket ?? null,
			parent: draft?.parent ?? null
		})
	);
	const LINK_KIND_LABEL: Record<LinkedKind, () => string> = {
		prerequisite: m.tasks_panel_kind_prerequisite,
		dependent: m.tasks_panel_kind_dependent,
		ticket: m.tasks_panel_kind_ticket,
		parent: m.tasks_panel_kind_parent
	};

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
</script>

<Drawer
	open={!!taskId}
	{onclose}
	onfiles={(files) => void taskAttachmentUploader?.upload(files)}
	dropDisabled={!draft?.uuid}
	dropLabel={m.tasks_drop_files_to_attach()}
>
	{#if draft && status && prio && project}
		<div class="flex items-center gap-2 border-b border-border px-5 pt-4 pb-3">
			<TypeBadge type={draft.type ?? 'task'} idText={draft.id} showLabel={false} />
			<span
				class="min-w-0 truncate rounded bg-surface px-1.5 py-0.5 font-mono text-[12px] text-text-3"
			>
				{project.name}
			</span>
			{#if savingField}
				<span class="inline-flex items-center gap-1.5 text-[12px] text-text-3">
					<span
						class="h-2.5 w-2.5 animate-spin rounded-full border border-text-3 border-t-transparent"
					></span>
					{m.common_saving()}
				</span>
			{/if}
			<div class="ml-auto flex items-center gap-1">
				<IconButton size={31} ariaLabel={m.tasks_copy_link()}
					><Icon name="link" size={15} /></IconButton
				>
				<div class="relative">
					<IconButton size={31} ariaLabel={m.tasks_more()} onclick={() => toggle('menu')}>
						<Icon name="settings" size={15} />
					</IconButton>
					{#if openPop === 'menu'}
						<TaskMenuPopover
							{canDelete}
							ondelete={() => void deleteTask()}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>
				<IconButton size={31} ariaLabel={m.common_close()} onclick={onclose}
					><Icon name="x" size={15} /></IconButton
				>
			</div>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-24">
			<!-- Title. A hidden replica of the text (::after, see .title-grow) sits in
			     the same grid cell as the textarea and sizes it from CSS, so the
			     height is right even when the font swaps in late or the drawer
			     narrows — measuring scrollHeight once at mount left it clipped. Both
			     layers are pinned to the column width and wrap anywhere, so a long
			     title can't run past the drawer's padding. -->
			<div class="title-grow mb-4" data-title={draft.title}>
				<textarea
					value={draft.title}
					rows="1"
					placeholder={m.tasks_untitled()}
					readonly={!canEdit}
					oninput={(e) => {
						if (draft) draft.title = e.currentTarget.value;
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
					class="text-text outline-none placeholder:text-text-4"
				></textarea>
			</div>

			<!-- Chip row: status, due countdown, priority, type and tags — the
			     task's state at a glance, each opening its picker. -->
			<div class="mb-4 flex flex-wrap items-center gap-1.5">
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('status')}
						disabled={!canEdit}
						class="inline-flex h-7 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-[13px] font-medium transition-[filter] disabled:cursor-default {canEdit
							? 'hover:brightness-125'
							: ''} {openPop === 'status' ? OPEN_RING : ''}"
						style:background="{status.dot}1f"
						style:color={status.dot}
					>
						<StatusDot status={draft.status} size={12} />
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

				{#if dueChip}
					<span
						class="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium {DUE_CHIP[
							dueChip.tone
						] ?? ''}"
						title={draft.due ? formatDateLong(draft.due) : undefined}
					>
						<Icon name="calendar" size={12} />
						{dueChip.label}
					</span>
				{/if}

				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('priority')}
						disabled={!canEdit}
						class="{CHIP} {CHIP_INTERACTIVE} {openPop === 'priority' ? OPEN_RING : ''}"
					>
						{#if prio.bars > 0}<PriorityBars priority={draft.priority} />{/if}
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

				{#if taskType}
					<div class="relative">
						<button
							type="button"
							onclick={() => toggle('type')}
							disabled={!canEdit}
							class="{CHIP} {CHIP_INTERACTIVE} {openPop === 'type' ? OPEN_RING : ''}"
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

				{#each draft.labels as l (l)}
					{@const meta = labelMeta(l)}
					<button
						type="button"
						onclick={() => toggle('tags')}
						disabled={!canEdit}
						class="{CHIP} {CHIP_INTERACTIVE}"
					>
						<span class="h-2 w-2 shrink-0 rounded-full" style:background={meta.color}></span>
						<span class="max-w-[160px] truncate">{meta.label}</span>
					</button>
				{/each}
				{#if canEdit}
					<div class="relative">
						<button
							type="button"
							onclick={() => toggle('tags')}
							aria-label={m.tasks_add_tag()}
							title={m.tasks_add_tag()}
							class="{CHIP} {CHIP_INTERACTIVE} text-text-3 {openPop === 'tags' ? OPEN_RING : ''}"
						>
							<Icon name="plus" size={13} />
							{#if draft.labels.length === 0}<span>{m.tasks_add_tags()}</span>{/if}
						</button>
						{#if openPop === 'tags'}
							<TagsPopover
								value={draft.labels}
								suggestions={tagSuggestions}
								kind="task"
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

			<!-- Description needs the fetched detail; the rest above and the
			     properties below render from the list row right away. -->
			{#if task}
				{#if canEdit}
					{#key draft.id}
						<div class="mb-5">
							<RichTextInput
								value={draft.description ?? ''}
								onchange={(v) => {
									if (draft) draft.description = v || undefined;
								}}
								onblur={() => {
									const next = draft?.description ?? '';
									const current = task?.description ?? '';
									if (next === current) return;
									void patch('description', { description: next });
								}}
								placeholder={m.tasks_description_placeholder()}
								flavor="document"
								mentions={false}
								rows={2}
								maxRows={16}
								class="w-full border-0 bg-transparent text-[14px] leading-relaxed text-text-2"
							/>
						</div>
					{/key}
				{:else if draft.description}
					<MentionText
						text={draft.description}
						flavor="document"
						class="mb-5 text-[14px] leading-relaxed text-text-2"
					/>
				{/if}
			{/if}

			<TaskTimeCard task={draft} onlog={logTime} defaultDate={logDate} />

			<!-- Properties: one label / value row each; values open their picker. -->
			<div class="mb-5">
				<PropertyRow label={m.tasks_panel_assignees()}>
					<button
						type="button"
						onclick={() => toggle('assignees')}
						disabled={!canEdit}
						class="{PROP_VALUE} {openPop === 'assignees' ? OPEN_RING : ''}"
					>
						{#if assignees.length === 1}
							<Avatar user={assignees[0]} size={20} />
							<span class="truncate">{assignees[0]?.name}</span>
						{:else if assignees.length === 0}
							<span class="text-text-3">{m.common_unassigned()}</span>
						{:else}
							<AvatarStack users={assignees} size={20} max={3} overlap={5} />
							<span class="truncate">{m.tasks_n_assignees({ n: assignees.length })}</span>
						{/if}
					</button>
					{#if openPop === 'assignees'}
						<AssigneePopover
							internalOnly
							value={assigneeIds}
							onchange={(v) => {
								if (draft) {
									draft.assignees = v;
									draft.assignee = v[0] ?? '';
								}
								void patch('assignees', { assignees: v });
							}}
							onclose={() => (openPop = null)}
							users={providedUsers}
						/>
					{/if}
				</PropertyRow>

				<PropertyRow label={m.tasks_panel_project()}>
					<span class="inline-flex max-w-full items-center gap-2 px-2 py-1 text-[14px] text-text">
						<span class="h-2 w-2 shrink-0 rounded-full" style:background={project.color}></span>
						<span class="truncate">{project.name}</span>
					</span>
				</PropertyRow>

				{#if draft.startDate}
					<PropertyRow label={m.tasks_panel_start()}>
						<span class="inline-flex px-2 py-1 font-mono text-[14px] text-text"
							>{formatDateLong(draft.startDate)}</span
						>
					</PropertyRow>
				{/if}

				<PropertyRow label={m.tasks_panel_due()}>
					<button
						type="button"
						onclick={() => toggle('due')}
						disabled={!canEdit}
						class="{PROP_VALUE} {openPop === 'due' ? OPEN_RING : ''}"
					>
						{#if draft.due}
							<span class="font-mono {dueChip ? DUE_TEXT[dueChip.tone] : ''}"
								>{formatDateLong(draft.due)}</span
							>
						{:else}
							<span class="text-text-3">{m.tasks_panel_set_due()}</span>
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
				</PropertyRow>

				<PropertyRow label={m.tasks_panel_plan()}>
					<button
						type="button"
						onclick={() => toggle('plan')}
						class="{PROP_VALUE} {openPop === 'plan' ? OPEN_RING : ''}"
					>
						{#if draft.plannedFor}
							<Icon name="bookmark" size={13} class="text-accent" />
							<span class="font-mono">{formatDateLong(draft.plannedFor)}</span>
						{:else if draft.inMyPlan}
							<Icon name="bookmark" size={13} class="text-accent" />
							<span>{m.tasks_in_my_week()}</span>
						{:else}
							<span class="text-text-3">{m.tasks_panel_set_plan()}</span>
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
				</PropertyRow>

				<PropertyRow label={m.tasks_panel_estimate_label()}>
					<button
						type="button"
						onclick={() => toggle('estimate')}
						disabled={!canEdit}
						class="{PROP_VALUE} {openPop === 'estimate' ? OPEN_RING : ''}"
					>
						{#if draft.estimate}
							<span class="font-mono">{formatEstimate(draft.estimate)}</span>
						{:else}
							<span class="text-text-3">{m.tasks_panel_set_estimate()}</span>
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
				</PropertyRow>
			</div>

			{#if isBlocked}
				<div
					class="mb-5 rounded-lg border border-l-[3px] border-border border-l-[var(--color-status-paused)] bg-surface px-3 py-2.5"
					role="status"
				>
					<div class="flex items-start gap-2 text-[13px] leading-snug text-text-2">
						<span class="mt-px shrink-0 text-[var(--color-status-paused)]">
							<Icon name="alert-triangle" size={14} />
						</span>
						<span>
							{dependsOn.length === 1
								? m.tasks_blocked_banner_one()
								: m.tasks_blocked_banner({
										open: openPrerequisites.length,
										total: dependsOn.length
									})}
						</span>
					</div>
				</div>
			{/if}

			<!-- Everything below needs the fetched detail (checklist items, files,
			     dependents, comments, time logs). -->
			{#if task}
				<Checklist
					items={checklistItems}
					{canEdit}
					label={m.tasks_checklist()}
					addPlaceholder={m.tasks_checklist_add()}
					onChange={onChecklistChange}
					variant="panel"
					addLabel={m.tasks_panel_add_item()}
				/>

				{#if draft.uuid}
					<section class="mb-6">
						<SectionHeader label={m.tasks_attachments()} count={draft.files?.length ?? 0}>
							{#snippet action()}
								<AttachmentUploader
									bind:this={taskAttachmentUploader}
									entityType="task"
									entityId={draft!.uuid!}
									dropzone={false}
									variant="section"
									label={m.tasks_panel_add_file()}
									onuploaded={() => void refresh()}
								/>
							{/snippet}
						</SectionHeader>
						{#if draft.files?.length}
							<AttachmentList
								attachments={draft.files}
								canDelete={canEdit}
								currentUserId={(page.data as { currentUserId?: string }).currentUserId ?? null}
								ondeleted={() => void refresh()}
							/>
						{:else}
							<p class="text-[13px] text-text-3">{m.tasks_no_files_attached()}</p>
						{/if}
					</section>
				{/if}

				{#if isTeam && draft.uuid}
					<section class="mb-6">
						<SectionHeader label={m.notes_section_meetings()} count={meetingNotes.length}>
							{#snippet action()}
								{#if taskProjectId}
									<button
										type="button"
										onclick={() => (newMeetingOpen = true)}
										class={SECTION_ACTION}
									>
										<Icon name="plus" size={13} />
										{m.tasks_panel_add_note()}
									</button>
								{/if}
							{/snippet}
						</SectionHeader>
						{#if meetingNotes.length}
							<div class="grid gap-1.5">
								{#each meetingNotes as n (n.id)}
									<a href="/notes/{n.id}" class="group {ROW_CARD}">
										<Icon name="users" size={15} class="shrink-0 text-text-3" />
										<span class="min-w-0 flex-1">
											<span class="block truncate text-[14px] text-text-2 group-hover:text-text"
												>{n.title || m.notes_untitled()}</span
											>
											{#if n.meetingDate}
												<span class="block text-[12px] text-text-4"
													>{meetingDateLabel(n.meetingDate)}</span
												>
											{/if}
										</span>
										<Icon name="chevron-r" size={13} class="shrink-0 text-text-4" />
									</a>
								{/each}
							</div>
						{:else}
							<p class="text-[13px] text-text-3">{m.notes_task_no_meetings()}</p>
						{/if}
					</section>
				{/if}

				{#if draft.uuid && (linked.length > 0 || canEdit)}
					<section class="mb-6">
						<SectionHeader label={m.tasks_panel_linked()} count={linked.length}>
							{#snippet action()}
								{#if canEdit}
									<button
										type="button"
										onclick={() => toggle('deps')}
										class="{SECTION_ACTION} {openPop === 'deps' ? OPEN_RING : ''}"
									>
										<Icon name="plus" size={13} />
										{m.tasks_panel_add_link()}
									</button>
									{#if openPop === 'deps'}
										<DependencyPopover
											projectKey={draft!.project}
											value={dependsOn.map((d) => d.uuid)}
											exclude={[draft!.uuid!, ...dependents.map((d) => d.uuid)]}
											seed={dependencySeed}
											ontoggle={toggleDependency}
											onclose={() => (openPop = null)}
										/>
									{/if}
								{/if}
							{/snippet}
						</SectionHeader>
						{#if linked.length}
							<div class="grid gap-1.5">
								{#each linked as item (item.key)}
									<div
										class="group/link {ROW_CARD} {item.status && isClosedStatus(item.status)
											? 'opacity-70'
											: ''}"
									>
										<a
											href={item.href}
											onclick={(e) => {
												if (item.kind !== 'ticket') openTask(e, item.ref);
											}}
											class="flex min-w-0 flex-1 items-center gap-2.5"
										>
											{#if item.status}
												<StatusDot status={item.status} size={13} />
											{:else}
												<Icon
													name={item.kind === 'ticket' ? 'ticket' : 'chevron-r'}
													size={14}
													class="shrink-0 text-text-3"
												/>
											{/if}
											<span class="min-w-0 flex-1">
												<span
													class="block truncate text-[14px] text-text-2 group-hover/link:text-text"
													>{item.title}</span
												>
												<span class="block truncate text-[12px] text-text-4">
													{LINK_KIND_LABEL[
														item.kind
													]()}{#if item.kind === 'prerequisite' || item.kind === 'dependent'}
														· <span class="font-mono">{item.ref}</span>{/if}{#if item.status}
														· {statusLabel(item.status)}{/if}
												</span>
											</span>
										</a>
										{#if item.blocking}
											<span
												class="shrink-0 rounded-md bg-[color-mix(in_srgb,var(--color-status-paused)_16%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-status-paused)]"
												>{m.tasks_panel_blocked()}</span
											>
										{/if}
										{#if item.removable && canEdit}
											{@const dep = dependsOn.find((d) => d.uuid === item.uuid)}
											{#if dep}
												<button
													type="button"
													aria-label={m.tasks_remove_prerequisite()}
													title={m.tasks_remove_prerequisite()}
													onclick={() => toggleDependency(dep)}
													class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-text-3 opacity-0 transition-opacity group-hover/link:opacity-100 hover:bg-surface-2 hover:text-text focus-visible:opacity-100"
												>
													<Icon name="x" size={13} />
												</button>
											{/if}
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-[13px] text-text-3">{m.tasks_panel_no_links()}</p>
						{/if}
					</section>
				{/if}

				<section>
					<SectionHeader label={m.tasks_activity()} />
					<div class="space-y-3">
						{#each events as e (e.id)}
							{@const u = resolveUser(e.user)}
							<div>
								<div class="flex items-center gap-2.5 text-[13px] text-text-2">
									{#if e.kind === 'created'}
										<span
											class="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-border text-text-3"
										>
											<Icon name="plus" size={12} />
										</span>
									{:else}
										<Avatar user={u} size={22} />
									{/if}
									<span class="min-w-0 flex-1 truncate">
										<span class="font-medium text-text">{u?.name ?? e.user}</span>
										{#if e.kind === 'comment'}{m.tasks_event_commented()}
										{:else if e.kind === 'time'}{m.tasks_event_logged()}
											<span class="font-mono font-medium text-text"
												>{formatEstimate(e.data.minutes)}</span
											>
										{:else if e.kind === 'created'}{m.tasks_event_created()}
										{/if}
									</span>
									<span class="shrink-0 font-mono text-[12px] text-text-4">{e.date}</span>
								</div>
								{#if e.kind === 'comment'}
									<div
										class="mt-2 ml-[32px] rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap text-text"
									>
										<MentionText text={e.data} />
									</div>
									{#if e.files?.length}
										<div class="mt-2 ml-[32px]">
											<AttachmentList
												attachments={e.files}
												canDelete={canEdit}
												currentUserId={(page.data as { currentUserId?: string }).currentUserId ??
													null}
												ondeleted={() => void refresh()}
											/>
										</div>
									{/if}
								{:else if e.kind === 'time' && e.data.note}
									<div class="mt-1 ml-[32px] text-[13px] text-text-3 italic">{e.data.note}</div>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{:else if loading}
				<div class="space-y-3 py-1" aria-busy="true" aria-live="polite">
					<div class="h-3.5 w-11/12 animate-pulse rounded bg-surface"></div>
					<div class="h-3.5 w-4/5 animate-pulse rounded bg-surface"></div>
					<div class="h-3.5 w-2/3 animate-pulse rounded bg-surface"></div>
					<div class="mt-6 h-3 w-24 animate-pulse rounded bg-surface"></div>
					<div class="h-9 w-full animate-pulse rounded-xl bg-surface"></div>
				</div>
			{/if}

			<div
				class="mt-8 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4 text-[12px] text-text-4"
			>
				{#if draft.createdBy}<span
						>{m.tasks_created_by()}
						<span class="text-text-2">{resolveUser(draft.createdBy)?.name ?? '—'}</span></span
					>{/if}
				{#if draft.createdAt}<span
						>{m.tasks_created()}
						<span class="font-mono text-text-3">{draft.createdAt}</span></span
					>{/if}
				<span>{m.tasks_updated()} <span class="font-mono text-text-3">{draft.updated}</span></span>
				{#if draft.channel}<span
						>{m.tasks_meta_channel()}
						<span class="text-text-2">{taskChannelLabel(draft.channel)}</span></span
					>{/if}
			</div>
		</div>

		<div class="border-t border-border p-3">
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
					variant="inline"
					placeholder={m.tasks_write_a_comment()}
					sending={commentSending}
					onsend={sendComment}
					projectId={taskProjectId}
					refTypes={['task', 'ticket', 'project']}
				>
					{#snippet rightActions()}
						<button
							type="button"
							aria-label={m.tasks_attach_files()}
							title={m.tasks_attach_files()}
							onclick={() => commentFileInput?.click()}
							class="grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
						>
							<Icon name="paperclip" size={15} />
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

<style>
	.title-grow {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		font-size: 22px;
		line-height: 1.25;
		font-weight: 600;
		letter-spacing: -0.012em;
	}
	.title-grow::after {
		content: attr(data-title) ' ';
		visibility: hidden;
		pointer-events: none;
	}
	.title-grow > textarea,
	.title-grow::after {
		grid-area: 1 / 1 / 2 / 2;
		min-width: 0;
		width: 100%;
		max-width: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		font: inherit;
		letter-spacing: inherit;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		overflow: hidden;
		resize: none;
	}
</style>
