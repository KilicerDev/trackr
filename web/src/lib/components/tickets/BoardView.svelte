<script lang="ts">
	import type { TicketRow } from '$lib/server/tickets';
	import type { PriorityId } from '$lib/types';
	import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '$lib/config/taxonomy';
	import { ticketStatusLabel, ticketCategoryLabel, priorityLabel } from '$lib/utils/labels';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { m } from '$lib/paraglide/messages';
	import BoardCard from './BoardCard.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import Icon from '../Icon.svelte';
	import { ICON_ACTION } from '../tasks/panel/styles';
	import { whenVisible } from '$lib/actions/whenVisible';
	import { readCollapsed, saveCollapsed } from '$lib/stores/view';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { sortTickets, DEFAULT_TICKET_BOARD_SORT, type TicketSort } from '$lib/utils/sort';

	export type BoardGroup = 'status' | 'priority' | 'category' | 'org' | 'assignee' | 'none';
	export type BoardSub = 'none' | 'status' | 'priority' | 'category' | 'assignee';

	interface Props {
		tickets: TicketRow[];
		group?: BoardGroup;
		sub?: BoardSub;
		// Card order inside each column / subgroup (see $lib/utils/sort).
		sort?: TicketSort;
		onSelect?: (t: TicketRow) => void;
		onAddInOrg?: (orgId: string | null) => void;
		canCreate?: boolean;
		// View-state key (e.g. 'tickets') to remember collapsed columns under.
		// Omitted → collapse state is session-only, as before.
		persistKey?: string;
		// Server-persisted snapshot of collapsed ids per grouping, used as the
		// SSR/first-paint fallback when localStorage isn't available yet.
		initialCollapsed?: Record<string, string[]>;
	}
	let {
		tickets,
		group = 'status',
		sub = 'none',
		sort = DEFAULT_TICKET_BOARD_SORT,
		onSelect,
		onAddInOrg,
		canCreate = true,
		persistKey,
		initialCollapsed
	}: Props = $props();

	interface ColumnDef {
		key: string;
		label: string;
		dot: string;
		orgId?: string | null;
		statusId?: string;
		priorityId?: PriorityId;
		userId?: string;
		tickets: TicketRow[];
	}

	let columns = $derived.by<ColumnDef[]>(() => {
		if (group === 'status') {
			return TICKET_STATUSES.map((s) => ({
				key: s.id,
				label: ticketStatusLabel(s.id),
				dot: s.dot,
				statusId: s.id,
				tickets: tickets.filter((t) => t.status === s.id)
			})).filter((c) => c.tickets.length > 0);
		}
		if (group === 'priority') {
			return [...TICKET_PRIORITIES]
				.reverse()
				.map((p) => ({
					key: p.id,
					label: priorityLabel(p.id),
					dot: p.color,
					priorityId: p.id,
					tickets: tickets.filter((t) => t.priority === p.id)
				}))
				.filter((c) => c.tickets.length > 0);
		}
		if (group === 'category') {
			return TICKET_CATEGORIES.map((c) => ({
				key: c.id,
				label: ticketCategoryLabel(c.id),
				dot: c.color,
				tickets: tickets.filter((t) => t.category === c.id)
			})).filter((c) => c.tickets.length > 0);
		}
		if (group === 'org') {
			const orgIds = Array.from(new Set(tickets.map((t) => t.orgId)));
			return orgIds
				.map((id) => {
					const sample = tickets.find((t) => t.orgId === id)!;
					return {
						key: id,
						label: sample.orgName,
						dot: sample.orgColor,
						orgId: id,
						tickets: tickets.filter((t) => t.orgId === id)
					};
				})
				.sort((a, b) => a.label.localeCompare(b.label));
		}
		if (group === 'assignee') {
			// Fan-out: a multi-assignee ticket appears under each assignee's column.
			const ids = new Set<string>();
			for (const t of tickets) {
				if (t.assignees.length === 0) ids.add('__none');
				else for (const a of t.assignees) ids.add(a);
			}
			return Array.from(ids)
				.map((uid) => {
					const real = uid === '__none' ? null : uid;
					const u = real ? resolveUser(real) : undefined;
					return {
						key: uid,
						label: u?.name ?? m.common_unassigned(),
						dot: u?.color ?? '#7c7c84',
						userId: real ?? undefined,
						tickets: tickets.filter((t) =>
							uid === '__none' ? t.assignees.length === 0 : t.assignees.includes(uid)
						)
					};
				})
				.sort((a, b) => a.label.localeCompare(b.label));
		}
		return [{ key: 'all', label: m.tickets_all(), dot: 'transparent', tickets }];
	});

	const loadCollapsed = () =>
		persistKey
			? readCollapsed(persistKey, 'boardCollapsed', group, initialCollapsed)
			: new Set<string>();
	let collapsed = $state(loadCollapsed());
	// Groups that start collapsed (finished tickets: Resolved, Closed)
	// remember being opened in their own set, so the default can't be lost.
	const loadExpanded = () =>
		persistKey ? readCollapsed(persistKey, 'boardExpanded', group) : new Set<string>();
	let expanded = $state(loadExpanded());
	// Re-hydrate when the grouping changes — each grouping mode has its own
	// key namespace and its own remembered set. (The mount run just re-reads
	// the same initial value.)
	$effect(() => {
		collapsed = loadCollapsed();
		expanded = loadExpanded();
	});
	const collapsedByDefault = (g: SubGroupDef) =>
		g.statusId === 'resolved' || g.statusId === 'closed';
	function isCollapsed(g: SubGroupDef): boolean {
		return collapsedByDefault(g) ? !expanded.has(g.key) : collapsed.has(g.key);
	}
	function toggle(g: SubGroupDef) {
		const field = collapsedByDefault(g) ? 'boardExpanded' : 'boardCollapsed';
		const current = field === 'boardExpanded' ? expanded : collapsed;
		const n = new Set(
			current.has(g.key) ? [...current].filter((k) => k !== g.key) : [...current, g.key]
		);
		if (field === 'boardExpanded') expanded = n;
		else collapsed = n;
		if (persistKey) saveCollapsed(persistKey, field, group, n);
	}

	// Each group opens with its first FIRST cards so a column stays
	// scannable; "Show N more" opens it, then further pages load on scroll.
	const FIRST = 5;
	const PAGE = 40;
	let shown = $state<Record<string, number>>({});
	const limitFor = (key: string) => shown[key] ?? FIRST;
	function showMore(key: string) {
		shown[key] = limitFor(key) + PAGE;
	}
	$effect(() => {
		void group;
		void sub;
		shown = {};
	});

	interface SubGroupDef {
		key: string;
		label: string;
		dot?: string;
		statusId?: string;
		priorityId?: PriorityId;
		userId?: string;
		tickets: TicketRow[];
	}

	function subGroupsForColumn(col: ColumnDef): SubGroupDef[] {
		const items = col.tickets;
		if (sub === 'none' || sub === group) {
			return [{ key: `${col.key}:all`, label: '', tickets: sortTickets(items, sort) }];
		}
		if (sub === 'status') {
			return TICKET_STATUSES.map((s) => ({
				key: `${col.key}:${s.id}`,
				label: ticketStatusLabel(s.id),
				dot: s.dot,
				statusId: s.id,
				tickets: sortTickets(
					items.filter((t) => t.status === s.id),
					sort
				)
			})).filter((g) => g.tickets.length > 0);
		}
		if (sub === 'priority') {
			return [...TICKET_PRIORITIES]
				.reverse()
				.map((p) => ({
					key: `${col.key}:${p.id}`,
					label: priorityLabel(p.id),
					dot: p.color,
					priorityId: p.id,
					tickets: sortTickets(
						items.filter((t) => t.priority === p.id),
						sort
					)
				}))
				.filter((g) => g.tickets.length > 0);
		}
		if (sub === 'category') {
			return TICKET_CATEGORIES.map((c) => ({
				key: `${col.key}:${c.id}`,
				label: ticketCategoryLabel(c.id),
				dot: c.color,
				tickets: sortTickets(
					items.filter((t) => t.category === c.id),
					sort
				)
			})).filter((g) => g.tickets.length > 0);
		}
		// assignee (fan-out over multiple assignees)
		const ids = new Set<string>();
		for (const t of items) {
			if (t.assignees.length === 0) ids.add('__none');
			else for (const a of t.assignees) ids.add(a);
		}
		return Array.from(ids)
			.map((uid) => {
				const real = uid === '__none' ? null : uid;
				const u = real ? resolveUser(real) : undefined;
				return {
					key: `${col.key}:${uid}`,
					label: u?.name ?? m.common_unassigned(),
					dot: u?.color,
					userId: real ?? undefined,
					tickets: sortTickets(
						items.filter((t) =>
							uid === '__none' ? t.assignees.length === 0 : t.assignees.includes(uid)
						),
						sort
					)
				};
			})
			.filter((g) => g.tickets.length > 0)
			.sort((a, b) => a.label.localeCompare(b.label));
	}
