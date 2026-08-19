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
	import { readView, saveView, flushViewSaves } from '$lib/stores/view';
	import type { SavedViewEntry } from '$lib/components/ViewsMenu.svelte';
	import type { TicketRow } from '$lib/server/tickets';
	import { m } from '$lib/paraglide/messages';
	import { isPortalSeeAllRole } from '$lib/roles';

	type LinkedTask = { id: string; displayId: string; title: string; status: string };
	type AppUser = {
		id: string;
		name: string;
		initials: string;
		color: string;
		status: string;
		internal?: boolean;
		orgIds?: string[];
	};
	type PageData = {
		tickets: TicketRow[];
		canCreateTicket: boolean;
		isAgent: boolean;
		editableOrgIds: string[];
		linkedTasksByTicket: Record<string, LinkedTask[]>;
		orgs?: { id: string; name: string; slug: string; color: string }[];
		users?: AppUser[];
		assignableUsers?: AppUser[];
		isTrackrTeam?: boolean;
		isPortalUser?: boolean;
		portalRole?: string | null;
		activeOrgId?: string | null;
		effectivePermissions?: string[];
		savedView?: Record<string, unknown>;
	};

	let { data }: { data: PageData } = $props();

	// Portal clients get a simplified, read-only overview: no agent-oriented
	// controls, and the New button routes to the full /tickets/new page (not the
	// in-app compose modal).
	const isPortal = $derived(!!data.isPortalUser);
	// Portal *members* (own-tickets-only) get a stripped-down, list-only bar:
	// no board/group/filter chrome. The see-all tier (org.client + org.agent)
	// keeps the full board/list experience. `memberOnly` reads the per-active-org role.
	const memberOnly = $derived(isPortal && !isPortalSeeAllRole(data.portalRole));

	type GroupBy = 'status' | 'priority' | 'category' | 'org' | 'assignee' | 'none';
	type SubGroup = 'none' | 'status' | 'priority' | 'category' | 'assignee';
	type SavedView = {
		view?: 'list' | 'board';
		listGroup?: GroupBy;
		boardGroup?: GroupBy;
		sub?: SubGroup;
		filters?: Record<string, string[]>;
		// Collapsed group/column ids per grouping mode (see readCollapsed).
		listCollapsed?: Record<string, string[]>;
		boardCollapsed?: Record<string, string[]>;
		savedViews?: SavedViewEntry<TicketsViewConfig>[];
	};
	type TicketsViewConfig = {
		view: 'list' | 'board';
		listGroup: GroupBy;
		boardGroup: GroupBy;
		sub: SubGroup;
		filters: Record<string, string[]>;
	};
	// localStorage cache wins over the server snapshot — see /tasks for rationale.
	const saved: SavedView = {
		...((data.savedView ?? {}) as SavedView),
		...readView<SavedView>('tickets')
	};
	const urlView = page.url.searchParams.get('view');

	// Saved-view deep-links (sidebar shortcuts like ?status=open or
	// ?assignee=__unassigned__) seed the filter state and win over the saved
	// snapshot. Reads the five filterable fields; comma-splits multi-values.
	// Returns null when the URL carries no filter params so the saved snapshot
	// keeps precedence.
	function parseFiltersFromUrl(sp: URLSearchParams): Record<string, string[]> | null {
		const fields = ['status', 'priority', 'category', 'tags', 'assignee', 'org'];
		const out: Record<string, string[]> = {};
		for (const f of fields) {
			const raw = sp.get(f);
			if (!raw) continue;
			const values = raw
				.split(',')
				.map((v) => v.trim())
				.filter(Boolean);
			if (values.length) out[f] = values;
		}
		return Object.keys(out).length ? out : null;
	}
	const urlFilters = parseFiltersFromUrl(page.url.searchParams);

	// Portal members can't reach the board (the toggle is hidden), so clamp a
	// stale board snapshot to list for them.
	const memberOnlyInit = !!data.isPortalUser && !isPortalSeeAllRole(data.portalRole);

	let view = $state<'list' | 'board'>(
		memberOnlyInit
			? 'list'
			: urlView === 'board'
				? 'board'
				: urlView === 'list'
					? 'list'
					: (saved.view ?? 'list')
	);
	// Separate group state per view: list defaults to status sections, board to
	// status columns.
	let listGroup = $state<GroupBy>(saved.listGroup ?? 'status');
	let boardGroup = $state<GroupBy>(saved.boardGroup ?? 'status');
	let group = $derived(view === 'list' ? listGroup : boardGroup);
	let sub = $state<SubGroup>(saved.sub ?? 'none');
	// URL deep-link wins over the persisted snapshot. Transient: not written back
	// via saveView, so it doesn't stick once the user navigates away.
	let filters = $state<Record<string, string[]>>(urlFilters ?? saved.filters ?? {});
	let search = $state('');

	// Switching between the sidebar's saved-view shortcuts navigates within the
	// same /tickets page — SvelteKit reuses the component, so the $state
	// initializers above don't re-run. Re-apply the URL's filter + view params
	// whenever the query string actually changes. Manual filter/view edits don't
	// touch the URL, so this never fires for (or clobbers) them.
	let lastSearch = page.url.search;
	$effect(() => {
		const currentSearch = page.url.search;
		if (currentSearch === lastSearch) return;
		lastSearch = currentSearch;
		const parsed = parseFiltersFromUrl(page.url.searchParams);
		if (parsed) filters = parsed;
		const v = page.url.searchParams.get('view');
		if (v === 'board' || v === 'list') view = v;
	});
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

	// ── Saved custom views (named filter+layout presets) ─────────────────────
	const GROUP_IDS: GroupBy[] = ['status', 'priority', 'category', 'org', 'assignee', 'none'];
	const SUB_IDS: SubGroup[] = ['none', 'status', 'priority', 'category', 'assignee'];
	const isGroupBy = (v: unknown): v is GroupBy => GROUP_IDS.includes(v as GroupBy);
	const isSubGroup = (v: unknown): v is SubGroup => SUB_IDS.includes(v as SubGroup);
	let savedViews = $state<SavedViewEntry<TicketsViewConfig>[]>(
		Array.isArray(saved.savedViews)
			? saved.savedViews.filter((v) => typeof v?.id === 'string' && typeof v?.name === 'string')
			: []
	);
	const currentConfig = $derived<TicketsViewConfig>({ view, listGroup, boardGroup, sub, filters });
	// Configs come from storage, so guard every field against page defaults —
	// a stale enum value must degrade gracefully, never break the page.
	function applySavedView(cfg: TicketsViewConfig) {
		view = cfg.view === 'board' ? 'board' : 'list';
		listGroup = isGroupBy(cfg.listGroup) ? cfg.listGroup : 'status';
		boardGroup = isGroupBy(cfg.boardGroup) ? cfg.boardGroup : 'status';
		sub = isSubGroup(cfg.sub) ? cfg.sub : 'none';
		filters = cfg.filters && typeof cfg.filters === 'object' ? cfg.filters : {};
		// The applied view becomes the live state, so it survives a reload.
		saveView('tickets', { view, listGroup, boardGroup, sub, filters });
	}
	function changeSavedViews(next: SavedViewEntry<TicketsViewConfig>[]) {
		savedViews = next;
		saveView('tickets', { savedViews: next });
		// CRUD is rare and explicit — flush immediately rather than risk losing
		// the debounced write to a quick navigation.
		flushViewSaves();
	}

	const orgs = $derived(data.orgs ?? []);
	// Assignee candidates: org members (clients/agents/members) + internal platform
	// agents. Scoped per selected ticket below — internal agents are assignable on
	// every org; org members only on their own.
	const assignable = $derived(data.assignableUsers ?? []);
	const canDelete = $derived((data.effectivePermissions ?? []).includes('org.tickets.delete.any'));
	// Checklist is participant-editable: agents (edit.any) and anyone who can
	// comment (the org.client admin + owning org.member). The server re-checks
	// per-ticket via canViewTicket.
	const canEditChecklist = $derived(
		(data.effectivePermissions ?? []).includes('org.tickets.comment') ||
			(data.effectivePermissions ?? []).includes('org.tickets.edit.any')
	);

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

	// Assignee candidates for the selected ticket: its org's members plus internal
	// platform agents. Filtered from the org-wide `assignable` set by the selected
	// ticket's org so the picker never offers people from an unrelated org.
	const ticketAgents = $derived(
		selected
			? assignable.filter(
					(u) =>
						u.status !== 'disabled' && (u.internal || (u.orgIds ?? []).includes(selected!.orgId))
				)
			: []
	);

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
				// Any-match over the tag set: a ticket passes if it carries any selected tag.
				if (field === 'tags' && !t.tags.some((tg) => values.includes(tg))) return false;
				// Any-match over the assignee set: a ticket passes if it's assigned to
				// any selected person. Unassigned is matched via the `__unassigned__`
				// sentinel (used by the admin dashboard / sidebar deep-links).
				if (field === 'assignee') {
					const tags = t.assignees.length ? t.assignees : ['__unassigned__'];
					if (!tags.some((a) => values.includes(a))) return false;
				}
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
	minimal={memberOnly}
	viewsMenu={memberOnly
		? undefined
		: {
				views: savedViews,
				current: currentConfig,
				onApply: applySavedView,
				onChange: changeSavedViews
			}}
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
		persistKey="tickets"
		initialCollapsed={saved.listCollapsed}
		onSelect={(t) => (manualSelectedId = t.id)}
		selectedId={selected?.id}
	/>
{:else}
	<BoardView
		tickets={filtered}
		group={boardGroup}
		persistKey="tickets"
		initialCollapsed={saved.boardCollapsed}
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
	{canEditChecklist}
	{canDelete}
	users={ticketAgents}
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
