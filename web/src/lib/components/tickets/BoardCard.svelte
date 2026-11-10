<script lang="ts">
	// Ticket card for the tickets board — same quiet layout as the task card:
	// the subject leads, then one muted meta line. Status and organization
	// only show when the board isn't already grouped by them.
	import type { TicketRow } from '$lib/server/tickets';
	import PriorityBars from '../PriorityBars.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import Icon from '../Icon.svelte';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { TICKET_STATUSES } from '$lib/config/taxonomy';
	import { ticketStatusLabel } from '$lib/utils/labels';
	import { relTime, slaSignal } from '$lib/utils/ticket-sla';

	interface Props {
		ticket: TicketRow;
		onclick?: () => void;
		/** Off when the board is grouped by status: the column/group says it. */
		showStatus?: boolean;
		/** Off when the board is grouped by organization. */
		showOrg?: boolean;
	}
	let { ticket, onclick, showStatus = true, showOrg = true }: Props = $props();

	const assignees = $derived(ticket.assignees.map((id) => resolveUser(id)));
	const statusDot = $derived(TICKET_STATUSES.find((s) => s.id === ticket.status)?.dot ?? '#7c7c84');
	const sla = $derived(slaSignal(ticket));
	const checklistDone = $derived(ticket.checklist.filter((i) => i.done).length);
</script>

<button
	type="button"
	{onclick}
	class="group block w-full rounded-lg bg-bg-elev px-3 py-2.5 text-left transition-colors hover:bg-surface"
>
	<div class="line-clamp-2 text-[14px] leading-snug text-text">{ticket.subject}</div>

	<div class="mt-2 flex min-w-0 items-center gap-2 text-[12px] leading-5 text-text-3">
		{#if showStatus}
			<span
				class="h-2 w-2 shrink-0 rounded-full"
				style:background={statusDot}
				title={ticketStatusLabel(ticket.status)}
			></span>
		{/if}
		<span class="shrink-0 font-mono text-[11px] text-text-4">{ticket.displayId}</span>
		{#if showOrg}
			<span class="inline-flex min-w-0 items-center gap-1 leading-none" title={ticket.orgName}>
				<span class="h-1.5 w-1.5 shrink-0 rounded-full" style:background={ticket.orgColor}></span>
				<span class="max-w-[110px] truncate">{ticket.orgName}</span>
			</span>
		{/if}
		<PriorityBars priority={ticket.priority} />
		{#if sla}
			<span
				class="inline-flex min-w-0 items-center gap-1 leading-none {sla.tone === 'wait'
					? 'text-accent'
					: ''}"
				title={sla.label}
			>
				<span class="h-1.5 w-1.5 shrink-0 rounded-full" style:background={sla.dot}></span>
				<span class="truncate">{sla.label}</span>
			</span>
		{:else if ticket.lastMessageAt}
			<span class="truncate">{relTime(ticket.lastMessageAt)}</span>
		{/if}
		{#if ticket.messageCount > 0}
			<span class="inline-flex shrink-0 items-center gap-1">
				<Icon name="msg" size={12} />
				{ticket.messageCount}
			</span>
		{/if}
		{#if ticket.checklist.length && checklistDone < ticket.checklist.length}
			<span
				class="inline-flex shrink-0 items-center gap-1"
				title="{checklistDone}/{ticket.checklist.length}"
			>
				<Icon name="check-square" size={12} />
				<span class="font-mono">{checklistDone}/{ticket.checklist.length}</span>
			</span>
		{/if}
		<span class="ml-auto shrink-0">
			{#if assignees.length}
				<AvatarStack users={assignees} size={22} max={3} overlap={6} />
			{:else}
				<span class="block h-[22px] w-[22px] rounded-full border border-dashed border-border-strong"
				></span>
			{/if}
		</span>
	</div>
</button>
