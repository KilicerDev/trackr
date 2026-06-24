<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Toolbar from '$lib/components/tickets/Toolbar.svelte';
	import ListView from '$lib/components/tickets/ListView.svelte';
	import CreateTicketModal from '$lib/components/tickets/CreateTicketModal.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { readView, saveView } from '$lib/viewState';
	import type { TicketRow } from '$lib/server/tickets';
	import { m } from '$lib/paraglide/messages';

	type PageData = {
		tickets: TicketRow[];
		canCreateTicket: boolean;
		orgs?: { id: string; name: string; slug: string; color: string }[];
		savedView?: Record<string, unknown>;
	};

	let { data }: { data: PageData } = $props();

	type GroupBy = 'status' | 'priority' | 'category' | 'org' | 'none';
	type SavedView = {
		group?: GroupBy;
		filters?: Record<string, string[]>;
	};
	// localStorage cache wins over the server snapshot — see /tasks for rationale.
	const saved: SavedView = {
		...((data.savedView ?? {}) as SavedView),
		...readView<SavedView>('tickets')
	};

	let group = $state<GroupBy>(saved.group ?? 'status');
	let filters = $state<Record<string, string[]>>(saved.filters ?? {});
	let search = $state('');
	let createOpen = $state(false);

	function setGroup(g: GroupBy) {
		group = g;
		saveView('tickets', { group: g });
	}
	function setFilters(f: Record<string, string[]>) {
		filters = f;
		saveView('tickets', { filters: f });
	}

	const orgs = $derived(data.orgs ?? []);

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
				if (field === 'org' && !values.includes(t.orgId)) return false;
			}
			return true;
		});
	});

	// Keep filters reactive to page navigation back into /tickets.
	$effect(() => {
		void page.url;
	});
</script>

<svelte:head><title>{m.tickets_page_title()}</title></svelte:head>

<Topbar
	crumbs={[
		{ label: m.tickets_breadcrumb_workspace(), href: '/tasks' },
		{ label: m.tickets_breadcrumb_support() }
	]}
/>

<Toolbar
	{search}
	setSearch={(s) => (search = s)}
	{filters}
	{setFilters}
	{group}
	{setGroup}
	canCreate={data.canCreateTicket}
	onNew={() => (createOpen = true)}
	{orgs}
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
{:else}
	<ListView tickets={filtered} {group} onSelect={(t) => goto(`/tickets/${t.id}`)} />
{/if}

<CreateTicketModal open={createOpen} onclose={() => (createOpen = false)} {orgs} />
