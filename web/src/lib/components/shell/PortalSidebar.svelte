<script lang="ts">
	import { page } from '$app/state';
	import Icon from '../Icon.svelte';
	import Popover from '../Popover.svelte';
	import { setActiveOrg, type PortalOrg } from '$lib/api/portal';
	import type { TicketRow, TicketStatus } from '$lib/server/tickets';
	import { TICKET_STATUSES } from '$lib/config/taxonomy';
	import { m } from '$lib/paraglide/messages';
	import { ticketStatusLabel } from '$lib/utils/labels';
	import { isPortalSeeAllRole } from '$lib/roles';
	import type { CapabilityManifest } from '$lib/permissions';

	function statusColor(id: TicketStatus): string {
		return TICKET_STATUSES.find((s) => s.id === id)?.dot ?? '#7c7c84';
	}

	type LayoutShape = {
		orgs?: PortalOrg[];
		activeOrgId?: string | null;
		portalRole?: string | null;
		pinnedTickets?: TicketRow[];
		recentTickets?: TicketRow[];
		capabilities?: CapabilityManifest;
	};

	const orgs = $derived((page.data as LayoutShape).orgs ?? []);
	const activeOrgId = $derived((page.data as LayoutShape).activeOrgId ?? null);
	const activeOrg = $derived(orgs.find((o) => o.id === activeOrgId) ?? orgs[0] ?? null);
	const pinned = $derived((page.data as LayoutShape).pinnedTickets ?? []);
	const recents = $derived((page.data as LayoutShape).recentTickets ?? []);
	// The see-all tier (org.client + the privileged org.agent) gets the richer
	// nav: a dashboard, the full board, and saved-view shortcuts. Keyed off the
	// per-active-org role so it flips correctly on org switch.
	const isAdmin = $derived(isPortalSeeAllRole((page.data as LayoutShape).portalRole));
	// Members (the see-all tier) get the org chat; standard own-tickets users
	// don't. Read from the server-computed capability manifest.
	const canChat = $derived(!!(page.data as LayoutShape).capabilities?.surfaces.chat);

	let switcherOpen = $state(false);

	function isActiveTicket(id: string): boolean {
		return page.url.pathname === `/tickets/${id}`;
	}

	// Active state for nav links. When `params` is given, every param must match
	// the current query — so the board link and the saved-view shortcuts (which
	// share the /tickets path) don't all light up at once.
	function navActive(path: string, params?: Record<string, string>): boolean {
		if (page.url.pathname !== path) return false;
		if (!params) return true;
		for (const [k, v] of Object.entries(params)) {
			if (page.url.searchParams.get(k) !== v) return false;
		}
		return true;
	}

	// The board link is "active" only on a bare /tickets (no saved-view filter),
	// so it doesn't stay lit while a saved view is applied.
	function ticketsActive(): boolean {
		if (page.url.pathname !== '/tickets') return false;
		return !['status', 'assignee', 'priority', 'category', 'org'].some((k) =>
			page.url.searchParams.has(k)
		);
	}

	// Preset smart filters surfaced to admins (org.client). Each deep-links to the
	// board with a single filter pre-applied; `match` drives the active highlight.
	const SAVED_VIEWS: {
		label: () => string;
		href: string;
		match: Record<string, string>;
		dot: string;
	}[] = [
		{
			label: m.shell_portal_view_open,
			href: '/tickets?status=open&view=board',
			match: { status: 'open' },
			dot: '#7a9cf0'
		},
		{
			label: m.shell_portal_view_unassigned,
			href: '/tickets?assignee=__unassigned__&view=board',
			match: { assignee: '__unassigned__' },
			dot: '#9aa4b2'
		},
		{
			label: m.shell_portal_view_closed,
			href: '/tickets?status=closed&view=board',
			match: { status: 'closed' },
			dot: '#7c7c84'
		}
	];

	async function choose(orgId: string) {
		switcherOpen = false;
		if (orgId !== activeOrgId) await setActiveOrg(orgId);
	}
</script>

