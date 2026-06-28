<script lang="ts">
	import type { TicketRow } from '$lib/server/tickets';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import Icon from '../Icon.svelte';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { TICKET_STATUSES } from '$lib/config/taxonomy';
	import { relTime, slaSignal } from '$lib/utils/ticket-sla';

	interface Props {
		ticket: TicketRow;
		onclick?: () => void;
	}
	let { ticket, onclick }: Props = $props();

	const assignee = $derived(resolveUser(ticket.assignedAgentId));
	const statusDot = $derived(TICKET_STATUSES.find((s) => s.id === ticket.status)?.dot ?? '#7c7c84');
	const sla = $derived(slaSignal(ticket));
</script>

<button
	type="button"
	{onclick}
	class="group block w-full rounded-xl border border-border bg-bg-elev px-3 py-2.5 text-left shadow-[0_1px_0_rgba(255,255,255,0.02)_inset] transition-colors hover:bg-surface"
>
	<div class="mb-1.5 flex items-center gap-2">
		<span class="h-2.5 w-2.5 shrink-0 rounded-full" style:background={statusDot}></span>
		<span class="font-mono text-[12px] text-text-3">{ticket.displayId}</span>
		<span
			class="ml-auto inline-flex items-center gap-1 truncate text-[12px] text-text-3"
			title={ticket.orgName}
		>
			<span class="h-1.5 w-1.5 rounded-full" style:background={ticket.orgColor}></span>
			<span class="max-w-[121px] truncate">{ticket.orgName}</span>
		</span>
	</div>
	<div class="mb-1.5 line-clamp-3 text-[14px] leading-snug font-medium text-text">
		{ticket.subject}
	</div>
	<div class="flex items-center gap-2 text-[12px] text-text-3">
		<PriorityBars priority={ticket.priority} />
		{#if sla}
			<span class="inline-flex items-center gap-1 truncate" title={sla.label}>
				<span class="h-1.5 w-1.5 shrink-0 rounded-full" style:background={sla.dot}></span>
				<span class="truncate">{sla.label}</span>
			</span>
		{:else if ticket.lastMessageAt}
			<span class="truncate">{relTime(ticket.lastMessageAt)}</span>
		{/if}
		{#if ticket.messageCount > 0}
			<span class="inline-flex items-center gap-1">
				<Icon name="msg" size={12} />
				{ticket.messageCount}
			</span>
		{/if}
		{#if ticket.checklist.length}
			{@const cdone = ticket.checklist.filter((i) => i.done).length}
			<span
				class="inline-flex items-center gap-1 {cdone === ticket.checklist.length
					? 'text-[#7fc8a9]'
					: ''}"
				title="{cdone}/{ticket.checklist.length}"
			>
				<Icon name="check" size={12} />
				{cdone}/{ticket.checklist.length}
			</span>
		{/if}
		<span class="ml-auto">
			{#if assignee}
				<Avatar user={assignee} size={22} />
			{:else}
				<span class="block h-5 w-5 rounded-full border border-dashed border-border-strong"></span>
			{/if}
		</span>
	</div>
</button>
