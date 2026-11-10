<script lang="ts">
	import { pageTitle } from '$lib/brand';
	import MobileMenuButton from '$lib/components/shell/MobileMenuButton.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { ROW } from '$lib/components/tasks/panel/styles';
	import type { TicketRow } from '$lib/server/tickets';
	import { TICKET_CATEGORIES, TICKET_STATUSES } from '$lib/config/taxonomy';
	import { ticketCategoryLabel, ticketStatusLabel } from '$lib/utils/labels';
	import { relTime } from '$lib/utils/ticket-sla';
	import { formatDateShort } from '$lib/utils/format';
	import { m } from '$lib/paraglide/messages';

	type PageData = {
		tickets: TicketRow[];
	};
	let { data }: { data: PageData } = $props();

	// Everything derives client-side from the (org-scoped) ticket set the server
	// already loaded — one source of truth, and the numbers match the list the
	// links lead into.
	const DAY = 24 * 60 * 60 * 1000;
	const DONE = new Set(['resolved', 'closed']);
	const tickets = $derived(data.tickets ?? []);
	const active = $derived(tickets.filter((t) => !DONE.has(t.status)));
	const now = Date.now();

	// Waiting on the customer = on this organization: the team needs a reply.
	const waitingOnYou = $derived(
		active
			.filter((t) => t.status === 'waiting_on_customer')
			.sort((a, b) =>
				(b.lastMessageAt ?? b.updatedAt).localeCompare(a.lastMessageAt ?? a.updatedAt)
			)
	);
	const unanswered = $derived(active.filter((t) => !t.firstResponseAt));
	const resolvedWeek = $derived(
		tickets.filter((t) => {
			const at = t.resolvedAt ?? t.closedAt;
			return at != null && now - Date.parse(at) <= 7 * DAY;
		}).length
	);

	// Average time to the first reply, over tickets opened in the last 30 days.
	const firstResponse = $derived.by(() => {
		const spans = tickets
			.filter((t) => t.firstResponseAt && now - Date.parse(t.createdAt) <= 30 * DAY)
			.map((t) => Date.parse(t.firstResponseAt!) - Date.parse(t.createdAt))
			.filter((ms) => ms >= 0);
		if (!spans.length) return null;
		const mins = spans.reduce((a, b) => a + b, 0) / spans.length / 60_000;
		if (mins < 60) return `${Math.max(1, Math.round(mins))}m`;
		if (mins < 48 * 60) return `${(mins / 60).toFixed(mins < 600 ? 1 : 0)}h`;
		return `${(mins / 1440).toFixed(1)}d`;
	});

	const stats = $derived([
		{ label: m.tickets_dash_active(), value: String(active.length), href: '/tickets' },
		{
			label: m.tickets_dash_waiting_you(),
			value: String(waitingOnYou.length),
			href: '/tickets?status=waiting_on_customer',
			accent: waitingOnYou.length > 0
		},
		{ label: m.tickets_dash_unanswered(), value: String(unanswered.length), href: '/tickets' },
		{
			label: m.tickets_dash_resolved_week(),
			value: String(resolvedWeek),
			href: '/tickets?status=resolved'
		},
		{
			label: m.tickets_dash_first_response(),
			value: firstResponse ?? '—',
			hint: m.tickets_dash_last_30_days()
		}
	]);

	// Most recently moved active tickets (the ones waiting on you are listed above).
	const recent = $derived(
		active
			.filter((t) => t.status !== 'waiting_on_customer')
			.sort((a, b) =>
				(b.lastMessageAt ?? b.updatedAt).localeCompare(a.lastMessageAt ?? a.updatedAt)
			)
			.slice(0, 8)
	);

	const byStatus = $derived(
		TICKET_STATUSES.filter((s) => !DONE.has(s.id))
			.map((s) => ({ ...s, n: active.filter((t) => t.status === s.id).length }))
			.filter((s) => s.n > 0)
	);
	const byCategory = $derived(
		TICKET_CATEGORIES.map((c) => ({
			...c,
			n: active.filter((t) => t.category === c.id).length
		})).filter((c) => c.n > 0)
	);
	const maxStatus = $derived(Math.max(1, ...byStatus.map((s) => s.n)));
	const maxCategory = $derived(Math.max(1, ...byCategory.map((c) => c.n)));

	// New tickets per week, the last 8 weeks (oldest first).
	const weeks = $derived.by(() => {
		const d = new Date(now);
		const today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
		const monday = today - ((d.getDay() + 6) % 7) * DAY;
		return Array.from({ length: 8 }, (_, i) => {
			const from = monday - (7 - i) * 7 * DAY;
			const to = from + 7 * DAY;
			const n = tickets.filter((t) => {
				const c = Date.parse(t.createdAt);
				return c >= from && c < to;
			}).length;
			return { from, n };
		});
	});
	const maxWeek = $derived(Math.max(1, ...weeks.map((w) => w.n)));

	const PANEL = 'overflow-hidden rounded-xl border border-border';
	const PANEL_HEAD = 'flex h-11 items-center gap-2 border-b border-border/70 px-4';
	const PANEL_BODY = 'px-4 py-2';

	const statusDot = (id: string) => TICKET_STATUSES.find((s) => s.id === id)?.dot ?? '#7c7c84';