<aside class="flex min-h-0 w-full flex-col border-r border-border bg-bg-elev">
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
					class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12px] font-semibold text-white"
					style:background={activeOrg?.color ?? '#7c7c84'}
				>
					{(activeOrg?.name ?? '?').slice(0, 1).toUpperCase()}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[14px] font-semibold"
						>{activeOrg?.name ?? m.shell_portal_support()}</span
					>
					<span class="block text-[12px] leading-tight text-text-3"
						>{m.shell_portal_support_portal()}</span
					>
				</span>
				{#if orgs.length > 1}<Icon name="chevron" size={13} class="shrink-0 text-text-3" />{/if}
			</button>
			{#if orgs.length > 1}
				<Popover
					open={switcherOpen}
					onclose={() => (switcherOpen = false)}
					align="left"
					minWidth={232}
				>
					<div class="px-2 pt-1 pb-1.5 text-[12px] tracking-[0.08em] text-text-4 uppercase">
						{m.shell_switch_organization()}
					</div>
					{#each orgs as o (o.id)}
						<button
							type="button"
							onclick={() => choose(o.id)}
							class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
						>
							<span class="h-2 w-2 shrink-0 rounded-full" style:background={o.color}></span>
							<span class="truncate text-[14px]">{o.name}</span>
							<span
								class="ml-auto text-accent {o.id === activeOrgId ? 'opacity-100' : 'opacity-0'}"
							>
								<Icon name="check" size={14} />
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
			class="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 text-[14px] text-text-2 transition-colors hover:border-border-strong hover:text-text {page
				.url.pathname === '/tickets/new'
				? 'border-border-strong !text-text'
				: ''}"
		>
			<Icon name="plus" size={16} class="text-text-3" />
			<span>{m.shell_portal_new_ticket()}</span>
		</a>
	</div>

	{#if isAdmin}
		<!-- Dashboard (admin overview) -->
		<div class="px-3 pt-1 pb-1">
			<a
				href="/tickets/dashboard"
				class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-text-2 transition-colors hover:bg-surface hover:text-text {navActive(
					'/tickets/dashboard'
				)
					? 'bg-surface !text-text'
					: ''}"
			>
				<Icon name="grid" size={16} class="text-text-3" />
				<span>{m.shell_portal_dashboard()}</span>
			</a>
		</div>
		<!-- Tickets (full board / list) -->
		<div class="px-3 pt-1 pb-1">
			<a
				href="/tickets"
				class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-text-2 transition-colors hover:bg-surface hover:text-text {ticketsActive()
					? 'bg-surface !text-text'
					: ''}"
			>
				<Icon name="ticket" size={16} class="text-text-3" />
				<span>{m.shell_portal_tickets()}</span>
			</a>
		</div>
	{:else}
		<!-- Overview (member: their own tickets) -->
		<div class="px-3 pt-1 pb-1">
			<a
				href="/tickets"
				class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-text-2 transition-colors hover:bg-surface hover:text-text {page
					.url.pathname === '/tickets'
					? 'bg-surface !text-text'
					: ''}"
			>
				<Icon name="ticket" size={16} class="text-text-3" />
				<span>{m.shell_portal_overview()}</span>
			</a>
		</div>
	{/if}

	{#if canChat}
		<div class="px-3 pt-1 pb-1">
			<a
				href="/chat"
				class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-text-2 transition-colors hover:bg-surface hover:text-text {page.url.pathname.startsWith(
					'/chat'
				)
					? 'bg-surface !text-text'
					: ''}"
			>
				<Icon name="msg" size={16} class="text-text-3" />
				<span>{m.shell_nav_chat()}</span>
			</a>
		</div>
	{/if}

	<div class="mt-1 flex-1 overflow-y-auto px-2 pb-2">
		<!-- Saved views (admin only) -->
		{#if isAdmin}
			<div class="py-1.5">
				<div
					class="px-3 pt-1.5 pb-1.5 text-[12px] font-medium tracking-[0.08em] text-text-4 uppercase"
				>
					{m.shell_portal_saved_views()}
				</div>
				{#each SAVED_VIEWS as v (v.href)}
					<a
						href={v.href}
						class="relative mx-1 my-[1px] flex items-center gap-2.5 rounded-[7px] px-3 py-[8px] text-[14px] text-text-2 transition-colors hover:bg-[var(--row-hover)] hover:text-text
						{navActive('/tickets', v.match) ? 'bg-[var(--row-active)] !text-text' : ''}"
					>
						<span class="grid h-4 w-4 shrink-0 place-items-center">
							<span class="h-[12px] w-[12px] rounded-full border-[1.5px]" style:border-color={v.dot}
							></span>
						</span>
						<span class="truncate">{v.label()}</span>
					</a>
				{/each}
			</div>
		{/if}

		<!-- Pinned -->
		{#if pinned.length}
			<div class="py-1.5">
				<div
					class="px-3 pt-1.5 pb-1.5 text-[12px] font-medium tracking-[0.08em] text-text-4 uppercase"
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
				class="px-3 pt-1.5 pb-1.5 text-[12px] font-medium tracking-[0.08em] text-text-4 uppercase"
			>
				{m.shell_portal_recents()}
			</div>
			{#each recents as t (t.id)}
				{@render ticketRow(t)}
			{/each}
			{#if recents.length === 0}
				<div class="px-3 py-1.5 text-[13px] leading-snug text-text-4">
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
		class="relative mx-1 my-[1px] flex items-center gap-2.5 rounded-[7px] px-3 py-[8px] text-[14px] text-text-2 transition-colors hover:bg-[var(--row-hover)] hover:text-text
		{active ? 'bg-[var(--row-active)] !text-text' : ''}"
	>
		<span class="grid h-4 w-4 shrink-0 place-items-center" title={ticketStatusLabel(t.status)}>
			<span
				class="h-[12px] w-[12px] rounded-full border-[1.5px]"
				style:border-color={dot}
				style:background={filled ? dot : 'transparent'}
			></span>
		</span>
		<span class="truncate">{t.subject}</span>
	</a>
{/snippet}
