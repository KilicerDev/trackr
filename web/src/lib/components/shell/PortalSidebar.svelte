<script lang="ts">
	import { page } from '$app/state';
	import Icon from '../Icon.svelte';
	import Popover from '../Popover.svelte';
	import { setActiveOrg, type PortalOrg } from '$lib/api/portal';
	import type { TicketRow, TicketStatus } from '$lib/server/tickets';
	import { TICKET_STATUSES } from '$lib/data';
	import { m } from '$lib/paraglide/messages';
	import { ticketStatusLabel } from '$lib/utils/labels';

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
	class="flex min-h-0 flex-col border-r border-border bg-bg-elev"
	style:width="var(--sidebar-w)"
>
	<!-- Org / workspace header -->
	<div class="px-3 pt-3.5 pb-2">
		<div class="relative">
			<button
				type="button"
				onclick={() => orgs.length > 1 && (switcherOpen = !switcherOpen)}
				class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface {orgs.length >
				1
					? 'cursor-pointer'
					: 'cursor-default'}"
			>
				<span
					class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold text-white"
					style:background={activeOrg?.color ?? '#7c7c84'}
				>
					{(activeOrg?.name ?? '?').slice(0, 1).toUpperCase()}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[13.5px] font-semibold"
						>{activeOrg?.name ?? m.shell_portal_support()}</span
					>
					<span class="block text-[11px] leading-tight text-text-3"
						>{m.shell_portal_support_portal()}</span
					>
				</span>
				{#if orgs.length > 1}<Icon name="chevron" size={12} class="shrink-0 text-text-3" />{/if}
			</button>
			{#if orgs.length > 1}
				<Popover
					open={switcherOpen}
					onclose={() => (switcherOpen = false)}
					align="left"
					minWidth={232}
				>
					<div class="px-2 pt-1 pb-1.5 text-[10.5px] tracking-[0.08em] text-text-4 uppercase">
						{m.shell_switch_organization()}
					</div>
					{#each orgs as o (o.id)}
						<button
							type="button"
							onclick={() => choose(o.id)}
							class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
						>
							<span class="h-2 w-2 shrink-0 rounded-full" style:background={o.color}></span>
							<span class="truncate text-[13px]">{o.name}</span>
							<span
								class="ml-auto text-accent {o.id === activeOrgId ? 'opacity-100' : 'opacity-0'}"
							>
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
			class="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 text-[13.5px] text-text-2 transition-colors hover:border-border-strong hover:text-text {page
				.url.pathname === '/tickets/new'
				? 'border-border-strong !text-text'
				: ''}"
		>
			<Icon name="plus" size={15} class="text-text-3" />
			<span>{m.shell_portal_new_ticket()}</span>
		</a>
	</div>

	<div class="mt-1 flex-1 overflow-y-auto px-2 pb-2">
		<!-- Pinned -->
		{#if pinned.length}
			<div class="py-1.5">
				<div
					class="px-3 pt-1.5 pb-1.5 text-[11px] font-medium tracking-[0.08em] text-text-4 uppercase"
				>
					{m.shell_portal_pinned()}
				</div>
				{#each pinned as t (t.id)}
					{@render ticketRow(t)}
				{/each}
			</div>
		{/if}

		<!-- Recents -->
		<div class="py-1.5">
			<div
				class="px-3 pt-1.5 pb-1.5 text-[11px] font-medium tracking-[0.08em] text-text-4 uppercase"
			>
				{m.shell_portal_recents()}
			</div>
			{#each recents as t (t.id)}
				{@render ticketRow(t)}
			{/each}
			{#if recents.length === 0}
				<div class="px-3 py-1.5 text-[12px] leading-snug text-text-4">
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
		class="relative mx-1 my-[1px] flex items-center gap-2.5 rounded-[7px] px-3 py-[7px] text-[13.5px] text-text-2 transition-colors hover:bg-[var(--row-hover)] hover:text-text
		{active ? 'bg-[var(--row-active)] !text-text' : ''}"
	>
		<span class="grid h-4 w-4 shrink-0 place-items-center" title={ticketStatusLabel(t.status)}>
			<span
				class="h-[11px] w-[11px] rounded-full border-[1.5px]"
				style:border-color={dot}
				style:background={filled ? dot : 'transparent'}
			></span>
		</span>
		<span class="truncate">{t.subject}</span>
	</a>
{/snippet}
