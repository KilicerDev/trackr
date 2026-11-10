<script lang="ts">
	import { invalidate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { autosize } from '$lib/actions/autosize';
	import { showToast } from '$lib/stores/toast.svelte';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import Drawer from '../Drawer.svelte';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import Avatar from '../Avatar.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import StatusDot from '../StatusDot.svelte';
	import Checklist from '../Checklist.svelte';
	import AttachmentList from '../attachments/AttachmentList.svelte';
	import TagsPopover from '../popovers/TagsPopover.svelte';
	import AssigneePopover from '../popovers/AssigneePopover.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '$lib/config/taxonomy';
	import {
		ticketStatusLabel,
		ticketCategoryLabel,
		ticketChannelLabel,
		priorityLabel
	} from '$lib/utils/labels';
	import { labelMeta } from '$lib/utils/label-meta';
	import type { TicketRow } from '$lib/server/tickets';
	import type { StatusId } from '$lib/types';
	import type { AttachmentDTO } from '$lib/config/attachments';
	import type { TicketMessageRow } from '$lib/server/tickets';
	import MentionText from '../MentionText.svelte';
	import PropertyRow from '../tasks/panel/PropertyRow.svelte';
	import SectionHeader from '../tasks/panel/SectionHeader.svelte';
	import { ICON_ACTION, OPEN, PROP_VALUE, QUIET_ADD, ROW, TAG } from '../tasks/panel/styles';
	import { formatDateShort } from '$lib/utils/format';
	import { m } from '$lib/paraglide/messages';

	type AgentUser = { id: string; name: string; initials: string; color: string; status?: string };
	type LinkedTask = { id: string; displayId: string; title: string; status: string };

	interface Props {
		ticket: TicketRow | null;
		onclose: () => void;
		canEdit?: boolean;
		// Checklist is editable by every ticket participant, not just agents — so
		// it's gated separately from `canEdit` (which is agent-only field editing).
		canEditChecklist?: boolean;
		canDelete?: boolean;
		users?: AgentUser[];
		linkedTasks?: LinkedTask[];
	}
	let {
		ticket,
		onclose,
		canEdit = false,
		canEditChecklist = false,
		canDelete = false,
		users = [],
		linkedTasks = []
	}: Props = $props();

	const open = $derived(ticket != null);
	const reporter = $derived(resolveUser(ticket?.customerId ?? ticket?.createdBy));
	const assigneeUsers = $derived((ticket?.assignees ?? []).map((id) => resolveUser(id)));

	// TagsPopover prepends the predefined labels itself; feed it every tag already
	// in use across the loaded (org-wide) tickets so custom tags reappear as
	// suggestions. Without this the picker only ever offers the defaults (mirrors
	// the tasks fix).
	const tagSuggestions = $derived.by(() => {
		const tickets = (page.data as { tickets?: { tags?: string[] }[] }).tickets ?? [];
		return [...new Set(tickets.flatMap((t) => t.tags ?? []))];
	});

	let pop = $state<'status' | 'priority' | 'category' | 'assignee' | 'tags' | null>(null);
	let pending = $state(false);
	let subjectDraft = $state('');
	// Optimistic checklist copy; reseeded whenever the selected ticket changes.
	let checklistDraft = $state<{ id: string; text: string; done: boolean }[]>([]);

	// Reset transient UI when the selected ticket changes. Close the open popover
	// only on an actual ticket switch — NOT on same-ticket data reloads (an
	// assignee toggle refreshes the page data, and closing then would prevent adding
	// several assignees in a row).
	let lastTicketId: string | undefined;
	$effect(() => {
		const id = ticket?.id;
		if (id !== lastTicketId) {
			lastTicketId = id;
			pop = null;
			attachments = [];
			checklistOpen = false;
			conversation = [];
			conversationLoaded = false;
			if (id) void loadAttachments(id);
		}
		subjectDraft = ticket?.subject ?? '';
		checklistDraft = ticket?.checklist ?? [];
	});

	// The checklist section shows once it has items, or when asked for.
	let checklistOpen = $state(false);

	// Conversation peek: the ticket's replies (internal notes for the team),
	// reloaded when the ticket opens and whenever it changes (a new reply bumps
	// updatedAt). The panel shows the last PEEK of them.
	const PEEK = 3;
	let conversation = $state<TicketMessageRow[]>([]);
	let conversationLoaded = $state(false);
	$effect(() => {
		const id = ticket?.id;
		void ticket?.updatedAt;
		void ticket?.messageCount;
		if (id) void loadConversation(id);
	});
	async function loadConversation(id: string) {
		try {
			const res = await fetch(`/api/tickets/${id}/messages`);
			if (!res.ok) return;
			const body = (await res.json()) as { messages: TicketMessageRow[] };
			if (ticket?.id !== id) return;
			conversation = body.messages;
		} catch {
			/* non-fatal — the peek just stays empty */
		} finally {
			if (ticket?.id === id) conversationLoaded = true;
		}
	}

	// Ticket-level attachments, fetched on demand when a ticket opens — kept out
	// of the bulk ticket-list load (mirrors the tasks Inspector's meetings).
	let attachments = $state<AttachmentDTO[]>([]);
	async function loadAttachments(id: string) {
		try {
			const res = await fetch(`/api/attachments?entityType=ticket&entityId=${id}`);
			if (!res.ok) return;
			const body = (await res.json()) as { attachments: AttachmentDTO[] };
			// Ignore if the open ticket changed while we were fetching.
			if (ticket?.id !== id) return;
			attachments = body.attachments;
		} catch {
			/* non-fatal — section just stays empty */
		}
	}

	async function saveChecklist(items: { id: string; text: string; done: boolean }[]) {
		if (!ticket) return;
		checklistDraft = items; // optimistic
		const fd = new FormData();
		fd.set('id', ticket.id);
		fd.set('checklist', JSON.stringify(items));
		try {
			const res = await fetch('/tickets?/checklist', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(m.tickets_update_failed());
			await invalidate('app:tickets');
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.tickets_update_failed());
			await invalidate('app:tickets');
		}
	}

	async function patch(
		field: string,
		value: string | string[] | null,
		opts: { keepOpen?: boolean } = {}
	) {
		if (!ticket) return;
		pending = true;
		const fd = new FormData();
		fd.set('id', ticket.id);
		if (Array.isArray(value)) {
			for (const v of value) fd.append(field, v);
			// Ensure the field is present even when clearing all values, so the
			// server keeps the empty array rather than skipping the patch.
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

	function saveSubject() {
		const next = subjectDraft.trim();
		if (!ticket || !next || next === ticket.subject) return;
		void patch('subject', next);
	}

	async function copyLink() {
		if (!ticket) return;
		try {
			const url = `${window.location.origin}/tickets?ticket=${ticket.id}`;
			await navigator.clipboard.writeText(url);
			showToast('ok', m.tickets_link_copied());
		} catch {
			showToast('err', m.tickets_link_copy_failed());
		}
	}

	async function deleteTicket() {
		if (!ticket) return;
		const ok = await uiConfirm({
			title: m.tickets_delete_confirm_title({ displayId: ticket.displayId }),
			message: m.tickets_delete_confirm_message({ subject: ticket.subject }),
			confirmLabel: m.tickets_delete_confirm_label(),
			tone: 'danger',
			icon: 'trash'
		});
		if (!ok) return;
		const fd = new FormData();
		fd.set('id', ticket.id);
		try {
			const res = await fetch('/tickets?/delete', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(m.tickets_delete_failed());
			onclose();
			await invalidateAll();
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.tickets_delete_failed());
		}
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<Drawer {open} {onclose} width={460}>
	{#if ticket}
		{@const statusMeta = TICKET_STATUSES.find((s) => s.id === ticket.status)}
		{@const categoryMeta = TICKET_CATEGORIES.find((c) => c.id === ticket.category)}
		<!-- Header: same shape as the task panel's — a tinted id badge (ticket
		     icon in the category colour), the organization as a muted chip, then
		     the actions. -->
		{@const idColor = categoryMeta?.color ?? '#7c7c84'}
		<div class="flex items-center gap-2 border-b border-border px-5 pt-4 pb-3">
			<span
				class="inline-flex h-[20px] shrink-0 items-center gap-1.5 rounded-md border px-1.5 font-mono text-[12px] leading-none font-medium whitespace-nowrap"
				style:color={idColor}
				style:border-color="{idColor}40"
				style:background="{idColor}14"
			>
				<Icon name="ticket" size={11} stroke={2.2} />
				{ticket.displayId}
			</span>
			<span
				class="min-w-0 truncate rounded bg-surface px-1.5 py-0.5 font-mono text-[12px] text-text-3"
			>
				{ticket.orgName}
			</span>
			{#if pending}
				<span class="inline-flex items-center gap-1.5 text-[12px] text-text-3">
					<span
						class="h-2.5 w-2.5 animate-spin rounded-full border border-text-3 border-t-transparent"
					></span>
					{m.common_saving()}
				</span>
			{/if}
			<div class="ml-auto flex items-center gap-1">
				<IconButton size={31} ariaLabel={m.tickets_copy_link()} onclick={copyLink}>
					<Icon name="link" size={15} />
				</IconButton>
				{#if canDelete}
					<IconButton size={31} ariaLabel={m.tickets_delete()} onclick={deleteTicket}>
						<Icon name="trash" size={15} />
					</IconButton>
				{/if}
				<IconButton size={31} ariaLabel={m.common_close()} onclick={onclose}>
					<Icon name="x" size={15} />
				</IconButton>
			</div>
		</div>

		<div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pt-4 pb-6">
			<!-- Subject -->
			{#if canEdit}
				<!-- A textarea so long subjects wrap like the read-only heading; Enter commits. -->
				<textarea
					rows="1"
					bind:value={subjectDraft}
					use:autosize={subjectDraft}
					onblur={saveSubject}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							(e.currentTarget as HTMLTextAreaElement).blur();
						}
					}}
					class="-mx-1 mb-4 block w-[calc(100%+0.5rem)] resize-none overflow-hidden rounded-lg bg-transparent px-1 py-0.5 text-[20px] leading-tight font-semibold tracking-[-0.01em] text-text outline-none focus:bg-surface"
				></textarea>
			{:else}
				<h2 class="mb-4 text-[20px] leading-tight font-semibold tracking-[-0.01em] text-text">
					{ticket.subject}
				</h2>
			{/if}

			<!-- Properties: quiet label / value rows, values open their picker. -->
			<div>
				<PropertyRow label={m.tickets_field_status()}>
					<button
						type="button"
						disabled={!canEdit}
						onclick={() => (pop = pop === 'status' ? null : 'status')}
						class="{PROP_VALUE} {pop === 'status' ? OPEN : ''}"
					>
						<span
							class="h-2 w-2 shrink-0 rounded-full"
							style:background={statusMeta?.dot ?? '#7c7c84'}
						></span>
						<span>{ticketStatusLabel(ticket.status)}</span>
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
										class="ml-auto text-accent {ticket.status === s.id
											? 'opacity-100'
											: 'opacity-0'}"
									>
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
						disabled={!canEdit}
						onclick={() => (pop = pop === 'priority' ? null : 'priority')}
						class="{PROP_VALUE} {pop === 'priority' ? OPEN : ''}"
					>
						<PriorityBars priority={ticket.priority} />
						<span>{priorityLabel(ticket.priority)}</span>
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
										class="ml-auto text-accent {ticket.priority === p.id
											? 'opacity-100'
											: 'opacity-0'}"
									>
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
						disabled={!canEdit}
						onclick={() => (pop = pop === 'category' ? null : 'category')}
						class="{PROP_VALUE} {pop === 'category' ? OPEN : ''}"
					>
						<span
							class="h-2 w-2 shrink-0 rounded-full"
							style:background={categoryMeta?.color ?? '#7c7c84'}
						></span>
						<span>{ticketCategoryLabel(ticket.category)}</span>
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
										class="ml-auto text-accent {ticket.category === c.id
											? 'opacity-100'
											: 'opacity-0'}"
									>
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
						disabled={!canEdit}
						onclick={() => (pop = pop === 'assignee' ? null : 'assignee')}
						class="{PROP_VALUE} {pop === 'assignee' ? OPEN : ''}"
					>
						{#if assigneeUsers.length === 1}
							<Avatar user={assigneeUsers[0]} size={20} />
							<span class="truncate">{assigneeUsers[0]?.name ?? m.common_unassigned()}</span>
						{:else if assigneeUsers.length > 1}
							<AvatarStack users={assigneeUsers} size={20} max={3} overlap={6} />
							<span class="truncate">{m.tickets_n_assignees({ n: assigneeUsers.length })}</span>
						{:else}
							<span class="text-text-3">{m.common_unassigned()}</span>
						{/if}
					</button>
					{#if pop === 'assignee'}
						<AssigneePopover
							value={ticket.assignees}
							{users}
							onchange={(v) => patch('assignees', v, { keepOpen: true })}
							onclose={() => (pop = null)}
						/>
					{/if}
				</PropertyRow>

				<PropertyRow label={m.tickets_meta_reporter()}>
					<span class="inline-flex min-w-0 items-center gap-2 text-[14px] text-text">
						{#if reporter}<Avatar user={reporter} size={20} />{/if}
						<span class="truncate">{reporter?.name ?? '—'}</span>
					</span>
				</PropertyRow>

				{#if ticket.tags.length > 0 || canEdit}
					<PropertyRow label={m.tasks_tags()}>
						<button
							type="button"
							disabled={!canEdit}
							onclick={() => (pop = pop === 'tags' ? null : 'tags')}
							class="{PROP_VALUE} flex-wrap {pop === 'tags' ? OPEN : ''}"
						>
							{#each ticket.tags as tag (tag)}
								{@const l = labelMeta(tag)}
								<span class={TAG}>
									<span class="h-1.5 w-1.5 shrink-0 rounded-full" style:background={l.color}></span>
									<span class="max-w-[140px] truncate">{l.label}</span>
								</span>
							{:else}
								<span class="text-text-3">{m.tasks_add_tags()}</span>
							{/each}
						</button>
						{#if pop === 'tags'}
							<TagsPopover
								value={ticket.tags}
								suggestions={tagSuggestions}
								onchange={(v) => patch('tags', v)}
								onclose={() => (pop = null)}
							/>
						{/if}
					</PropertyRow>
				{/if}
			</div>

			<!-- Sections: only the ones with content; an empty checklist is one
			     quiet "+ Checklist" link. -->
			<div class="mt-4 space-y-6 border-t border-border/60 pt-5">
				{#if ticket.description}
					<section>
						<SectionHeader label={m.tickets_description()} />
						<p
							class="text-[14px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-text-2"
						>
							{ticket.description}
						</p>
					</section>
				{/if}

				{#if checklistDraft.length > 0 || checklistOpen}
					<Checklist
						items={checklistDraft}
						canEdit={canEditChecklist}
						label={m.tasks_checklist()}
						addPlaceholder={m.tasks_checklist_add()}
						onChange={saveChecklist}
						variant="panel"
						addLabel={m.tasks_checklist_add()}
						focusAdd={checklistOpen && checklistDraft.length === 0}
					/>
				{:else if canEditChecklist}
					<div class="-mx-2">
						<button type="button" onclick={() => (checklistOpen = true)} class={QUIET_ADD}>
							<Icon name="plus" size={13} />
							{m.tasks_checklist()}
						</button>
					</div>
				{/if}

				<!-- Ticket-level attachments; message files live in the conversation. -->
				{#if attachments.length}
					<section>
						<SectionHeader label={m.tickets_attachments()} count={attachments.length} />
						<AttachmentList
							{attachments}
							canDelete={canEdit}
							currentUserId={(page.data as { currentUserId?: string }).currentUserId ?? null}
							ondeleted={(id) => (attachments = attachments.filter((a) => a.id !== id))}
						/>
					</section>
				{/if}

				{#if linkedTasks.length}
					<section>
						<SectionHeader label={m.tickets_linked_tasks()} count={linkedTasks.length} />
						<div class="space-y-px">
							{#each linkedTasks as lt (lt.id)}
								<a href="/tasks?task={lt.displayId}" class="group {ROW}">
									<StatusDot status={lt.status as StatusId} size={13} />
									<span class="shrink-0 font-mono text-[12px] text-text-3">{lt.displayId}</span>
									<span
										class="min-w-0 flex-1 truncate text-[14px] text-text-2 group-hover:text-text"
										>{lt.title}</span
									>
								</a>
							{/each}
						</div>
					</section>
				{/if}

				<!-- Conversation peek: the latest replies, so you can tell where the
				     ticket stands without opening it. -->
				<section>
					<SectionHeader label={m.tickets_conversation()} count={conversation.length}>
						{#snippet action()}
							<a
								href="/tickets/{ticket.id}?from=panel"
								aria-label={m.tickets_open_conversation()}
								title={m.tickets_open_conversation()}
								class={ICON_ACTION}
							>
								<Icon name="chevron-r" size={14} />
							</a>
						{/snippet}
					</SectionHeader>
					{#if conversation.length === 0}
						<p class="text-[13px] text-text-3">
							{conversationLoaded ? m.tickets_conversation_empty() : '…'}
						</p>
					{:else}
						{#if conversation.length > PEEK}
							<a
								href="/tickets/{ticket.id}?from=panel"
								class="-mx-2 mb-1 inline-flex rounded-lg px-2 py-1 text-[12px] text-text-3 transition-colors hover:bg-surface hover:text-text"
							>
								{m.tickets_conversation_earlier({ n: conversation.length - PEEK })}
							</a>
						{/if}
						<div class="space-y-3.5">
							{#each conversation.slice(-PEEK) as msg (msg.id)}
								{@const author = msg.authorId ? resolveUser(msg.authorId) : undefined}
								<div>
									<div class="flex items-center gap-2 text-[13px] text-text-3">
										{#if author}
											<Avatar user={author} size={20} />
										{:else}
											<span class="h-5 w-5 shrink-0 rounded-full bg-surface-2"></span>
										{/if}
										<span class="min-w-0 truncate text-text-2">{author?.name ?? '—'}</span>
										{#if msg.isInternalNote}
											<span class="shrink-0 text-[12px] text-[#e9c46a]"
												>· {m.tickets_internal_note()}</span
											>
										{/if}
										<span class="ml-auto shrink-0 text-[12px] text-text-4"
											>{formatDateShort(msg.createdAt)}</span
										>
									</div>
									<div
										class="mt-1 ml-7 line-clamp-3 text-[14px] leading-relaxed [overflow-wrap:anywhere] text-text-2"
									>
										<MentionText text={msg.body} />
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			</div>

			<!-- Metadata, one quiet line -->
			<div class="mt-8 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-4">
				<span>{m.tickets_meta_channel()} {ticketChannelLabel(ticket.channel)}</span>
				<span>{m.tickets_meta_created()} {fmtDate(ticket.createdAt)}</span>
				<span>{m.tickets_meta_first_response()} {fmtDate(ticket.firstResponseAt)}</span>
				{#if ticket.resolvedAt}
					<span>{m.tickets_meta_resolved()} {fmtDate(ticket.resolvedAt)}</span>
				{/if}
				{#if ticket.satisfactionScore != null}
					<span>{m.tickets_meta_csat()} {ticket.satisfactionScore}/5</span>
				{/if}
			</div>
		</div>

		<!-- Footer: open the full conversation -->
		<div class="px-5 pt-2 pb-4">
			<a
				href="/tickets/{ticket.id}?from=panel"
				class="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-surface text-[14px] text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
			>
				<Icon name="msg" size={15} />
				{m.tickets_open_conversation()}
				<Icon name="arrow-right" size={14} />
			</a>
		</div>
	{/if}
</Drawer>
