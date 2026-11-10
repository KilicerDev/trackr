<script lang="ts">
	import { formatDate } from '$lib/utils/format';
	import { brandName, pageTitle } from '$lib/brand';
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import { page } from '$app/state';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import AvatarStack from '$lib/components/AvatarStack.svelte';
	import AssigneePopover from '$lib/components/popovers/AssigneePopover.svelte';
	import TagsPopover from '$lib/components/popovers/TagsPopover.svelte';
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
	import IconButton from '$lib/components/IconButton.svelte';
	import PropertyRow from '$lib/components/tasks/panel/PropertyRow.svelte';
	import SectionHeader from '$lib/components/tasks/panel/SectionHeader.svelte';
	import { OPEN, PROP_VALUE, QUIET_ADD, ROW, TAG } from '$lib/components/tasks/panel/styles';
	import { labelMeta } from '$lib/utils/label-meta';
	import { slaSignal } from '$lib/utils/ticket-sla';
	import { fade, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
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
		tagSuggestions: string[];
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
	const categoryMeta = $derived(TICKET_CATEGORIES.find((c) => c.id === t.category));
	const assigneeUsers = $derived((t.assignees ?? []).map((id) => who(id)));
	// Older API/MCP tickets can have a creator but no customer.
	const reporter = $derived(who(t.customerId ?? t.createdBy));

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

	// Open picker, keyed by placement too ('desktop:status', 'mobile:status'):
	// the property list renders in both the sidebar and the mobile block, and
	// a hidden copy's click-outside must not close the visible one.
	let pop = $state<string | null>(null);
	function togglePop(key: string) {
		pop = pop === key ? null : key;
	}
	let tagsPop = $state<'mobile' | 'desktop' | null>(null);
	let pending = $state(false);

	async function patch(
		field: 'status' | 'priority' | 'category' | 'assignees' | 'tags',
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
			await invalidate('app:tickets');
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
			await invalidate('app:tickets');
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.tickets_update_failed());
			await invalidate('app:tickets'); // revert to server truth
		}
	}

	// ─── Composer ───────────────────────────────────────────────────────────
	let body = $state('');
	let internal = $state(false);
	let sending = $state(false);
	let commentFiles = $state<File[]>([]);

	function addCommentFiles(incoming: File[]) {
		const { accepted, errors } = selectStageable(incoming, commentFiles.length);
		for (const err of errors) showToast('err', err);
		if (accepted.length) commentFiles = [...commentFiles, ...accepted];
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
			// The action header returns the action result as JSON instead of
			// rendering the whole /tickets page around it.
			const res = await fetch('/tickets?/message', {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text()) as ActionResult;
			if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				throw new Error(msg ?? m.tickets_send_failed());
			}
			if (result.type === 'error') throw new Error(m.tickets_send_failed());
			body = '';
			internal = false;
			commentFiles = [];
			await invalidate('app:tickets');
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
			{ id: '__created', kind: 'created', at: t.createdAt, userId: t.createdBy ?? t.customerId }
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

	// Conversation items: messages stay one by one; runs of system events
	// (status/priority/assignee changes) become one group, folded to a single
	// "N changes" line when there are 3 or more, until opened.
	type SystemEvent = Extract<TimelineEvent, { kind: 'system' }>;
	type ConvItem =
		| Exclude<TimelineEvent, { kind: 'system' }>
		| { id: string; kind: 'run'; events: SystemEvent[] };
	const items = $derived.by<ConvItem[]>(() => {
		const out: ConvItem[] = [];
		for (const e of events) {
			if (e.kind === 'system') {
				const last = out[out.length - 1];
				if (last?.kind === 'run') last.events.push(e);
				else out.push({ id: `run:${e.id}`, kind: 'run', events: [e] });
			} else out.push(e);
		}
		return out;
	});
	let openRuns = $state<string[]>([]);
	const FOLD_AT = 3;

	// Team member (internal staff) vs customer, for the "Team" tag on replies.
	const teamIds = $derived(
		new Set((data.mentionUsers ?? []).filter((u) => u.internal).map((u) => u.id))
	);
	const isTeam = (id: string | null) => !!id && teamIds.has(id);

	const sla = $derived(slaSignal(t));
	const idColor = $derived(categoryMeta?.color ?? '#7c7c84');

	// ⋯ menu: create task, copy link (green check for a moment), delete.
	let menuOpen = $state<'mobile' | 'desktop' | null>(null);
	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(`${window.location.origin}/tickets/${t.id}`);
			copied = true;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => {
				copied = false;
				menuOpen = null;
			}, 900);
		} catch {
			menuOpen = null;
			showToast('err', m.tickets_link_copy_failed());
		}
	}

	// The checklist section appears once it has items, or when asked for.
	let checklistOpen = $state(false);

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
		return formatDate(iso);
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return formatDate(iso);
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
	<title>{pageTitle(`${t.displayId} · ${t.subject}`)}</title>
