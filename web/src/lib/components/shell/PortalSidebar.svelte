<script lang="ts">
	import { page } from '$app/state';
	import Icon from '../Icon.svelte';
	import InstanceSwitcher from './InstanceSwitcher.svelte';
	import RailHeading from './RailHeading.svelte';
	import { Rail } from './rail.svelte';
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
	const pinned = $derived((page.data as LayoutShape).pinnedTickets ?? []);
	const recents = $derived((page.data as LayoutShape).recentTickets ?? []);
	// The see-all tier (org.client + the privileged org.agent) gets the richer
	// nav: a dashboard, the full board, and saved-view shortcuts. Keyed off the
	// per-active-org role so it flips correctly on org switch.
	const isAdmin = $derived(isPortalSeeAllRole((page.data as LayoutShape).portalRole));
	// Members (the see-all tier) get the org chat; standard own-tickets users
	// don't. Read from the server-computed capability manifest.
	const canChat = $derived(!!(page.data as LayoutShape).capabilities?.surfaces.chat);

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
		if (orgId !== activeOrgId) await setActiveOrg(orgId);
	}

	// Collapse + hover-peek mechanics live in Rail (shared with the app rail).
	const rail = new Rail(286);
</script>

<aside
	onmouseenter={() => rail.setHover(true)}
	onmouseleave={() => rail.setHover(false)}
	onfocusin={rail.focusin}
	onfocusout={rail.focusout}
	class={rail.aside}
	style:width={rail.width}
>
	<!-- Brand tile: instance switcher + organization switcher (TRACK-140). -->
	<InstanceSwitcher
		fade={rail.fade}
		{orgs}
		{activeOrgId}
		onChooseOrg={choose}
		bind:open={rail.menuOpen}
	/>

	<!--
		Primary actions. "New ticket" keeps its outlined-button look via an inset
		ring rather than a border, so it shares the exact row geometry (and the
		pinned icon axis) with the plain rows around it.
	-->
	<nav class="mt-1.5 px-2 py-1.5">
		<a
			href="/tickets/new"
			aria-label={rail.rail ? m.shell_portal_new_ticket() : undefined}
			class="{rail.rowBase} bg-surface ring-1 ring-border ring-inset hover:text-text hover:ring-border-strong {page
				.url.pathname === '/tickets/new'
				? '!text-text ring-border-strong'
				: ''}"
		>
			<span class={rail.icon(false)}>
				<Icon name="plus" size={18} />
			</span>
			<span class={rail.fade}>{m.shell_portal_new_ticket()}</span>
		</a>

		{#if isAdmin}
			{@render link(
				'/tickets/dashboard',
				'grid',
				m.shell_portal_dashboard(),
				navActive('/tickets/dashboard')
			)}
			{@render link('/tickets', 'ticket', m.shell_portal_tickets(), ticketsActive())}
		{:else}
			<!-- Overview (member: their own tickets) -->
			{@render link(
				'/tickets',
				'ticket',
				m.shell_portal_overview(),
				page.url.pathname === '/tickets'
			)}
		{/if}
		{#if canChat}
			{@render link('/chat', 'msg', m.shell_nav_chat(), page.url.pathname.startsWith('/chat'))}
		{/if}
	</nav>

	<div class="flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
		<!-- Saved views (admin only) -->
		{#if isAdmin}
			<div class="py-1.5">
				<RailHeading {rail} label={m.shell_portal_saved_views()} />
				{#each SAVED_VIEWS as v (v.href)}
					{@const active = navActive('/tickets', v.match)}
					<a
						href={v.href}
						aria-label={rail.rail ? v.label() : undefined}
						class="{rail.row} {active ? 'bg-[var(--row-active)] !text-text' : ''}"
					>
						<span class="grid h-[18px] w-[18px] shrink-0 place-items-center">
							<span class="h-[12px] w-[12px] rounded-full border-[1.5px]" style:border-color={v.dot}
							></span>
						</span>
						<span class="min-w-0 flex-1 truncate {rail.fade}">{v.label()}</span>
					</a>
				{/each}
			</div>
		{/if}

		<!-- Pinned -->
		{#if pinned.length}
			<div class="py-1.5">
				<RailHeading {rail} label={m.shell_portal_pinned()} divider />
				{#each pinned as t (t.id)}
					{@render ticketRow(t)}
				{/each}
			</div>
		{/if}

		<!-- Recents -->
		<div class="py-1.5">
			<RailHeading {rail} label={m.shell_portal_recents()} divider />
			{#each recents as t (t.id)}
				{@render ticketRow(t)}
			{/each}
			{#if recents.length === 0}
				<div class="px-3 py-1.5 text-[13px] leading-snug text-text-4 {rail.fade}">
					{m.shell_portal_recents_empty()}
				</div>
			{/if}
		</div>
	</div>
</aside>

{#snippet link(href: string, icon: string, label: string, active: boolean)}
	<a
		{href}
		aria-label={rail.rail ? label : undefined}
		class="{rail.row} {active ? 'bg-[var(--row-active)] !text-text' : ''}"
	>
		<span class={rail.icon(active)}>
			<Icon name={icon} size={18} />
		</span>
		<span class={rail.fade}>{label}</span>
	</a>
{/snippet}

{#snippet ticketRow(t: TicketRow)}
	{@const active = isActiveTicket(t.id)}
	{@const dot = statusColor(t.status)}
	{@const filled = t.status === 'resolved' || t.status === 'closed'}
	<a
		href="/tickets/{t.id}"
		title={t.subject}
		class="{rail.row} {active ? 'bg-[var(--row-active)] !text-text' : ''}"
	>
		<span
			class="grid h-[18px] w-[18px] shrink-0 place-items-center"
			title={ticketStatusLabel(t.status)}
		>
			<span
				class="h-[12px] w-[12px] rounded-full border-[1.5px]"
				style:border-color={dot}
				style:background={filled ? dot : 'transparent'}
			></span>
		</span>
		<span class="min-w-0 flex-1 truncate {rail.fade}">{t.subject}</span>
	</a>
{/snippet}
