<script lang="ts">
	import { page } from '$app/state';
	import Icon from '../Icon.svelte';
	import Popover from '../Popover.svelte';
	import { setActiveOrg, type PortalOrg } from '$lib/portal';
	import type { TicketRow, TicketStatus } from '$lib/server/tickets';
	import { TICKET_STATUSES } from '$lib/data';
	import { m } from '$lib/paraglide/messages';
	import { ticketStatusLabel } from '$lib/labels';

	function statusColor(id: TicketStatus): string {
		return TICKET_STATUSES.find((s) => s.id === id)?.dot ?? '#7c7c84';
	}

	type LayoutShape = {
		orgs?: PortalOrg[];
		activeOrgId?: string | null;
		pinnedTickets?: TicketRow[];
		recentTickets?: TicketRow[];
	};

	const orgs = $derived((page.data as LayoutShape).orgs ?? []);
	const activeOrgId = $derived((page.data as LayoutShape).activeOrgId ?? null);
	const activeOrg = $derived(orgs.find((o) => o.id === activeOrgId) ?? orgs[0] ?? null);
	const pinned = $derived((page.data as LayoutShape).pinnedTickets ?? []);
	const recents = $derived((page.data as LayoutShape).recentTickets ?? []);

	let switcherOpen = $state(false);

	function isActiveTicket(id: string): boolean {
		return page.url.pathname === `/tickets/${id}`;
	}

	async function choose(orgId: string) {
		switcherOpen = false;
		if (orgId !== activeOrgId) await setActiveOrg(orgId);
	}
</script>

<aside
	class="bg-bg-elev border-r border-border flex flex-col min-h-0"
	style:width="var(--sidebar-w)"
>
	<!-- Org / workspace header -->
	<div class="px-3 pt-3.5 pb-2">
		<div class="relative">
			<button
				type="button"
				onclick={() => orgs.length > 1 && (switcherOpen = !switcherOpen)}
				class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface transition-colors text-left {orgs.length >
				1
					? 'cursor-pointer'
					: 'cursor-default'}"
			>
				<span
					class="grid place-items-center w-6 h-6 rounded-md shrink-0 text-[11px] font-semibold text-white"
					style:background={activeOrg?.color ?? '#7c7c84'}
				>
					{(activeOrg?.name ?? '?').slice(0, 1).toUpperCase()}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-[13.5px] font-semibold truncate">{activeOrg?.name ?? m.shell_portal_support()}</span>
					<span class="block text-[11px] text-text-3 leading-tight">{m.shell_portal_support_portal()}</span>
				</span>
				{#if orgs.length > 1}<Icon name="chevron" size={12} class="text-text-3 shrink-0" />{/if}
			</button>
			{#if orgs.length > 1}
				<Popover open={switcherOpen} onclose={() => (switcherOpen = false)} align="left" minWidth={232}>
					<div class="px-2 pt-1 pb-1.5 text-[10.5px] uppercase tracking-[0.08em] text-text-4">
						{m.shell_switch_organization()}
					</div>
					{#each orgs as o (o.id)}
						<button
							type="button"
							onclick={() => choose(o.id)}
							class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
						>
							<span class="w-2 h-2 rounded-full shrink-0" style:background={o.color}></span>
							<span class="text-[13px] truncate">{o.name}</span>
							<span class="ml-auto text-accent {o.id === activeOrgId ? 'opacity-100' : 'opacity-0'}">
								<Icon name="check" size={13} />
							</span>
						</button>
					{/each}
				</Popover>
			{/if}
		</div>
	</div>

	<!-- New ticket -->
	<div class="px-3 pb-1">
		<a
			href="/tickets/new"
			class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-surface border border-border hover:border-border-strong text-[13.5px] text-text-2 hover:text-text transition-colors {page
				.url.pathname === '/tickets/new'
				? '!text-text border-border-strong'
				: ''}"
		>
			<Icon name="plus" size={15} class="text-text-3" />
			<span>{m.shell_portal_new_ticket()}</span>
		</a>
	</div>

	<div class="flex-1 overflow-y-auto px-2 pb-2 mt-1">
		<!-- Pinned -->
		{#if pinned.length}
			<div class="py-1.5">
				<div class="px-3 pt-1.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-4">
					{m.shell_portal_pinned()}
				</div>
				{#each pinned as t (t.id)}
					{@render ticketRow(t)}
				{/each}
			</div>
		{/if}

		<!-- Recents -->
		<div class="py-1.5">
			<div class="px-3 pt-1.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-4">
				{m.shell_portal_recents()}
			</div>
			{#each recents as t (t.id)}
				{@render ticketRow(t)}
			{/each}
			{#if recents.length === 0}
				<div class="px-3 py-1.5 text-[12px] text-text-4 leading-snug">
					{m.shell_portal_recents_empty()}
				</div>
			{/if}
		</div>
	</div>
</aside>

{#snippet ticketRow(t: TicketRow)}
	{@const active = isActiveTicket(t.id)}
	{@const dot = statusColor(t.status)}
	{@const filled = t.status === 'resolved' || t.status === 'closed'}
	<a
		href="/tickets/{t.id}"
		title={t.subject}
		class="relative flex items-center gap-2.5 px-3 py-[7px] rounded-[7px] mx-1 my-[1px] text-text-2 hover:bg-[var(--row-hover)] hover:text-text transition-colors text-[13.5px]
		{active ? 'bg-[var(--row-active)] !text-text' : ''}"
	>
		<span class="grid place-items-center w-4 h-4 shrink-0" title={ticketStatusLabel(t.status)}>
			<span
				class="w-[11px] h-[11px] rounded-full border-[1.5px]"
				style:border-color={dot}
				style:background={filled ? dot : 'transparent'}
			></span>
		</span>
		<span class="truncate">{t.subject}</span>
	</a>
{/snippet}
