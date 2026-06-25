<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Toolbar from '$lib/components/tickets/Toolbar.svelte';
	import ListView from '$lib/components/tickets/ListView.svelte';
	import BoardView from '$lib/components/tickets/BoardView.svelte';
	import Inspector from '$lib/components/tickets/Inspector.svelte';
	import CreateTicketModal from '$lib/components/tickets/CreateTicketModal.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { readView, saveView } from '$lib/stores/view';
	import type { TicketRow } from '$lib/server/tickets';
	import { m } from '$lib/paraglide/messages';

	type LinkedTask = { id: string; displayId: string; title: string; status: string };
	type AppUser = {
		id: string;
		name: string;
		initials: string;
		color: string;
		status: string;
		internal?: boolean;
	};
	type PageData = {
		tickets: TicketRow[];
		canCreateTicket: boolean;
		isAgent: boolean;
		editableOrgIds: string[];
		linkedTasksByTicket: Record<string, LinkedTask[]>;
		orgs?: { id: string; name: string; slug: string; color: string }[];
		users?: AppUser[];
		isTrackrTeam?: boolean;
		isPortalUser?: boolean;
		activeOrgId?: string | null;
		effectivePermissions?: string[];
		savedView?: Record<string, unknown>;
	};

	let { data }: { data: PageData } = $props();

	// Portal clients get a simplified, read-only overview: no agent-oriented
	// controls, and the New button routes to the full /tickets/new page (not the
	// in-app compose modal).
	const isPortal = $derived(!!data.isPortalUser);

	type GroupBy = 'status' | 'priority' | 'category' | 'org' | 'assignee' | 'none';
	type SubGroup = 'none' | 'status' | 'priority' | 'category' | 'assignee';
	type SavedView = {
		view?: 'list' | 'board';
		listGroup?: GroupBy;
		boardGroup?: GroupBy;
		sub?: SubGroup;
		filters?: Record<string, string[]>;
	};
	// localStorage cache wins over the server snapshot — see /tasks for rationale.
	const saved: SavedView = {
		...((data.savedView ?? {}) as SavedView),
		...readView<SavedView>('tickets')
	};
	const urlView = page.url.searchParams.get('view');

	let view = $state<'list' | 'board'>(
		urlView === 'board' ? 'board' : urlView === 'list' ? 'list' : (saved.view ?? 'list')
	);
	// Separate group state per view: list defaults to status sections, board to
	// status columns.
	let listGroup = $state<GroupBy>(saved.listGroup ?? 'status');
	let boardGroup = $state<GroupBy>(saved.boardGroup ?? 'status');
	let group = $derived(view === 'list' ? listGroup : boardGroup);
	let sub = $state<SubGroup>(saved.sub ?? 'none');
	let filters = $state<Record<string, string[]>>(saved.filters ?? {});
	let search = $state('');
	let createOpen = $state(false);
	let createPrefillOrg = $state<string | null>(null);

	function setView(v: 'list' | 'board') {
		view = v;
		saveView('tickets', { view: v });
	}
	function setGroup(g: GroupBy) {
		if (view === 'list') {
			listGroup = g;
			saveView('tickets', { listGroup: g });
		} else {
			boardGroup = g;
			saveView('tickets', { boardGroup: g });
		}
	}
	function setSub(s: SubGroup) {
		sub = s;
		saveView('tickets', { sub: s });
	}
	function setFilters(f: Record<string, string[]>) {
		filters = f;
		saveView('tickets', { filters: f });
	}

	const orgs = $derived(data.orgs ?? []);
	// Internal agents are the assignable users for tickets.
	const agents = $derived((data.users ?? []).filter((u) => u.internal && u.status !== 'disabled'));
	const canDelete = $derived((data.effectivePermissions ?? []).includes('org.tickets.delete.any'));

	function canEditTicket(t: TicketRow): boolean {
		return !!data.isTrackrTeam || (data.editableOrgIds ?? []).includes(t.orgId);
	}

	// Selection drives the Inspector. Manual click wins; otherwise the ?ticket=
	// deep-link param. Look up in the UNFILTERED set so a deep-linked ticket opens
	// even when the active filters would hide it.
	let manualSelectedId = $state<string | null>(null);
	let selected = $derived.by(() => {
		const id = manualSelectedId ?? page.url.searchParams.get('ticket');
		return id ? (data.tickets.find((t) => t.id === id) ?? null) : null;
	});

	function closeInspector() {
		manualSelectedId = null;
		if (page.url.searchParams.has('ticket')) {
			const url = new URL(page.url);
			url.searchParams.delete('ticket');
			const qs = url.searchParams.toString();
			void goto(qs ? `?${qs}` : '?', { keepFocus: true, noScroll: true, replaceState: true });
		}
	}

	function openCreate(orgId: string | null = null) {
		if (isPortal) {
			void goto('/tickets/new');
			return;
		}
		createPrefillOrg = orgId;
		createOpen = true;
	}

	const activeOrg = $derived((data.orgs ?? []).find((o) => o.id === data.activeOrgId));

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return data.tickets.filter((t) => {
			if (q) {
				const hay = `${t.subject} ${t.displayId}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			for (const [field, values] of Object.entries(filters)) {
				if (!values?.length) continue;
				if (field === 'status' && !values.includes(t.status)) return false;
				if (field === 'priority' && !values.includes(t.priority)) return false;
				if (field === 'category' && !values.includes(t.category)) return false;
				if (field === 'assignee' && !values.includes(t.assignedAgentId ?? '')) return false;
				if (field === 'org' && !values.includes(t.orgId)) return false;
			}
			return true;
		});
	});
</script>

<svelte:head><title>{m.tickets_page_title()}</title></svelte:head>

<Topbar
	crumbs={isPortal
		? [{ label: activeOrg?.name ?? m.shell_portal_support() }, { label: m.shell_portal_overview() }]
		: [
				{ label: m.tickets_breadcrumb_workspace(), href: '/tasks' },
				{ label: m.tickets_breadcrumb_support() }
			]}
/>

<Toolbar
	{view}
	{setView}
	{search}
	setSearch={(s) => (search = s)}
	{filters}
	{setFilters}
	{group}
	{setGroup}
	{sub}
	{setSub}
	canCreate={data.canCreateTicket}
	onNew={() => openCreate()}
	{orgs}
	portal={isPortal}
/>

{#if data.tickets.length === 0}
	<div class="grid min-h-0 flex-1 place-items-center">
		<EmptyState
			icon="ticket"
			title={m.tickets_empty_title()}
			hint={data.canCreateTicket
				? m.tickets_empty_hint_can_create()
				: m.tickets_empty_hint_readonly()}
		/>
	</div>
{:else if view === 'list'}
	<ListView
		tickets={filtered}
		{group}
		onSelect={(t) => (manualSelectedId = t.id)}
		selectedId={selected?.id}
	/>
{:else}
	<BoardView
		tickets={filtered}
		group={boardGroup}
		{sub}
		onSelect={(t) => (manualSelectedId = t.id)}
		onAddInOrg={(orgId) => openCreate(orgId)}
		canCreate={data.canCreateTicket}
	/>
{/if}

<Inspector
	ticket={selected}
	onclose={closeInspector}
	canEdit={selected ? canEditTicket(selected) : false}
	{canDelete}
	users={agents}
	linkedTasks={selected ? (data.linkedTasksByTicket?.[selected.id] ?? []) : []}
/>

{#if !isPortal}
	<CreateTicketModal
		open={createOpen}
		onclose={() => (createOpen = false)}
		{orgs}
		prefillOrgId={createPrefillOrg}
	/>
{/if}
