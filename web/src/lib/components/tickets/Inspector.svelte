<script lang="ts">
	import { invalidate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { autosize } from '$lib/actions/autosize';
	import { showToast } from '$lib/stores/toast.svelte';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import Drawer from '../Drawer.svelte';
	import Icon from '../Icon.svelte';
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
			if (id) void loadAttachments(id);
		}
		subjectDraft = ticket?.subject ?? '';
		checklistDraft = ticket?.checklist ?? [];
	});

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
		<!-- Header -->
		<div class="flex items-center gap-2 border-b border-border px-4 py-3 text-[12px] text-text-3">
			<span class="font-mono text-text-4">{ticket.displayId}</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="h-1.5 w-1.5 rounded-full" style:background={ticket.orgColor}></span>
				<span class="max-w-[176px] truncate">{ticket.orgName}</span>
			</span>
			<div class="ml-auto flex items-center gap-1">
				{#if pending}
					<span class="text-text-4"><Icon name="refresh" size={14} /></span>
				{/if}
				<button
					type="button"
					onclick={copyLink}
					aria-label={m.tickets_copy_link()}
					title={m.tickets_copy_link()}
					class="grid h-7 w-7 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
				>
					<Icon name="link" size={15} />
				</button>
				{#if canDelete}
					<button
						type="button"
						onclick={deleteTicket}
						aria-label={m.tickets_delete()}
						title={m.tickets_delete()}
						class="grid h-7 w-7 place-items-center rounded-lg text-text-3 transition-colors hover:bg-[#ef4f5e]/10 hover:text-[#ef4f5e]"
					>
						<Icon name="trash" size={15} />
					</button>
				{/if}
				<button
					type="button"
					onclick={onclose}
					aria-label={m.common_close()}
					class="grid h-7 w-7 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
				>
					<Icon name="x" size={15} />
				</button>
			</div>
		</div>

		<div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4">
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
					class="mb-4 block w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-[20px] leading-tight font-semibold tracking-[-0.01em] text-text outline-none hover:border-border focus:border-border-strong focus:bg-surface"
				></textarea>
			{:else}
				<h2 class="mb-4 px-1 text-[20px] leading-tight font-semibold tracking-[-0.01em] text-text">
					{ticket.subject}
				</h2>
			{/if}

			<!-- Properties -->
			<div class="space-y-1">
				<!-- Status -->
				<div class="flex items-center gap-3">
					<span class="w-[92px] shrink-0 text-[13px] text-text-3">{m.tickets_field_status()}</span>
					<div class="relative">
						<button
							type="button"
							disabled={!canEdit}
							onclick={() => (pop = pop === 'status' ? null : 'status')}
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {canEdit
								? 'hover:border-border-strong'
								: ''} {pop === 'status' ? 'ring-2 ring-accent/40' : ''}"
						>
							<span class="h-2 w-2 rounded-full" style:background={statusMeta?.dot ?? '#7c7c84'}
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
					</div>
				</div>

				<!-- Priority -->
				<div class="flex items-center gap-3">
					<span class="w-[92px] shrink-0 text-[13px] text-text-3">{m.tickets_field_priority()}</span
					>
					<div class="relative">
						<button
							type="button"
							disabled={!canEdit}
							onclick={() => (pop = pop === 'priority' ? null : 'priority')}
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {canEdit
								? 'hover:border-border-strong'
								: ''} {pop === 'priority' ? 'ring-2 ring-accent/40' : ''}"
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
					</div>
				</div>

				<!-- Category -->
				<div class="flex items-center gap-3">
					<span class="w-[92px] shrink-0 text-[13px] text-text-3">{m.tickets_field_category()}</span
					>
					<div class="relative">
						<button
							type="button"
							disabled={!canEdit}
							onclick={() => (pop = pop === 'category' ? null : 'category')}
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {canEdit
								? 'hover:border-border-strong'
								: ''} {pop === 'category' ? 'ring-2 ring-accent/40' : ''}"
						>
							<span class="h-2 w-2 rounded-full" style:background={categoryMeta?.color ?? '#7c7c84'}
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
					</div>
				</div>

				<!-- Assignee -->
				<div class="flex items-center gap-3">
					<span class="w-[92px] shrink-0 text-[13px] text-text-3">{m.tickets_field_assignee()}</span
					>
					<div class="relative">
						<button
							type="button"
							disabled={!canEdit}
							onclick={() => (pop = pop === 'assignee' ? null : 'assignee')}
							class="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 {assigneeUsers.length
								? 'border border-border bg-surface'
								: 'border border-dashed border-border text-text-3'} {canEdit
								? 'hover:border-border-strong hover:text-text'
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
								value={ticket.assignees}
								{users}
								onchange={(v) => patch('assignees', v, { keepOpen: true })}
								onclose={() => (pop = null)}
							/>
						{/if}
					</div>
				</div>

				<!-- Tags -->
				<div class="flex items-start gap-3 pt-0.5">
					<span class="w-[92px] shrink-0 pt-1.5 text-[13px] text-text-3">{m.tasks_tags()}</span>
					<div class="relative flex flex-wrap items-center gap-1.5">
						{#each ticket.tags as tag (tag)}
							{@const l = labelMeta(tag)}
							<span
								class="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[13px] text-text-2"
							>
								<span class="h-1.5 w-1.5 rounded-full" style:background={l.color}></span>
								{l.label}
							</span>
						{/each}
						{#if canEdit}
							<button
								type="button"
								onclick={() => (pop = pop === 'tags' ? null : 'tags')}
								class="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[13px] text-text-3 transition-colors hover:border-border-strong hover:text-text"
							>
								<Icon name="plus" size={13} />
								{#if ticket.tags.length === 0}{m.tasks_tags()}{/if}
							</button>
							{#if pop === 'tags'}
								<TagsPopover
									value={ticket.tags}
									suggestions={tagSuggestions}
									onchange={(v) => patch('tags', v)}
									onclose={() => (pop = null)}
								/>
							{/if}
						{:else if ticket.tags.length === 0}
							<span class="py-1 text-[13px] text-text-4">—</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Description -->
			{#if ticket.description}
				<div class="mt-5 border-t border-border pt-4">
					<div class="mb-2 text-[12px] tracking-[0.08em] text-text-4 uppercase">
						{m.tickets_description()}
					</div>
					<p
						class="text-[14px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-text-2"
					>
						{ticket.description}
					</p>
				</div>
			{/if}

			<!-- Checklist (shared across all ticket participants) -->
			{#if canEditChecklist || checklistDraft.length > 0}
				<div class="mt-5 border-t border-border pt-4">
					<Checklist
						items={checklistDraft}
						canEdit={canEditChecklist}
						label={m.tasks_checklist()}
						addPlaceholder={m.tasks_checklist_add()}
						onChange={saveChecklist}
					/>
				</div>
			{/if}

			<!-- Attachments (ticket-level; message files live in the conversation) -->
			{#if attachments.length}
				<div class="mt-5 border-t border-border pt-4">
					<div class="mb-2 text-[12px] tracking-[0.08em] text-text-4 uppercase">
						{m.tickets_attachments()}<span class="ml-1.5 text-text-3">{attachments.length}</span>
					</div>
					<AttachmentList
						{attachments}
						canDelete={canEdit}
						currentUserId={(page.data as { currentUserId?: string }).currentUserId ?? null}
						ondeleted={(id) => (attachments = attachments.filter((a) => a.id !== id))}
					/>
				</div>
			{/if}

			<!-- Linked tasks -->
			{#if linkedTasks.length}
				<div class="mt-5 border-t border-border pt-4">
					<div class="mb-2 text-[12px] tracking-[0.08em] text-text-4 uppercase">
						{m.tickets_linked_tasks()}<span class="ml-1.5 text-text-3">{linkedTasks.length}</span>
					</div>
					<ul class="flex flex-col gap-1">
						{#each linkedTasks as lt (lt.id)}
							<li>
								<a
									href="/tasks?task={lt.displayId}"
									class="group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 transition-colors hover:border-border-strong"
								>
									<StatusDot status={lt.status as StatusId} size={14} />
									<span class="font-mono text-[12px] text-text-4">{lt.displayId}</span>
									<span class="truncate text-[14px] text-text-2 group-hover:text-text"
										>{lt.title}</span
									>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Metadata -->
			<div class="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border pt-4 text-[13px]">
				<div>
					<div class="text-text-4">{m.tickets_meta_reporter()}</div>
					<div class="mt-0.5 flex items-center gap-1.5 text-text-2">
						{#if reporter}<Avatar user={reporter} size={17} />{/if}
						<span class="truncate">{reporter?.name ?? '—'}</span>
					</div>
				</div>
				<div>
					<div class="text-text-4">{m.tickets_meta_channel()}</div>
					<div class="mt-0.5 text-text-2">{ticketChannelLabel(ticket.channel)}</div>
				</div>
				<div>
					<div class="text-text-4">{m.tickets_meta_created()}</div>
					<div class="mt-0.5 font-mono text-text-3">{fmtDate(ticket.createdAt)}</div>
				</div>
				<div>
					<div class="text-text-4">{m.tickets_meta_first_response()}</div>
					<div class="mt-0.5 font-mono text-text-3">{fmtDate(ticket.firstResponseAt)}</div>
				</div>
				{#if ticket.resolvedAt}
					<div>
						<div class="text-text-4">{m.tickets_meta_resolved()}</div>
						<div class="mt-0.5 font-mono text-text-3">{fmtDate(ticket.resolvedAt)}</div>
					</div>
				{/if}
				{#if ticket.satisfactionScore != null}
					<div>
						<div class="text-text-4">{m.tickets_meta_csat()}</div>
						<div class="mt-0.5 text-text-2">{ticket.satisfactionScore}/5</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Footer: open full conversation -->
		<div class="border-t border-border px-4 py-3">
			<a
				href="/tickets/{ticket.id}?from=panel"
				class="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface py-2 text-[14px] text-text-2 transition-colors hover:border-border-strong hover:text-text"
			>
				<Icon name="msg" size={15} />
				{m.tickets_open_conversation()}
				<Icon name="chevron-r" size={14} />
			</a>
		</div>
	{/if}
</Drawer>