</script>

<svelte:head
	><title>{pageTitle(`${m.tickets_dash_title()} · ${m.shell_portal_support()}`)}</title
	></svelte:head
>

{#snippet ticketRow(t: TicketRow)}
	<a href="/tickets/{t.id}" class="group {ROW}">
		<span class="grid h-5 w-5 shrink-0 place-items-center">
			<span class="h-2 w-2 rounded-full" style:background={statusDot(t.status)}></span>
		</span>
		<span class="w-[78px] shrink-0 font-mono text-[12px] leading-5 text-text-4">{t.displayId}</span>
		<span class="min-w-0 flex-1 truncate text-[14px] leading-5 text-text-2 group-hover:text-text"
			>{t.subject}</span
		>
		<span class="shrink-0 text-[12px] leading-5 text-text-4"
			>{relTime(t.lastMessageAt ?? t.updatedAt)}</span
		>
	</a>
{/snippet}

<div class="min-h-0 flex-1 overflow-y-auto px-6 py-6">
	<div class="mx-auto max-w-5xl">
		<header class="mb-6 flex flex-wrap items-end gap-3">
			<div class="min-w-0 flex-1">
				<MobileMenuButton class="mb-2" />
				<h1 class="text-[24px] font-semibold tracking-[-0.012em] text-text">
					{m.tickets_dash_title()}
				</h1>
				<p class="mt-0.5 text-[14px] text-text-3">{m.tickets_dash_subtitle()}</p>
			</div>
			<a
				href="/tickets/new"
				class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[14px] leading-none font-medium text-white transition-colors hover:bg-accent-strong"
			>
				<Icon name="plus" size={15} />
				{m.tickets_new_title()}
			</a>
		</header>

		{#if tickets.length === 0}
			<div class="grid place-items-center py-16">
				<EmptyState icon="ticket" title={m.tickets_empty_title()} hint={m.tickets_dash_empty()} />
			</div>
		{:else}
			<!-- The numbers: one strip with hairline dividers. -->
			<div
				class="mb-5 grid grid-cols-2 gap-y-4 rounded-xl border border-border py-3.5 sm:grid-cols-3 lg:grid-cols-5"
			>
				{#each stats as s (s.label)}
					{@const cell = 'block px-4 lg:border-l lg:border-border lg:first:border-l-0'}
					{#if s.href}
						<a href={s.href} class="{cell} group">
							<div class="flex items-center gap-1 text-[12px] text-text-3 group-hover:text-text-2">
								{s.label}
								<Icon
									name="chevron-r"
									size={12}
									class="opacity-0 transition-opacity group-hover:opacity-100"
								/>
							</div>
							<div
								class="mt-1 text-[22px] leading-7 font-semibold {s.accent
									? 'text-accent'
									: 'text-text'}"
							>
								{s.value}
							</div>
						</a>
					{:else}
						<div class={cell}>
							<div class="text-[12px] text-text-3">{s.label}</div>
							<div class="mt-1 text-[22px] leading-7 font-semibold text-text">{s.value}</div>
							{#if s.hint}<div class="text-[12px] text-text-4">{s.hint}</div>{/if}
						</div>
					{/if}
				{/each}
			</div>

			<!-- Below the numbers: each section in its own framed panel (header
			     row with a hairline), so they read as separate blocks. -->
			<div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
				<div class="min-w-0 space-y-5">
					<section class={PANEL}>
						<header class={PANEL_HEAD}>
							<h2 class="text-[13px] font-medium text-text">{m.tickets_dash_needs_reply()}</h2>
							{#if waitingOnYou.length}
								<span class="font-mono text-[12px] text-accent">{waitingOnYou.length}</span>
							{/if}
						</header>
						<div class={PANEL_BODY}>
							{#if waitingOnYou.length}
								{#each waitingOnYou as t (t.id)}
									{@render ticketRow(t)}
								{/each}
							{:else}
								<p class="flex items-center gap-2 px-2 py-2 text-[14px] text-text-3">
									<Icon name="check" size={14} class="text-[#7fc8a9]" />
									{m.tickets_dash_needs_reply_empty()}
								</p>
							{/if}
						</div>
					</section>

					<section class={PANEL}>
						<header class={PANEL_HEAD}>
							<h2 class="text-[13px] font-medium text-text">{m.tickets_dash_recent()}</h2>
							<a
								href="/tickets"
								class="-mr-1.5 ml-auto inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] text-text-3 transition-colors hover:bg-surface hover:text-text"
							>
								{m.tickets_dash_view_all()}
								<Icon name="chevron-r" size={12} />
							</a>
						</header>
						<div class={PANEL_BODY}>
							{#if recent.length}
								{#each recent as t (t.id)}
									{@render ticketRow(t)}
								{/each}
							{:else}
								<p class="px-2 py-2 text-[14px] text-text-3">{m.tickets_dash_nothing_open()}</p>
							{/if}
						</div>
					</section>
				</div>

				<div class="space-y-5">
					{#if byStatus.length}
						<section class={PANEL}>
							<header class={PANEL_HEAD}>
								<h2 class="text-[13px] font-medium text-text">{m.tickets_dash_by_status()}</h2>
							</header>
							<div class="space-y-3 px-4 py-3.5">
								{#each byStatus as s (s.id)}
									<a href="/tickets?status={s.id}" class="group block">
										<div class="mb-1.5 flex items-center gap-2 text-[13px] leading-5">
											<span class="h-2 w-2 rounded-full" style:background={s.dot}></span>
											<span class="text-text-2 group-hover:text-text"
												>{ticketStatusLabel(s.id)}</span
											>
											<span class="ml-auto font-mono text-[12px] text-text-3">{s.n}</span>
										</div>
										<div class="h-1 overflow-hidden rounded-full bg-surface-2">
											<div
												class="h-full rounded-full"
												style:width="{(s.n / maxStatus) * 100}%"
												style:background={s.dot}
											></div>
										</div>
									</a>
								{/each}
							</div>
						</section>
					{/if}

					{#if byCategory.length}
						<section class={PANEL}>
							<header class={PANEL_HEAD}>
								<h2 class="text-[13px] font-medium text-text">{m.tickets_dash_by_category()}</h2>
							</header>
							<div class="space-y-3 px-4 py-3.5">
								{#each byCategory as c (c.id)}
									<div>
										<div class="mb-1.5 flex items-center gap-2 text-[13px] leading-5">
											<span class="h-2 w-2 rounded-full" style:background={c.color}></span>
											<span class="text-text-2">{ticketCategoryLabel(c.id)}</span>
											<span class="ml-auto font-mono text-[12px] text-text-3">{c.n}</span>
										</div>
										<div class="h-1 overflow-hidden rounded-full bg-surface-2">
											<div
												class="h-full rounded-full"
												style:width="{(c.n / maxCategory) * 100}%"
												style:background={c.color}
											></div>
										</div>
									</div>
								{/each}
							</div>
						</section>
					{/if}

					<section class={PANEL}>
						<header class={PANEL_HEAD}>
							<h2 class="text-[13px] font-medium text-text">{m.tickets_dash_per_week()}</h2>
						</header>
						<div class="px-4 pt-4 pb-3">
							<!-- Neutral bars; this week in accent. -->
							<div class="flex h-20 items-end gap-1.5">
								{#each weeks as w, i (w.from)}
									<div
										class="group flex h-full flex-1 flex-col justify-end"
										title="{formatDateShort(new Date(w.from))} · {w.n}"
									>
										<div
											class="min-h-[2px] rounded-t-[3px] transition-colors {i === weeks.length - 1
												? 'bg-accent/80 group-hover:bg-accent'
												: 'bg-text-4/60 group-hover:bg-text-3'}"
											style:height="{(w.n / maxWeek) * 100}%"
										></div>
									</div>
								{/each}
							</div>
							<div class="mt-2 flex justify-between text-[11px] text-text-4">
								<span>{formatDateShort(new Date(weeks[0].from))}</span>
								<span>{m.tickets_dash_this_week()}</span>
							</div>
						</div>
					</section>
				</div>
			</div>
		{/if}
	</div>
</div>
