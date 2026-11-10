<script lang="ts">
	import Icon from '../Icon.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import { readCollapsed, saveCollapsed } from '$lib/stores/view';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { sortTickets, DEFAULT_TICKET_LIST_SORT, type TicketSort } from '$lib/utils/sort';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '$lib/config/taxonomy';
	import type { TicketRow } from '$lib/server/tickets';
	import { m as mm } from '$lib/paraglide/messages';
	import { ticketStatusLabel, ticketCategoryLabel, priorityLabel } from '$lib/utils/labels';
	import { relTime, slaSignal } from '$lib/utils/ticket-sla';

	type GroupBy = 'status' | 'priority' | 'category' | 'org' | 'assignee' | 'none';

	interface Props {
		tickets: TicketRow[];
		group?: GroupBy;
		// Row order inside each group (see $lib/utils/sort).
		sort?: TicketSort;
		onSelect?: (t: TicketRow) => void;
		selectedId?: string;
		// View-state key (e.g. 'tickets') to remember collapsed groups under.
		// Omitted → collapse state is session-only, as before.
		persistKey?: string;
		// Server-persisted snapshot of collapsed ids per grouping, used as the
		// SSR/first-paint fallback when localStorage isn't available yet.
		initialCollapsed?: Record<string, string[]>;
	}
	let {
		tickets,
		group = 'status',
		sort = DEFAULT_TICKET_LIST_SORT,
		onSelect,
		selectedId,
		persistKey,
		initialCollapsed
	}: Props = $props();

	const loadCollapsed = () =>
		persistKey
			? readCollapsed(persistKey, 'listCollapsed', group, initialCollapsed)
			: new Set<string>();
	let collapsed = $state(loadCollapsed());
	// Re-hydrate when the grouping changes — each grouping mode has its own
	// id namespace and its own remembered set. (The mount run just re-reads
	// the same initial value.)
	$effect(() => {
		collapsed = loadCollapsed();
	});
	function toggle(id: string) {
		const next = new Set(collapsed);
		next.has(id) ? next.delete(id) : next.add(id);
		collapsed = next;
		if (persistKey) saveCollapsed(persistKey, 'listCollapsed', group, next);
	}

	// Sorted once up front so every grouping mode inherits the same row order.
	const ordered = $derived(sortTickets(tickets, sort));

	let groups = $derived.by(() => {
		if (group === 'none') return [{ id: 'all', label: '', dot: 'transparent', tickets: ordered }];
		if (group === 'status') {
			return TICKET_STATUSES.map((s) => ({
				id: s.id,
				label: ticketStatusLabel(s.id),
				dot: s.dot,
				tickets: ordered.filter((t) => t.status === s.id)
			})).filter((g) => g.tickets.length > 0);
		}
		if (group === 'priority') {
			return [...TICKET_PRIORITIES]
				.reverse()
				.map((p) => ({
					id: p.id,
					label: priorityLabel(p.id),
					dot: p.color,
					tickets: ordered.filter((t) => t.priority === p.id)
				}))
				.filter((g) => g.tickets.length > 0);
		}
		if (group === 'category') {
			return TICKET_CATEGORIES.map((c) => ({
				id: c.id,
				label: ticketCategoryLabel(c.id),
				dot: c.color,
				tickets: ordered.filter((t) => t.category === c.id)
			})).filter((g) => g.tickets.length > 0);
		}
		if (group === 'assignee') {
			// Fan-out: a ticket with N assignees appears under each of their groups;
			// unassigned tickets fall under the '__none' bucket.
			const ids = new Set<string>();
			for (const t of ordered) {
				if (t.assignees.length === 0) ids.add('__none');
				else for (const a of t.assignees) ids.add(a);
			}
			return Array.from(ids)
				.map((uid) => {
					const real = uid === '__none' ? null : uid;
					const u = real ? resolveUser(real) : undefined;
					return {
						id: uid,
						label: u?.name ?? mm.common_unassigned(),
						dot: u?.color ?? '#7c7c84',
						tickets: ordered.filter((t) =>
							uid === '__none' ? t.assignees.length === 0 : t.assignees.includes(uid)
						)
					};
				})
				.filter((g) => g.tickets.length > 0)
				.sort((a, b) => a.label.localeCompare(b.label));
		}
		// org
		const orgIds = Array.from(new Set(ordered.map((t) => t.orgId)));
		return orgIds
			.map((id) => {
				const sample = ordered.find((t) => t.orgId === id)!;
				return {
					id,
					label: sample.orgName,
					dot: sample.orgColor,
					tickets: ordered.filter((t) => t.orgId === id)
				};
			})
			.filter((g) => g.tickets.length > 0);
	});

	function statusDot(id: string) {
		return TICKET_STATUSES.find((s) => s.id === id)?.dot ?? '#7c7c84';
	}
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-auto">
	{#each groups as g (g.id)}
		{@const isCollapsed = collapsed.has(g.id)}
		<div>
			{#if g.label}
				<!-- Group band, same as the tasks list: sticky, medium weight, muted
				     count, one rule underneath. -->
				<button
					type="button"
					onclick={() => toggle(g.id)}
					aria-expanded={!isCollapsed}
					class="group sticky top-0 z-[5] flex h-10 w-full items-center gap-2.5 border-b border-border bg-bg-elev px-5 text-left"
				>
					<span class="text-text-3 transition-transform {isCollapsed ? '-rotate-90' : ''}">
						<Icon name="chevron" size={13} />
					</span>
					<span class="h-2 w-2 rounded-full" style:background={g.dot}></span>
					<span class="text-[14px] font-medium text-text">{g.label}</span>
					<span class="font-mono text-[12px] text-text-4">{g.tickets.length}</span>
				</button>
			{/if}
			{#if !isCollapsed}
				<div transition:slide={{ duration: 180, easing: cubicOut }}>
					{#each g.tickets as t (t.id)}
						{@const assignees = t.assignees.map((id) => resolveUser(id))}
						{@const sla = slaSignal(t)}
						{@const cdone = t.checklist.filter((i) => i.done).length}
						<!-- Row on the tasks-list grid: status, id, subject (with the
						     org and counts as quiet text), priority bars, activity,
						     avatars. -->
						<button
							type="button"
							onclick={() => onSelect?.(t)}
							class="grid w-full grid-cols-[30px_minmax(0,1fr)_auto_60px] items-center gap-3 border-b border-border/60 px-5 text-left transition-colors md:grid-cols-[30px_92px_minmax(0,1fr)_24px_minmax(92px,auto)_60px] {selectedId ===
							t.id
								? 'bg-[var(--row-active)]'
								: 'hover:bg-[var(--row-hover)]'}"
							style:height="var(--row-h)"
						>
							<span
								class="h-2.5 w-2.5 rounded-full"
								style:background={statusDot(t.status)}
								title={ticketStatusLabel(t.status)}
							></span>
							<span class="hidden truncate font-mono text-[12px] text-text-4 md:block"
								>{t.displayId}</span
							>
							<span class="flex min-w-0 items-center gap-2.5">
								<span class="truncate text-[14px] text-text">{t.subject}</span>
								{#if group !== 'org'}
									<span
										class="hidden shrink-0 items-center gap-1 text-[12px] text-text-3 md:inline-flex"
										title={t.orgName}
									>
										<span class="h-1.5 w-1.5 rounded-full" style:background={t.orgColor}></span>
										<span class="max-w-[132px] truncate">{t.orgName}</span>
									</span>
								{/if}
								{#if t.messageCount > 0}
									<span
										class="hidden shrink-0 items-center gap-1 text-[12px] text-text-4 md:inline-flex"
									>
										<Icon name="msg" size={12} />
										{t.messageCount}
									</span>
								{/if}
								{#if t.checklist.length && cdone < t.checklist.length}
									<span
										class="hidden shrink-0 items-center gap-1 text-[12px] text-text-4 md:inline-flex"
										title="{cdone}/{t.checklist.length}"
									>
										<Icon name="check-square" size={12} />
										<span class="font-mono">{cdone}/{t.checklist.length}</span>
									</span>
								{/if}
							</span>
							<span class="hidden items-center md:flex" title={priorityLabel(t.priority)}>
								<PriorityBars priority={t.priority} />
							</span>
							<!-- Activity: an unanswered ticket says so in accent; otherwise
							     when it last moved. -->
							<span class="truncate text-right text-[12px]">
								{#if sla && sla.tone === 'wait'}
									<span class="text-accent" title={sla.label}>{sla.label}</span>
								{:else}
									<span class="text-text-4" title={sla?.label}
										>{relTime(t.lastMessageAt ?? t.updatedAt)}</span
									>
								{/if}
							</span>
							<span class="flex justify-end">
								{#if assignees.length}
									<AvatarStack users={assignees} size={22} max={3} overlap={6} />
								{:else}
									<span
										class="h-[22px] w-[22px] rounded-full border border-dashed border-border-strong"
									></span>
								{/if}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
	{#if tickets.length === 0}
		<div class="grid flex-1 place-items-center text-[14px] text-text-3">
			{mm.tickets_none_match()}
		</div>
	{/if}
</div>
