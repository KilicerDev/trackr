<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { TicketRow } from '$lib/server/tickets';
	import { m } from '$lib/paraglide/messages';

	type PageData = {
		tickets: TicketRow[];
		orgs?: { id: string; name: string }[];
		activeOrgId?: string | null;
	};
	let { data }: { data: PageData } = $props();

	const activeOrg = $derived((data.orgs ?? []).find((o) => o.id === data.activeOrgId));

	// All counts derive client-side from the (org-scoped) ticket set the server
	// already loaded — no second source of truth, and the numbers match the board
	// the cards link into exactly.
	const DONE = new Set(['resolved', 'closed']);
	const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

	const cards = $derived.by(() => {
		const tickets = data.tickets ?? [];
		const now = Date.now();
		const open = tickets.filter((t) => t.status === 'open').length;
		const unassigned = tickets.filter((t) => !t.assignedAgentId && !DONE.has(t.status)).length;
		const closedWeek = tickets.filter(
			(t) => t.closedAt != null && now - Date.parse(t.closedAt) <= WEEK_MS
		).length;

		return [
			{
				label: m.tickets_dash_open(),
				hint: m.tickets_dash_open_hint(),
				value: open,
				dot: '#7a9cf0',
				href: '/tickets?status=open&view=board'
			},
			{
				label: m.tickets_dash_unassigned(),
				hint: m.tickets_dash_unassigned_hint(),
				value: unassigned,
				dot: '#9aa4b2',
				href: '/tickets?assignee=__unassigned__&view=board'
			},
			{
				label: m.tickets_dash_closed_week(),
				hint: m.tickets_dash_closed_week_hint(),
				value: closedWeek,
				dot: '#7c7c84',
				href: '/tickets?status=closed&view=board'
			}
		];
	});
</script>

<svelte:head><title>{m.tickets_dash_title()} · {m.shell_portal_support()}</title></svelte:head>

<Topbar
	crumbs={[
		{ label: activeOrg?.name ?? m.shell_portal_support() },
		{ label: m.tickets_dash_title() }
	]}
/>

<div class="min-h-0 flex-1 overflow-y-auto px-6 py-6">
	<div class="mx-auto max-w-5xl">
		<header class="mb-5">
			<h1 class="text-[22px] font-semibold text-text">{m.tickets_dash_title()}</h1>
			<p class="mt-0.5 text-[14px] text-text-3">{m.tickets_dash_subtitle()}</p>
		</header>

		{#if (data.tickets ?? []).length === 0}
			<div class="grid place-items-center py-16">
				<EmptyState icon="ticket" title={m.tickets_empty_title()} hint={m.tickets_dash_empty()} />
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each cards as c (c.label)}
					<a
						href={c.href}
						class="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
					>
						<div class="flex items-center gap-2">
							<span class="h-2 w-2 shrink-0 rounded-full" style:background={c.dot}></span>
							<span class="text-[13px] font-medium text-text-2">{c.label}</span>
							<Icon
								name="chevron-r"
								size={14}
								class="ml-auto text-text-4 opacity-0 transition-opacity group-hover:opacity-100"
							/>
						</div>
						<div class="text-[31px] leading-none font-semibold text-text tabular-nums">
							{c.value}
						</div>
						<div class="text-[12px] text-text-4">{c.hint}</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>