</svelte:head>

<Topbar
	back={{
		href: fromPanel ? `/tickets?ticket=${t.id}` : '/tickets',
		label: m.tickets_back_to_overview()
	}}
	crumbs={data.isPortalUser
		? [{ label: t.orgName }, { label: t.displayId }]
		: [
				{ label: m.shell_workspace_crumb({ brand: brandName() }), href: '/tasks' },
				{ label: m.tickets_breadcrumb_support(), href: '/tickets' },
				{ label: t.displayId }
			]}
/>

<!-- Still unanswered: a full-width banner over the whole ticket. -->
{#if sla && sla.tone === 'wait'}
	<div
		class="flex shrink-0 items-center gap-2.5 border-b border-accent/25 bg-accent-soft px-6 py-2.5 text-[13px] leading-5 text-accent"
		role="status"
	>
		<span class="h-2 w-2 shrink-0 rounded-full" style:background={sla.dot}></span>
		<span class="min-w-0 truncate">{sla.label}</span>
	</div>
{/if}

<!-- Drop files anywhere on the ticket to stage them on the reply. -->
<AttachmentDropzone
	onfiles={addCommentFiles}
	disabled={sending}
	label={m.tickets_dropzone_reply()}
	class="flex min-h-0 flex-1"
>
	<!-- Left: the conversation, with the composer docked under it. -->
	<div class="flex min-w-0 flex-1 flex-col">
		<div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
			<div class="mx-auto w-full max-w-[760px] px-6 pt-6 pb-10">
				<h1 class="text-[24px] leading-tight font-semibold tracking-[-0.012em] text-text">
					{t.subject}
				</h1>

				<!-- Mobile: the properties and sections stack here. -->
				<div class="mt-6 lg:hidden">
					{@render detailsRail('mobile')}
				</div>

				<!-- Conversation -->
				<div class="mt-8 space-y-4">
					{#each items as item (item.id)}
						{#if item.kind === 'run'}
							{@const folded = item.events.length >= FOLD_AT && !openRuns.includes(item.id)}
							{#if folded}
								<button
									type="button"
									onclick={() => (openRuns = [...openRuns, item.id])}
									class="flex items-center gap-2 pl-[7px] text-[12px] text-text-4 transition-colors hover:text-text-2"
								>
									<Icon name="logs" size={14} />
									{m.tickets_n_changes({ n: item.events.length })}
									<Icon name="chevron" size={12} />
								</button>
							{:else}
								<div class="space-y-1.5">
									{#each item.events as e (e.id)}
										{@const u = who(e.userId)}
										<div
											class="flex min-w-0 items-center gap-2 pl-[7px] text-[12px] leading-5 text-text-4"
										>
											<span class="grid h-[14px] w-[14px] shrink-0 place-items-center">
												<Icon name="refresh" size={12} />
											</span>
											<span class="min-w-0 truncate">
												<span class="text-text-3">{u?.name ?? m.tickets_unknown_user()}</span>
												{systemText(e.meta)}
												{#if e.internal}
													<span class="text-[#e9c46a]">· {m.tickets_internal_note()}</span>
												{/if}
											</span>
											<span class="shrink-0">· {relTime(e.at)}</span>
										</div>
									{/each}
								</div>
							{/if}
						{:else}
							{@const u = who(item.userId)}
							{@const isNote = item.kind === 'message' && item.internal}
							<!-- A message card: the opening (with the description) or a
							     reply. Team replies carry a "Team" tag; internal notes stay
							     amber. -->
							<article
								class="rounded-xl border px-4 py-3.5 {isNote
									? 'border-[#e9c46a]/30 bg-[#e9c46a]/[0.06]'
									: 'border-border bg-surface/40'}"
							>
								<header class="flex min-w-0 items-center gap-2.5 text-[13px]">
									{#if u}
										<Avatar user={u} size={28} />
									{:else}
										<span class="h-7 w-7 shrink-0 rounded-full bg-surface-2"></span>
									{/if}
									<span class="truncate font-medium text-text"
										>{u?.name ?? m.tickets_unknown_user()}</span
									>
									{#if isTeam(item.userId)}
										<span
											class="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] leading-none text-text-3"
											>{m.tickets_team_tag()}</span
										>
									{/if}
									{#if item.kind === 'created'}
										<span class="text-text-3">{m.tickets_opened_this()}</span>
									{:else if isNote}
										<span class="text-[#e9c46a]">{m.tickets_internal_note()}</span>
									{/if}
									<span class="ml-auto shrink-0 text-[12px] text-text-4">{relTime(item.at)}</span>
								</header>
								{#if item.kind === 'created'}
									{#if t.description}
										<div
											class="mt-2.5 pl-[38px] text-[14px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-text"
										>
											<MentionText text={t.description} flavor="document" />
										</div>
									{/if}
								{:else}
									<div
										class="mt-2.5 pl-[38px] text-[14px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-text"
									>
										<MentionText text={item.body} />
									</div>
									{#if data.messageAttachments[item.id]?.length}
										<div class="mt-3 pl-[38px]">
											<AttachmentList
												attachments={data.messageAttachments[item.id]}
												canDelete={isAgent}
											/>
										</div>
									{/if}
								{/if}
							</article>
						{/if}
					{/each}
				</div>
			</div>
		</div>

		<!-- Composer, docked. Agents pick Reply / Internal note above it. -->
		<div class="px-6 pt-2 pb-4">
			<div class="mx-auto w-full max-w-[760px]">
				{#if data.canUseInternalNotes}
					<div
						class="mb-2 inline-flex rounded-lg border border-border bg-surface p-0.5 text-[13px]"
						role="tablist"
					>
						<button
							type="button"
							role="tab"
							aria-selected={!internal}
							onclick={() => (internal = false)}
							class="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 transition-colors {!internal
								? 'bg-bg-elev text-text'
								: 'text-text-3 hover:text-text'}"
						>
							<Icon name="msg" size={13} />
							{m.tickets_reply_tab()}
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={internal}
							onclick={() => (internal = true)}
							class="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 transition-colors {internal
								? 'bg-[#e9c46a]/15 text-[#e9c46a]'
								: 'text-text-3 hover:text-text'}"
						>
							<Icon name="shield" size={13} />
							{m.tickets_internal_note_tab()}
						</button>
					</div>
				{/if}
				<Composer
					bind:value={body}
					placeholder={internal
						? m.tickets_composer_internal_placeholder()
						: m.tickets_composer_reply_placeholder()}
					accent={internal ? 'warning' : 'default'}
					mentionUsers={internal ? data.mentionUsers?.filter((u) => u.internal) : data.mentionUsers}
					refTypes={['ticket']}
					refOrgId={data.ticket.orgId}
					{sending}
					onsend={() => void send()}
					hasAttachments={commentFiles.length > 0}
				>
					{#snippet attachments()}
						{#if commentFiles.length}
							<StagedFileList
								variant="chips"
								files={commentFiles}
								disabled={sending}
								onremove={(i) => (commentFiles = commentFiles.filter((_, idx) => idx !== i))}
							/>
						{/if}
					{/snippet}
				</Composer>
			</div>
		</div>
	</div>

	<!-- Right: properties and sections, its own scroll. -->
	<aside class="hidden w-[340px] shrink-0 overflow-y-auto border-l border-border/70 lg:block">
		<div class="px-5 py-6">
			{@render detailsRail('desktop')}
		</div>
	</aside>
</AttachmentDropzone>

{#if data.canCreateTask}
	<CreateTaskModal
		open={creatingTask}
		action="/tickets/{t.id}?/createTask"
		sourceTicketId={t.id}
		prefill={taskPrefill}
		carryAttachments={[...data.attachments, ...Object.values(data.messageAttachments).flat()]}
		onclose={() => (creatingTask = false)}
		users={page.data.users}
		projects={page.data.projects}
		currentUserId={page.data.currentUserId}
		memberProjectIds={Object.keys(page.data.memberRoles?.projects ?? {})}
		allAccess={page.data.isTrackrTeam}
		oncreated={(displayId) => showToast('ok', m.tickets_create_task_toast({ ref: displayId }))}
	/>
{/if}

<!-- Properties and sections; rendered in the right sidebar on desktop and
     under the header on mobile (pickers are keyed by placement). -->
{#snippet detailsRail(placement: 'mobile' | 'desktop')}
	{@const k = (f: string) => `${placement}:${f}`}
	{@render headRow(placement)}
	<div>
		<PropertyRow label={m.tickets_field_status()}>
			<button
				type="button"
				disabled={!isAgent}
				onclick={() => togglePop(k('status'))}
				class="{PROP_VALUE} {pop === k('status') ? OPEN : ''}"
			>
				<span class="h-2 w-2 shrink-0 rounded-full" style:background={statusMeta?.dot ?? '#7c7c84'}
				></span>
				<span>{ticketStatusLabel(t.status)}</span>
			</button>
			{#if pop === k('status')}
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
							<span class="ml-auto text-accent {t.status === s.id ? 'opacity-100' : 'opacity-0'}">
								<Icon name="check" size={14} />
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</PropertyRow>

		<PropertyRow label={m.tickets_field_priority()}>
			<button
				type="button"
				disabled={!isAgent}
				onclick={() => togglePop(k('priority'))}
				class="{PROP_VALUE} {pop === k('priority') ? OPEN : ''}"
			>
				<PriorityBars priority={t.priority} />
				<span>{priorityLabel(t.priority)}</span>
			</button>
			{#if pop === k('priority')}
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
							<span class="ml-auto text-accent {t.priority === p.id ? 'opacity-100' : 'opacity-0'}">
								<Icon name="check" size={14} />
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</PropertyRow>

		<PropertyRow label={m.tickets_field_category()}>
			<button
				type="button"
				disabled={!isAgent}
				onclick={() => togglePop(k('category'))}
				class="{PROP_VALUE} {pop === k('category') ? OPEN : ''}"
			>
				<span
					class="h-2 w-2 shrink-0 rounded-full"
					style:background={categoryMeta?.color ?? '#7c7c84'}
				></span>
				<span>{ticketCategoryLabel(t.category)}</span>
			</button>
			{#if pop === k('category')}
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
							<span class="ml-auto text-accent {t.category === c.id ? 'opacity-100' : 'opacity-0'}">
								<Icon name="check" size={14} />
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</PropertyRow>

		<PropertyRow label={m.tickets_field_assignee()}>
			<button
				type="button"
				disabled={!isAgent}
				onclick={() => togglePop(k('assignee'))}
				class="{PROP_VALUE} {pop === k('assignee') ? OPEN : ''}"
			>
				{#if assigneeUsers.length === 1}
					<Avatar user={assigneeUsers[0]} size={22} />
					<span class="truncate">{assigneeUsers[0]?.name ?? m.common_unassigned()}</span>
				{:else if assigneeUsers.length > 1}
					<AvatarStack users={assigneeUsers} size={22} max={3} overlap={6} />
					<span class="truncate">{m.tickets_n_assignees({ n: assigneeUsers.length })}</span>
				{:else}
					<span class="text-text-3">{m.common_unassigned()}</span>
				{/if}
			</button>
			{#if pop === k('assignee')}
				<AssigneePopover
					value={t.assignees}
					{users}
					onchange={(v) => patch('assignees', v, { keepOpen: true })}
					onclose={() => (pop = null)}
				/>
			{/if}
		</PropertyRow>

		<PropertyRow label={m.tickets_meta_reporter()}>
			<span class="inline-flex min-w-0 items-center gap-2 text-[14px] text-text">
				{#if reporter}<Avatar user={reporter} size={22} />{/if}
				<span class="truncate">{reporter?.name ?? '—'}</span>
			</span>
		</PropertyRow>

		<PropertyRow label={m.tickets_field_organization()}>
			<span class="inline-flex min-w-0 items-center gap-2 text-[14px] text-text">
				<span class="h-2 w-2 shrink-0 rounded-full" style:background={t.orgColor}></span>
				<span class="truncate">{t.orgName}</span>
			</span>
		</PropertyRow>

		{#if t.tags.length > 0 || isAgent}
			<PropertyRow label={m.tasks_tags()}>
				<button
					type="button"
					disabled={!isAgent || pending}
					onclick={() => (tagsPop = tagsPop === placement ? null : placement)}
					class="{PROP_VALUE} flex-wrap {tagsPop === placement ? OPEN : ''}"
				>
					{#each t.tags as tag (tag)}
						{@const l = labelMeta(tag)}
						<span class={TAG}>
							<span class="h-1.5 w-1.5 shrink-0 rounded-full" style:background={l.color}></span>
							<span class="max-w-[140px] truncate">{l.label}</span>
						</span>
					{:else}
						<span class="text-text-3">{m.tasks_add_tags()}</span>
					{/each}
				</button>
				{#if tagsPop === placement}
					<TagsPopover
						value={t.tags}
						suggestions={data.tagSuggestions}
						onchange={(v) => patch('tags', v, { keepOpen: true })}
						onclose={() => (tagsPop = null)}
					/>
				{/if}
			</PropertyRow>
		{/if}
	</div>

	<div class="mt-5 space-y-6 border-t border-border/60 pt-5">
		<!-- Checklist (shared across all ticket participants) -->
		{#if checklist.length > 0 || checklistOpen}
			<Checklist
				items={checklist}
				canEdit={data.canEditChecklist}
				label={m.tasks_checklist()}
				addPlaceholder={m.tasks_checklist_add()}
				onChange={saveChecklist}
				variant="panel"
				addLabel={m.tasks_checklist_add()}
				focusAdd={checklistOpen && checklist.length === 0}
			/>
		{/if}

		<!-- Attachments: anyone on the ticket may add; deleting is agent-only. -->
		{#if data.attachments.length}
			<section>
				<SectionHeader label={m.tickets_attachments()} count={data.attachments.length}>
					{#snippet action()}
						<AttachmentUploader
							entityType="ticket"
							entityId={t.id}
							dropzone={false}
							variant="icon"
							label={m.tickets_attach_files()}
						/>
					{/snippet}
				</SectionHeader>
				<AttachmentList attachments={data.attachments} canDelete={isAgent} />
			</section>
		{/if}

		<!-- Linked tasks (team-only) -->
		{#if data.canCreateTask && data.linkedTasks.length}
			<section>
				<SectionHeader label={m.tickets_linked_tasks()} count={data.linkedTasks.length} />
				<div class="space-y-px">
					{#each data.linkedTasks as lt (lt.id)}
						<a href="/tasks?task={lt.displayId}" class="group {ROW}">
							<span class="grid h-5 w-5 shrink-0 place-items-center">
								<StatusDot status={lt.status as import('$lib/types').StatusId} size={14} />
							</span>
							<span class="shrink-0 font-mono text-[12px] leading-5 text-text-3"
								>{lt.displayId}</span
							>
							<span
								class="min-w-0 flex-1 truncate text-[14px] leading-5 text-text-2 group-hover:text-text"
								>{lt.title}</span
							>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Created from a chat thread -->
		{#if data.sourceChat}
			<section>
				<SectionHeader label={m.tickets_source_chat()} />
				<a
					href="/chat?org={data.sourceChat.orgId}&thread={data.sourceChat.threadId}"
					class="group {ROW}"
				>
					<span class="grid h-5 w-5 shrink-0 place-items-center text-text-3">
						<Icon name="msg" size={15} />
					</span>
					<span
						class="min-w-0 flex-1 truncate text-[14px] leading-5 text-text-2 group-hover:text-text"
					>
						{data.sourceChat.title ?? m.chat_untitled()}
					</span>
					<Icon name="chevron-r" size={13} class="shrink-0 text-text-4" />
				</a>
			</section>
		{/if}

		<!-- Whatever is still empty, as quiet links. -->
		{#if (data.canEditChecklist && checklist.length === 0 && !checklistOpen) || !data.attachments.length}
			<div class="-mx-2 flex flex-wrap items-center gap-0.5">
				{#if data.canEditChecklist && checklist.length === 0 && !checklistOpen}
					<button type="button" onclick={() => (checklistOpen = true)} class={QUIET_ADD}>
						<Icon name="plus" size={13} />
						{m.tasks_checklist()}
					</button>
				{/if}
				{#if !data.attachments.length}
					<AttachmentUploader
						entityType="ticket"
						entityId={t.id}
						dropzone={false}
						variant="quiet"
						label={m.tasks_panel_add_file()}
					/>
				{/if}
			</div>
		{/if}

		<!-- Meta: muted label / value pairs, stacked. -->
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px] leading-5">
			<dt class="text-text-4">{m.tickets_meta_channel()}</dt>
			<dd class="text-text-3">{ticketChannelLabel(t.channel)}</dd>
			<dt class="text-text-4">{m.tickets_meta_created()}</dt>
			<dd class="text-text-3">{fmtDate(t.createdAt)}</dd>
			<dt class="text-text-4">{m.tickets_meta_first_response()}</dt>
			<dd class="text-text-3">{fmtDate(t.firstResponseAt)}</dd>
			{#if t.resolvedAt}
				<dt class="text-text-4">{m.tickets_meta_resolved()}</dt>
				<dd class="text-text-3">{fmtDate(t.resolvedAt)}</dd>
			{/if}
			{#if t.satisfactionScore != null}
				<dt class="text-text-4">{m.tickets_meta_csat()}</dt>
				<dd class="text-text-3">{t.satisfactionScore}/5</dd>
			{/if}
		</dl>
	</div>
{/snippet}

{#snippet headRow(placement: 'mobile' | 'desktop')}
	<!-- Head of the properties panel: id badge + org (as in the side panels),
     pin and the ⋯ menu. -->
	<div class="mb-4 flex items-center gap-2">
		<span
			class="inline-flex h-[20px] shrink-0 items-center gap-1.5 rounded-md border px-1.5 font-mono text-[12px] leading-none font-medium whitespace-nowrap"
			style:color={idColor}
			style:border-color="{idColor}40"
			style:background="{idColor}14"
		>
			<Icon name="ticket" size={11} stroke={2.2} />
			{t.displayId}
		</span>
		<span
			class="inline-flex h-[20px] min-w-0 items-center rounded-md bg-surface px-1.5 font-mono text-[12px] leading-none text-text-3"
		>
			<span class="truncate">{t.orgName}</span>
		</span>
		<div class="ml-auto flex items-center gap-1">
			<button
				type="button"
				onclick={togglePin}
				disabled={pinPending}
				aria-pressed={data.isPinned}
				aria-label={data.isPinned ? m.tickets_unpin() : m.tickets_pin()}
				title={data.isPinned ? m.tickets_unpin() : m.tickets_pin()}
				class="grid h-[31px] w-[31px] place-items-center rounded-lg border transition-colors disabled:opacity-50 {data.isPinned
					? 'border-accent/30 bg-accent-soft text-accent'
					: 'border-transparent text-text-2 hover:border-border hover:bg-surface hover:text-text'}"
			>
				<Icon name="bookmark" size={15} />
			</button>
			<div class="relative">
				<IconButton
					size={31}
					ariaLabel={m.tickets_more_actions()}
					onclick={() => (menuOpen = menuOpen === placement ? null : placement)}
				>
					<Icon name="more" size={16} />
				</IconButton>
				{#if menuOpen === placement}
					<div
						role="menu"
						use:clickOutside={() => (menuOpen = null)}
						in:fly={POPOVER_IN}
						class="absolute top-full right-0 z-50 mt-1.5 min-w-[210px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
					>
						{#if data.canCreateTask}
							<button
								type="button"
								role="menuitem"
								onclick={() => {
									menuOpen = null;
									creatingTask = true;
								}}
								class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] text-text-2 hover:bg-surface-2 hover:text-text"
							>
								<Icon name="check-square" size={15} class="text-text-3" />
								{m.tickets_create_task()}
							</button>
						{/if}
						<button
							type="button"
							role="menuitem"
							onclick={copyLink}
							class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] text-text-2 hover:bg-surface-2 hover:text-text"
						>
							<span class="grid place-items-center [&>*]:[grid-area:1/1]">
								{#if copied}
									<span
										class="text-[#7fc8a9]"
										in:scale={{ start: 0.4, duration: 220, easing: backOut }}
									>
										<Icon name="check" size={15} stroke={2.4} />
									</span>
								{:else}
									<span class="text-text-3" in:fade={{ duration: 150 }}>
										<Icon name="copy" size={15} />
									</span>
								{/if}
							</span>
							<span class={copied ? 'text-[#7fc8a9]' : ''}
								>{copied ? m.tickets_link_copied() : m.tickets_copy_link()}</span
							>
						</button>
						{#if canDelete}
							<div class="my-1 h-px bg-border"></div>
							<button
								type="button"
								role="menuitem"
								onclick={() => {
									menuOpen = null;
									void deleteTicket();
								}}
								class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] text-[#ef4f5e] hover:bg-[#ef4f5e]/10"
							>
								<Icon name="trash" size={15} />
								{m.tickets_delete()}
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/snippet}
