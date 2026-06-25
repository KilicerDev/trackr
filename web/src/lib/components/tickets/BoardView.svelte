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
	import IconButton from '../IconButton.svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	export type BoardGroup = 'status' | 'priority' | 'category' | 'org' | 'assignee' | 'none';
	export type BoardSub = 'none' | 'status' | 'priority' | 'category' | 'assignee';

	interface Props {
		tickets: TicketRow[];
		group?: BoardGroup;
		sub?: BoardSub;
		onSelect?: (t: TicketRow) => void;
		onAddInOrg?: (orgId: string | null) => void;
		canCreate?: boolean;
	}
	let {
		tickets,
		group = 'status',
		sub = 'none',
		onSelect,
		onAddInOrg,
		canCreate = true
	}: Props = $props();

	const prioRank: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
	function byPriority(a: TicketRow, b: TicketRow) {
		const d = (prioRank[b.priority] ?? 0) - (prioRank[a.priority] ?? 0);
		if (d !== 0) return d;
		// Stable tiebreak: most recently active first.
		return (b.lastMessageAt ?? b.updatedAt).localeCompare(a.lastMessageAt ?? a.updatedAt);
	}

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
			const ids = Array.from(new Set(tickets.map((t) => t.assignedAgentId ?? '__none')));
			return ids
				.map((uid) => {
					const real = uid === '__none' ? null : uid;
					const u = real ? resolveUser(real) : undefined;
					return {
						key: uid,
						label: u?.name ?? m.common_unassigned(),
						dot: u?.color ?? '#7c7c84',
						userId: real ?? undefined,
						tickets: tickets.filter((t) => (t.assignedAgentId ?? '__none') === uid)
					};
				})
				.sort((a, b) => a.label.localeCompare(b.label));
		}
		return [{ key: 'all', label: m.tickets_all(), dot: 'transparent', tickets }];
	});

	let collapsed = $state(new Set<string>());
	function toggle(key: string) {
		const n = new Set(collapsed);
		n.has(key) ? n.delete(key) : n.add(key);
		collapsed = n;
	}

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
			return [{ key: `${col.key}:all`, label: '', tickets: [...items].sort(byPriority) }];
		}
		if (sub === 'status') {
			return TICKET_STATUSES.map((s) => ({
				key: `${col.key}:${s.id}`,
				label: ticketStatusLabel(s.id),
				dot: s.dot,
				statusId: s.id,
				tickets: items.filter((t) => t.status === s.id).sort(byPriority)
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
					tickets: items.filter((t) => t.priority === p.id)
				}))
				.filter((g) => g.tickets.length > 0);
		}
		if (sub === 'category') {
			return TICKET_CATEGORIES.map((c) => ({
				key: `${col.key}:${c.id}`,
				label: ticketCategoryLabel(c.id),
				dot: c.color,
				tickets: items.filter((t) => t.category === c.id).sort(byPriority)
			})).filter((g) => g.tickets.length > 0);
		}
		// assignee
		const ids = Array.from(new Set(items.map((t) => t.assignedAgentId ?? '__none')));
		return ids
			.map((uid) => {
				const real = uid === '__none' ? null : uid;
				const u = real ? resolveUser(real) : undefined;
				return {
					key: `${col.key}:${uid}`,
					label: u?.name ?? m.common_unassigned(),
					dot: u?.color,
					userId: real ?? undefined,
					tickets: items.filter((t) => (t.assignedAgentId ?? '__none') === uid).sort(byPriority)
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
			<div class="flex w-[330px] shrink-0 flex-col border-r border-border last:border-r-0">
				<div class="flex items-center gap-2 border-b border-border px-4 py-3">
					{#if col.userId}
						{@const u = resolveUser(col.userId)}
						<Avatar user={u} size={16} />
					{:else if col.priorityId}
						<PriorityBars priority={col.priorityId} />
					{:else if col.dot !== 'transparent'}
						<span class="h-2.5 w-2.5 rounded-full" style:background={col.dot}></span>
					{/if}
					<span class="truncate text-[13px] font-semibold text-text">{col.label}</span>
					<span class="font-mono text-[11px] text-text-3">{col.tickets.length}</span>
					{#if canCreate && group === 'org'}
						<span class="ml-auto">
							<IconButton
								size={24}
								ariaLabel={m.tickets_new_title()}
								onclick={() => onAddInOrg?.(col.orgId ?? null)}
							>
								<Icon name="plus" size={13} />
							</IconButton>
						</span>
					{/if}
				</div>
				<div class="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
					{#each groups as g (g.key)}
						{@const isCollapsed = collapsed.has(g.key)}
						<div>
							{#if g.label}
								<button
									type="button"
									onclick={() => toggle(g.key)}
									class="flex w-full items-center gap-2 px-1 py-1 text-left text-[11px] font-medium tracking-[0.08em] text-text-3 uppercase hover:text-text"
								>
									<span class="text-text-4 transition-transform {isCollapsed ? '-rotate-90' : ''}">
										<Icon name="chevron" size={10} />
									</span>
									{#if g.priorityId}
										<PriorityBars priority={g.priorityId} />
									{:else if g.userId}
										{@const u = resolveUser(g.userId)}
										<Avatar user={u} size={14} />
									{:else if g.dot}
										<span class="h-2 w-2 rounded-full" style:background={g.dot}></span>
									{/if}
									<span>{g.label}</span>
									<span class="ml-auto font-mono text-text-4">{g.tickets.length}</span>
								</button>
							{/if}
							{#if !isCollapsed}
								<div class="mt-1.5 space-y-2" transition:slide={{ duration: 180, easing: cubicOut }}>
									{#each g.tickets as t (t.id)}
										<BoardCard ticket={t} onclick={() => onSelect?.(t)} />
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/each}
		{#if columns.length === 0}
			<div class="grid flex-1 place-items-center text-[13px] text-text-3">
				{m.tickets_none_match()}
			</div>
		{/if}
	</div>
</div>