</script>

<div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
	<div class="flex h-full">
		{#each columns as col (col.key)}
			{@const groups = subGroupsForColumn(col)}
			<!-- Same column anatomy as the tasks board: a quiet header with a
			     hairline under it, + on hover, softer dividers. -->
			<div
				class="group/col flex w-[85vw] max-w-[363px] shrink-0 flex-col border-r border-border/50 last:border-r-0"
			>
				<div class="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-4">
					{#if col.userId}
						{@const u = resolveUser(col.userId)}
						<Avatar user={u} size={17} />
					{:else if col.priorityId}
						<PriorityBars priority={col.priorityId} />
					{:else if col.dot !== 'transparent'}
						<span class="h-2.5 w-2.5 rounded-full" style:background={col.dot}></span>
					{/if}
					<span class="truncate text-[14px] font-medium text-text">{col.label}</span>
					<span class="font-mono text-[12px] text-text-4">{col.tickets.length}</span>
					{#if canCreate && group === 'org'}
						<button
							type="button"
							aria-label={m.tickets_new_title()}
							title={m.tickets_new_title()}
							onclick={() => onAddInOrg?.(col.orgId ?? null)}
							class="{ICON_ACTION} ml-auto opacity-0 group-hover/col:opacity-100 focus-visible:opacity-100"
						>
							<Icon name="plus" size={14} />
						</button>
					{/if}
				</div>
				<div class="flex-1 space-y-4 overflow-y-auto px-3.5 pt-1 pb-3">
					{#each groups as g (g.key)}
						{@const groupCollapsed = isCollapsed(g)}
						<div class={g.label ? '' : 'pt-2'}>
							{#if g.label}
								<!-- Group header: label and count, a hairline to the column
								     edge; sticky while its group scrolls. -->
								<button
									type="button"
									onclick={() => toggle(g)}
									aria-expanded={!groupCollapsed}
									class="group/g sticky top-0 z-[2] -mx-3.5 flex w-[calc(100%+1.75rem)] items-center gap-2 bg-bg px-[18px] pt-2.5 pb-1.5 text-left text-[13px] leading-5 font-medium text-text-2 transition-colors hover:text-text"
								>
									{#if g.priorityId}
										<PriorityBars priority={g.priorityId} />
									{:else if g.userId}
										{@const u = resolveUser(g.userId)}
										<Avatar user={u} size={15} />
									{:else if g.dot}
										<span class="h-2 w-2 rounded-full" style:background={g.dot}></span>
									{/if}
									<span>{g.label}</span>
									<span class="font-mono text-[12px] font-normal text-text-4"
										>{g.tickets.length}</span
									>
									<span class="h-px min-w-4 flex-1 bg-border/70" aria-hidden="true"></span>
									<span
										class="text-text-4 transition-transform group-hover/g:text-text-2 {groupCollapsed
											? '-rotate-90'
											: ''}"
									>
										<Icon name="chevron" size={12} />
									</span>
								</button>
							{/if}
							{#if !groupCollapsed}
								<div class="mt-1 space-y-2" transition:slide={{ duration: 180, easing: cubicOut }}>
									{#each g.tickets.slice(0, limitFor(g.key)) as t (t.id)}
										<BoardCard
											ticket={t}
											showStatus={group !== 'status' && sub !== 'status'}
											showOrg={group !== 'org'}
											onclick={() => onSelect?.(t)}
										/>
									{/each}
									{#if g.tickets.length > limitFor(g.key)}
										{#if limitFor(g.key) <= FIRST}
											<!-- First expansion is a deliberate click. -->
											<button
												type="button"
												onclick={() => showMore(g.key)}
												class="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[13px] text-text-3 transition-colors hover:bg-surface hover:text-text"
											>
												<Icon name="chevron" size={13} />
												{m.tasks_show_more({ n: g.tickets.length - limitFor(g.key) })}
											</button>
										{:else}
											<button
												type="button"
												use:whenVisible={() => showMore(g.key)}
												onclick={() => showMore(g.key)}
												class="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[13px] text-text-3 transition-colors hover:bg-surface hover:text-text"
											>
												<Icon name="chevron" size={13} />
												{m.tasks_show_more({ n: g.tickets.length - limitFor(g.key) })}
											</button>
										{/if}
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/each}
		{#if columns.length === 0}
			<div class="grid flex-1 place-items-center text-[14px] text-text-3">
				{m.tickets_none_match()}
			</div>
		{/if}
	</div>
</div>
