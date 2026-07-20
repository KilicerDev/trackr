<script lang="ts">
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import AvatarStack from '$lib/components/AvatarStack.svelte';
	import AssigneePopover from '$lib/components/popovers/AssigneePopover.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import MentionText from '$lib/components/MentionText.svelte';
	import Checklist from '$lib/components/Checklist.svelte';
	import PriorityBars from '$lib/components/PriorityBars.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '$lib/config/taxonomy';
	import type { TicketRow, TicketMessageRow } from '$lib/server/tickets';
	import AttachmentList from '$lib/components/attachments/AttachmentList.svelte';
	import AttachmentUploader from '$lib/components/attachments/AttachmentUploader.svelte';
	import AttachmentDropzone from '$lib/components/attachments/AttachmentDropzone.svelte';
	import StagedFileList from '$lib/components/attachments/StagedFileList.svelte';
	import { selectStageable, type AttachmentDTO } from '$lib/config/attachments';
	import { m } from '$lib/paraglide/messages';
	import {
		ticketStatusLabel,
		ticketCategoryLabel,
		ticketChannelLabel,
		priorityLabel
	} from '$lib/utils/labels';
	import CreateTaskModal from '$lib/components/tasks/CreateTaskModal.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';
	import type { TypeId } from '$lib/types';

	type PageData = {
		ticket: TicketRow;
		messages: TicketMessageRow[];
		isAgent: boolean;
		canUseInternalNotes: boolean;
		attachments: AttachmentDTO[];
		messageAttachments: Record<string, AttachmentDTO[]>;
		currentUserId: string;
		isPinned: boolean;
		isPortalUser: boolean;
		participants: { id: string; name: string; initials: string; color: string }[];
		users?: { id: string; name: string; initials: string; color: string }[];
		assignableUsers?: { id: string; name: string; initials: string; color: string }[];
		mentionUsers?: {
			id: string;
			name: string;
			email: string;
			initials: string;
			color: string;
			status: 'active' | 'invited' | 'disabled';
			internal: boolean;
		}[];
		canCreateTask: boolean;
		canEditChecklist: boolean;
		linkedTasks: { id: string; displayId: string; title: string; status: string }[];
		sourceChat: { threadId: string; orgId: string; title: string | null } | null;
	};
	let { data }: { data: PageData } = $props();

	// Names of everyone on this ticket, resolved server-side. Prefer this over the
	// global directory lookup so an assigned agent (not in a client's org) still
	// renders by name rather than "Unassigned"/"Unknown".
	const participantMap = $derived(new Map(data.participants.map((p) => [p.id, p])));
	function who(id: string | null | undefined) {
		if (!id) return undefined;
		return participantMap.get(id) ?? resolveUser(id);
	}

	let pinPending = $state(false);
	async function togglePin() {
		if (pinPending) return;
		pinPending = true;
		const fd = new FormData();
		fd.set('id', t.id);
		try {
			const res = await fetch(`/tickets?/${data.isPinned ? 'pinRemove' : 'pinAdd'}`, {
				method: 'POST',
				body: fd
			});
			if (!res.ok) throw new Error(m.tickets_pin_failed());
			await invalidateAll();
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.tickets_pin_failed());
		} finally {
			pinPending = false;
		}
	}

	const t = $derived(data.ticket);
	// Surfaced only when arriving from the tickets overview side panel ("Open
	// conversation"); links back to the overview with the panel reopened.
	const fromPanel = $derived(page.url.searchParams.get('from') === 'panel');
	const statusMeta = $derived(TICKET_STATUSES.find((s) => s.id === t.status));
	const priorityMeta = $derived(TICKET_PRIORITIES.find((p) => p.id === t.priority));
	const categoryMeta = $derived(TICKET_CATEGORIES.find((c) => c.id === t.category));
	const assigneeUsers = $derived((t.assignees ?? []).map((id) => who(id)));
	const customer = $derived(who(t.customerId));

	// Opening a ticket clears any unread bell items pointing at it. Done here
	// (client-side, re-firing when the ticket id changes) rather than in the
	// server load: the load also runs during hover-preloading, so doing it there
	// would mark the ticket read just by hovering its link. After the write we
	// invalidate the shared notifications key so the bell + inbox refresh in sync.
	$effect(() => {
		const ticketId = t.id;
		void fetch('/api/notifications/read', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ entityType: 'ticket', entityId: ticketId })
		})
			.then(() => invalidate('app:notifications'))
			.catch(() => {});
	});

	let pop = $state<'status' | 'priority' | 'category' | 'assignee' | null>(null);
	let pending = $state(false);

	async function patch(
		field: 'status' | 'priority' | 'category' | 'assignees',
		value: string | string[] | null,
		opts: { keepOpen?: boolean } = {}
	) {
		pending = true;
		const fd = new FormData();
		fd.set('id', t.id);
		if (Array.isArray(value)) {
			for (const v of value) fd.append(field, v);
			// Keep the field present when clearing, so the server writes the empty set.
			if (value.length === 0) fd.append(field, '');
		} else {
			fd.set(field, value ?? '');
		}
		try {
			const res = await fetch('/tickets?/update', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(m.tickets_update_failed());
			// Multi-select pickers (assignees) stay open across toggles.
			if (!opts.keepOpen) pop = null;
			await invalidateAll();
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.tickets_update_failed());
		} finally {
			pending = false;
		}
	}

	// ─── Checklist (shared, participant-editable) ─────────────────────────────
	// Optimistic local copy, resynced from the server after each save/invalidate.
	let checklist = $state(data.ticket.checklist);
	$effect(() => {
		checklist = data.ticket.checklist;
	});

	async function saveChecklist(items: { id: string; text: string; done: boolean }[]) {
		checklist = items; // optimistic
		const fd = new FormData();
		fd.set('id', t.id);
		fd.set('checklist', JSON.stringify(items));
		try {
			const res = await fetch('/tickets?/checklist', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(m.tickets_update_failed());
			await invalidateAll();
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.tickets_update_failed());
			await invalidateAll(); // revert to server truth
		}
	}

	// ─── Composer ───────────────────────────────────────────────────────────
	let body = $state('');
	let internal = $state(false);
	let sending = $state(false);
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

	async function send() {
		const text = body.trim();
		// Allow a files-only reply (attachment with no text).
		if ((!text && commentFiles.length === 0) || sending) return;
		sending = true;
		const fd = new FormData();
		fd.set('id', t.id);
		fd.set('body', text || (commentFiles.length ? '(attachment)' : ''));
		fd.set('internal', internal ? '1' : '0');
		for (const file of commentFiles) fd.append('attachments', file);
		try {
			const res = await fetch('/tickets?/message', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(m.tickets_send_failed());
			body = '';
			internal = false;
			commentFiles = [];
			await invalidateAll();
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.tickets_send_failed());
		} finally {
			sending = false;
		}
	}

	// ─── Activity events (timeline) ─────────────────────────────────────────
	type TimelineEvent =
		| { id: string; kind: 'created'; at: string; userId: string | null }
		| {
				id: string;
				kind: 'message';
				at: string;
				userId: string | null;
				body: string;
				internal: boolean;
		  }
		| {
				id: string;
				kind: 'system';
				at: string;
				userId: string | null;
				internal: boolean;
				meta: Record<string, unknown>;
		  };

	const events = $derived.by<TimelineEvent[]>(() => {
		const out: TimelineEvent[] = [
			{ id: '__created', kind: 'created', at: t.createdAt, userId: t.customerId }
		];
		for (const msg of data.messages) {
			if (msg.kind === 'system') {
				out.push({
					id: msg.id,
					kind: 'system',
					at: msg.createdAt,
					userId: msg.authorId,
					internal: msg.isInternalNote,
					meta: msg.meta ?? {}
				});
			} else {
				out.push({
					id: msg.id,
					kind: 'message',
					at: msg.createdAt,
					userId: msg.authorId,
					body: msg.body,
					internal: msg.isInternalNote
				});
			}
		}
		return out.sort((a, b) => a.at.localeCompare(b.at));
	});

	// Renders a `kind='system'` event's `meta` payload into a localized sentence.
	// Written per-viewer (not stored) so each user reads it in their own language.
	function names(ids: unknown): string {
		if (!Array.isArray(ids)) return '';
		return ids.map((id) => who(String(id))?.name ?? m.tickets_unknown_user()).join(', ');
	}

	function systemText(meta: Record<string, unknown>): string {
		const from = String(meta.from ?? '');
		const to = String(meta.to ?? '');
		switch (meta.event) {
			case 'status_changed':
				return m.tickets_event_status_changed({
					from: ticketStatusLabel(from),
					to: ticketStatusLabel(to)
				});
			case 'priority_changed':
				return m.tickets_event_priority_changed({
					from: priorityLabel(from),
					to: priorityLabel(to)
				});
			case 'category_changed':
				return m.tickets_event_category_changed({
					from: ticketCategoryLabel(from),
					to: ticketCategoryLabel(to)
				});
			case 'assigned': {
				const parts: string[] = [];
				const added = meta.added as unknown[] | undefined;
				const removed = meta.removed as unknown[] | undefined;
				if (added?.length) parts.push(m.tickets_event_assigned({ names: names(added) }));
				if (removed?.length) parts.push(m.tickets_event_unassigned({ names: names(removed) }));
				return parts.join(', ');
			}
			case 'edited': {
				const parts: string[] = [];
				if (meta.subject) parts.push(m.tickets_event_renamed());
				if (meta.tags) parts.push(m.tickets_event_tags_updated());
				return parts.join(', ');
			}
			default:
				return '';
		}
	}

	function relTime(iso: string): string {
		const ts = new Date(iso).getTime();
		const diff = Date.now() - ts;
		const mins = Math.floor(diff / 60_000);
		if (mins < 1) return m.tickets_just_now();
		if (mins < 60) return m.tickets_min_ago({ m: mins });
		const h = Math.floor(mins / 60);
		if (h < 24) return m.tickets_hour_ago({ h });
		const d = Math.floor(h / 24);
		if (d < 7) return m.tickets_day_ago({ d });
		return new Date(iso).toLocaleDateString();
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const isAgent = $derived(data.isAgent);
	// Assignee candidates: org members (clients/agents/members) + platform agents.
	const users = $derived(data.assignableUsers ?? []);

	// Deletion is admin-only. effectivePermissions is the workspace-wide union
	// (UI gating only); the server re-checks org.tickets.delete.any per-org.
	const canDelete = $derived(
		((page.data.effectivePermissions as string[] | undefined) ?? []).includes(
			'org.tickets.delete.any'
		)
	);

	async function deleteTicket() {
		const ok = await uiConfirm({
			title: m.tickets_delete_confirm_title({ displayId: t.displayId }),
			message: m.tickets_delete_confirm_message({ subject: t.subject }),
			confirmLabel: m.tickets_delete_confirm_label(),
			tone: 'danger',
			icon: 'trash'
		});
		if (!ok) return;
		const fd = new FormData();
		fd.set('id', t.id);
		try {
			const res = await fetch('/tickets?/delete', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(m.tickets_delete_failed());
			await goto('/tickets');
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.tickets_delete_failed());
		}
	}

	// ─── Convert ticket → task (team-only) ────────────────────────────────────
	let creatingTask = $state(false);

	// Map ticket category onto a sensible default task type for the prefill.
	function taskTypeForCategory(category: string): TypeId {
		if (category === 'feature_request') return 'feature';
		if (category === 'technical_issue') return 'bug';
		return 'task';
	}
	const taskPrefill = $derived({
		title: t.subject,
		description: t.description,
		priority: t.priority,
		type: taskTypeForCategory(t.category)
	});
</script>

<svelte:head>
	<title>{m.tickets_detail_page_title({ displayId: t.displayId, subject: t.subject })}</title>
</svelte:head>

<Topbar
	crumbs={data.isPortalUser
		? [{ label: t.orgName }, { label: t.displayId }]
		: [
				{ label: m.tickets_breadcrumb_workspace(), href: '/tasks' },
				{ label: m.tickets_breadcrumb_support(), href: '/tickets' },
				{ label: t.displayId }
			]}
/>

<div class="flex min-h-0 flex-1">
	<!-- Left column: conversation + composer -->
	<div class="flex min-w-0 flex-1 flex-col">
		<div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
			<div class="mx-auto w-full max-w-[836px] px-6 py-6">
				{#if fromPanel}
					<a
						href="/tickets?ticket={t.id}"
						class="mb-3 inline-flex items-center gap-1.5 text-[13px] text-text-3 transition-colors hover:text-text"
					>
						<Icon name="chevron-r" size={14} class="rotate-180" />
						{m.tickets_back_to_overview()}
					</a>
				{/if}
				<!-- Header -->
				<div class="mb-1 flex items-center gap-2 text-[12px] text-text-3">
					<span class="font-mono text-text-4">{t.displayId}</span>
					<span class="inline-flex items-center gap-1.5">
						<span class="h-1.5 w-1.5 rounded-full" style:background={t.orgColor}></span>
						<span>{t.orgName}</span>
					</span>
					<div class="ml-auto flex items-center gap-2">
						<button
							type="button"
							onclick={togglePin}
							disabled={pinPending}
							aria-pressed={data.isPinned}
							title={data.isPinned ? m.tickets_unpin() : m.tickets_pin()}
							class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors disabled:opacity-50 {data.isPinned
								? 'border-accent/40 bg-accent/10 text-accent'
								: 'border-border bg-surface text-text-2 hover:border-border-strong hover:text-text'}"
						>
							<Icon name="bookmark" size={15} />
							<span>{data.isPinned ? m.tickets_pinned() : m.tickets_pin_short()}</span>
						</button>
						{#if data.canCreateTask}
							<button
								type="button"
								onclick={() => (creatingTask = true)}
								class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] text-text-2 transition-colors hover:border-border-strong hover:text-text"
							>
								<Icon name="plus" size={15} />
								<span>{m.tickets_create_task()}</span>
							</button>
						{/if}
						{#if canDelete}
							<button
								type="button"
								onclick={deleteTicket}
								class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] text-text-2 transition-colors hover:border-[#ef4f5e]/40 hover:bg-[#ef4f5e]/10 hover:text-[#ef4f5e]"
							>
								<Icon name="trash" size={15} />
								<span>{m.tickets_delete()}</span>
							</button>
						{/if}
					</div>
				</div>
				<h1 class="mb-4 text-[26px] leading-tight font-semibold tracking-[-0.012em] text-text">
					{t.subject}
				</h1>

				<!-- Properties rail -->
				<div class="mb-6 flex flex-wrap gap-2">
					<!-- Status -->
					<div class="relative">
						<button
							type="button"
							disabled={!isAgent}
							onclick={() => (pop = pop === 'status' ? null : 'status')}
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {isAgent
								? 'hover:border-border-strong'
								: ''} {pop === 'status' ? 'ring-2 ring-accent/40' : ''}"
						>
							<span class="h-2 w-2 rounded-full" style:background={statusMeta?.dot ?? '#7c7c84'}
							></span>
							<span>{ticketStatusLabel(t.status)}</span>
						</button>
						{#if pop === 'status'}
							<div
								use:clickOutside={() => (pop = null)}
								in:fly={POPOVER_IN}
								class="absolute top-full left-0 z-50 mt-1.5 min-w-[220px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
							>
								{#each TICKET_STATUSES as s (s.id)}
									<button
										type="button"
										disabled={pending}
										onclick={() => patch('status', s.id)}
										class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
									>
										<span class="h-2 w-2 rounded-full" style:background={s.dot}></span>
										<span class="text-[14px]">{ticketStatusLabel(s.id)}</span>
										<span
											class="ml-auto text-accent {t.status === s.id ? 'opacity-100' : 'opacity-0'}"
										>
											<Icon name="check" size={14} />
										</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Priority -->
					<div class="relative">
						<button
							type="button"
							disabled={!isAgent}
							onclick={() => (pop = pop === 'priority' ? null : 'priority')}
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {isAgent
								? 'hover:border-border-strong'
								: ''} {pop === 'priority' ? 'ring-2 ring-accent/40' : ''}"
						>
							<PriorityBars priority={t.priority} />
							<span>{priorityLabel(t.priority)}</span>
						</button>
						{#if pop === 'priority'}
							<div
								use:clickOutside={() => (pop = null)}
								in:fly={POPOVER_IN}
								class="absolute top-full left-0 z-50 mt-1.5 min-w-[176px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
							>
								{#each TICKET_PRIORITIES as p (p.id)}
									<button
										type="button"
										disabled={pending}
										onclick={() => patch('priority', p.id)}
										class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
									>
										<PriorityBars priority={p.id} />
										<span class="text-[14px]">{priorityLabel(p.id)}</span>
										<span
											class="ml-auto text-accent {t.priority === p.id
												? 'opacity-100'
												: 'opacity-0'}"
										>
											<Icon name="check" size={14} />
										</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Category -->
					<div class="relative">
						<button
							type="button"
							disabled={!isAgent}
							onclick={() => (pop = pop === 'category' ? null : 'category')}
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {isAgent
								? 'hover:border-border-strong'
								: ''} {pop === 'category' ? 'ring-2 ring-accent/40' : ''}"
						>
							<span class="h-2 w-2 rounded-full" style:background={categoryMeta?.color ?? '#7c7c84'}
							></span>
							<span>{ticketCategoryLabel(t.category)}</span>
						</button>
						{#if pop === 'category'}
							<div
								use:clickOutside={() => (pop = null)}
								in:fly={POPOVER_IN}
								class="absolute top-full left-0 z-50 mt-1.5 min-w-[198px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
							>
								{#each TICKET_CATEGORIES as c (c.id)}
									<button
										type="button"
										disabled={pending}
										onclick={() => patch('category', c.id)}
										class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
									>
										<span class="h-2 w-2 rounded-full" style:background={c.color}></span>
										<span class="text-[14px]">{ticketCategoryLabel(c.id)}</span>
										<span
											class="ml-auto text-accent {t.category === c.id
												? 'opacity-100'
												: 'opacity-0'}"
										>
											<Icon name="check" size={14} />
										</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Assignee -->
					<div class="relative">
						<button
							type="button"
							disabled={!isAgent}
							onclick={() => (pop = pop === 'assignee' ? null : 'assignee')}
							class="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {assigneeUsers.length
								? 'border border-border bg-surface'
								: 'border border-dashed border-border text-text-3'} {isAgent
								? assigneeUsers.length
									? 'hover:border-border-strong'
									: 'hover:border-border-strong hover:text-text'
								: ''} {pop === 'assignee' ? 'ring-2 ring-accent/40' : ''}"
						>
							{#if assigneeUsers.length === 1}
								<Avatar user={assigneeUsers[0]} size={20} />
								<span>{assigneeUsers[0]?.name ?? m.common_unassigned()}</span>
							{:else if assigneeUsers.length > 1}
								<AvatarStack users={assigneeUsers} size={20} max={3} overlap={6} />
								<span>{m.tickets_n_assignees({ n: assigneeUsers.length })}</span>
							{:else}
								<Icon name="user" size={14} />
								<span>{m.common_unassigned()}</span>
							{/if}
						</button>
						{#if pop === 'assignee'}
							<AssigneePopover
								value={t.assignees}
								{users}
								onchange={(v) => patch('assignees', v, { keepOpen: true })}
								onclose={() => (pop = null)}
							/>
						{/if}
					</div>
				</div>

				<!-- Description (if any) shown as opening message -->
				{#if t.description}
					<div
						class="mb-6 text-[14px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-text"
					>
						<MentionText text={t.description} />
					</div>
				{/if}

				<!-- Details (checklist, attachments, linked tasks) live in the right rail
		     on desktop; on mobile they stack inline here. -->
				<div class="mb-6 lg:hidden">
					{@render detailsRail()}
				</div>

				<!-- Activity timeline -->
				<div class="mt-2">
					<div class="mb-3 text-[12px] tracking-[0.08em] text-text-4 uppercase">
						{m.tickets_activity()}
					</div>
					<div class="relative space-y-4 pl-7">
						<span class="absolute top-2 bottom-2 left-[10px] w-px bg-border"></span>
						{#each events as e (e.id)}
							{@const u = who(e.userId)}
							<div class="relative min-w-0">
								<span
									class="absolute top-0.5 -left-7 grid h-5 w-5 place-items-center rounded-full border border-border bg-bg-elev"
								>
									{#if e.kind === 'created'}
										<Icon name="plus" size={12} />
									{:else}
										<Avatar user={u} size={20} />
									{/if}
								</span>
								<div class="text-[14px] text-text-2">
									<span class="font-medium text-text">{u?.name ?? m.tickets_unknown_user()}</span>
									{#if e.kind === 'created'}
										{m.tickets_opened_this()}
									{:else if e.kind === 'system'}
										{systemText(e.meta)}
										{#if e.internal}
											<span
												class="ml-1 rounded border border-[#e9c46a]/30 bg-[#e9c46a]/8 px-1 text-[11px] text-[#e9c46a]"
												>{m.tickets_internal_note()}</span
											>
										{/if}
									{:else if e.internal}
										{m.tickets_added_internal_note_pre()}
										<span class="text-[#e9c46a]">{m.tickets_internal_note()}</span>
										{m.tickets_added_internal_note_post()}
									{:else}
										{m.tickets_replied()}
									{/if}
									<span class="font-mono text-text-4">· {relTime(e.at)}</span>
								</div>
								{#if e.kind === 'message'}
									<div
										class="mt-2 min-w-0 rounded-lg p-3 text-[14px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap {e.internal
											? 'border border-[#e9c46a]/30 bg-[#e9c46a]/8 text-text'
											: 'border border-border bg-surface text-text'}"
									>
										<MentionText text={e.body} />
									</div>
									{#if data.messageAttachments[e.id]?.length}
										<div class="mt-2">
											<AttachmentList
												attachments={data.messageAttachments[e.id]}
												canDelete={isAgent}
											/>
										</div>
									{/if}
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<!-- Footer meta -->
				<div
					class="mt-8 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4 text-[12px] text-text-4"
				>
					<span>
						{m.tickets_meta_reporter()} <span class="text-text-2">{customer?.name ?? '—'}</span>
					</span>
					<span>
						{m.tickets_meta_channel()}
						<span class="text-text-2">{ticketChannelLabel(t.channel)}</span>
					</span>
					<span>
						{m.tickets_meta_created()}
						<span class="font-mono text-text-3">{fmtDate(t.createdAt)}</span>
					</span>
					<span>
						{m.tickets_meta_first_response()}
						<span class="font-mono text-text-3">{fmtDate(t.firstResponseAt)}</span>
					</span>
					{#if t.resolvedAt}
						<span>
							{m.tickets_meta_resolved()}
							<span class="font-mono text-text-3">{fmtDate(t.resolvedAt)}</span>
						</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Composer docked at the bottom of the conversation column -->
		<div class="px-6 py-3">
			<div class="mx-auto w-full max-w-[836px]">
				<AttachmentDropzone
					onfiles={addCommentFiles}
					disabled={sending}
					label={m.tickets_dropzone_reply()}
				>
					{#if commentFiles.length}
						<div class="mb-2">
							<StagedFileList
								files={commentFiles}
								disabled={sending}
								onremove={(i) => (commentFiles = commentFiles.filter((_, idx) => idx !== i))}
							/>
						</div>
					{/if}
					<Composer
						bind:value={body}
						placeholder={internal
							? m.tickets_composer_internal_placeholder()
							: m.tickets_composer_reply_placeholder()}
						accent={internal ? 'warning' : 'default'}
						mentionUsers={internal
							? data.mentionUsers?.filter((u) => u.internal)
							: data.mentionUsers}
						{sending}
						onsend={send}
					>
						{#snippet rightActions()}
							<button
								type="button"
								aria-label={m.tickets_attach_files()}
								title={m.tickets_attach_files()}
								onclick={() => commentFileInput?.click()}
								class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
							>
								<Icon name="paperclip" size={15} />
							</button>
							{#if data.canUseInternalNotes}
								<button
									type="button"
									aria-label={internal
										? m.tickets_switch_to_reply()
										: m.tickets_switch_to_internal()}
									title={internal
										? m.tickets_internal_note_tooltip()
										: m.tickets_internal_note_agents_only()}
									aria-pressed={internal}
									onclick={() => (internal = !internal)}
									class="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors {internal
										? 'border-[#e9c46a]/40 bg-[#e9c46a]/15 text-[#e9c46a]'
										: 'border-transparent bg-transparent text-text-3 hover:bg-surface-2 hover:text-text'}"
								>
									<Icon name="shield" size={13} />
									<span>{internal ? m.tickets_internal() : m.tickets_public()}</span>
								</button>
							{/if}
						{/snippet}
					</Composer>
					<input
						bind:this={commentFileInput}
						type="file"
						multiple
						hidden
						onchange={onCommentPick}
					/>
				</AttachmentDropzone>
			</div>
		</div>
	</div>

	<!-- Right: details rail (checklist, attachments, linked tasks) -->
	<aside class="hidden w-[374px] shrink-0 overflow-y-auto border-l border-border lg:block">
		<div class="space-y-6 px-5 py-6">
			{@render detailsRail()}
		</div>
	</aside>
</div>

{#if data.canCreateTask}
	<CreateTaskModal
		open={creatingTask}
		action="/tickets/{t.id}?/createTask"
		sourceTicketId={t.id}
		prefill={taskPrefill}
		onclose={() => (creatingTask = false)}
		users={page.data.users}
		projects={page.data.projects}
		currentUserId={page.data.currentUserId}
		memberProjectIds={Object.keys(page.data.memberRoles?.projects ?? {})}
		allAccess={page.data.isTrackrTeam}
		oncreated={(displayId) => showToast('ok', m.tickets_create_task_toast({ ref: displayId }))}
	/>
{/if}

<!-- Shared by the desktop right rail and the mobile inline block. -->
{#snippet detailsRail()}
	<div class="space-y-6">
		<!-- Checklist (shared across all ticket participants) -->
		<Checklist
			items={checklist}
			canEdit={data.canEditChecklist}
			label={m.tasks_checklist()}
			addPlaceholder={m.tasks_checklist_add()}
			onChange={saveChecklist}
		/>

		<!-- Attachments -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">
					{m.tickets_attachments()}{#if data.attachments.length}<span class="ml-1.5 text-text-3"
							>{data.attachments.length}</span
						>{/if}
				</div>
				<AttachmentUploader entityType="ticket" entityId={t.id} />
			</div>
			{#if data.attachments.length}
				<!-- Deletion is agent-only; clients/members can attach but not remove. -->
				<AttachmentList attachments={data.attachments} canDelete={isAgent} />
			{:else}
				<p class="text-[14px] text-text-3">{m.tickets_no_files()}</p>
			{/if}
		</div>

		<!-- Linked tasks (team-only) -->
		{#if data.canCreateTask}
			<div>
				<div class="mb-2 text-[12px] tracking-[0.08em] text-text-4 uppercase">
					{m.tickets_linked_tasks()}{#if data.linkedTasks.length}<span class="ml-1.5 text-text-3"
							>{data.linkedTasks.length}</span
						>{/if}
				</div>
				{#if data.linkedTasks.length}
					<ul class="flex flex-col gap-1">
						{#each data.linkedTasks as lt (lt.id)}
							<li>
								<a
									href="/tasks?task={lt.displayId}"
									class="group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 transition-colors hover:border-border-strong"
								>
									<StatusDot status={lt.status as import('$lib/types').StatusId} size={14} />
									<span class="font-mono text-[12px] text-text-4">{lt.displayId}</span>
									<span class="truncate text-[14px] text-text-2 group-hover:text-text"
										>{lt.title}</span
									>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-[14px] text-text-3">{m.tickets_linked_tasks_empty()}</p>
				{/if}
			</div>
		{/if}

		<!-- Created from a chat thread -->
		{#if data.sourceChat}
			<div>
				<div class="mb-2 text-[12px] tracking-[0.08em] text-text-4 uppercase">
					{m.tickets_source_chat()}
				</div>
				<a
					href="/chat?org={data.sourceChat.orgId}&thread={data.sourceChat.threadId}"
					class="group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 transition-colors hover:border-border-strong"
				>
					<Icon name="msg" size={14} class="shrink-0 text-text-4" />
					<span class="truncate text-[14px] text-text-2 group-hover:text-text">
						{data.sourceChat.title ?? m.chat_untitled()}
					</span>
					<Icon name="link" size={13} class="ml-auto shrink-0 text-text-4" />
				</a>
			</div>
		{/if}
	</div>
{/snippet}
