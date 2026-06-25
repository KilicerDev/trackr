<script lang="ts">
	import Icon from '../Icon.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
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
		onSelect?: (t: TicketRow) => void;
		selectedId?: string;
	}
	let { tickets, group = 'status', onSelect, selectedId }: Props = $props();

	let collapsed = $state(new Set<string>());
	function toggle(id: string) {
		const next = new Set(collapsed);
		next.has(id) ? next.delete(id) : next.add(id);
		collapsed = next;
	}

	let groups = $derived.by(() => {
		if (group === 'none') return [{ id: 'all', label: '', dot: 'transparent', tickets }];
		if (group === 'status') {
			return TICKET_STATUSES.map((s) => ({
				id: s.id,
				label: ticketStatusLabel(s.id),
				dot: s.dot,
				tickets: tickets.filter((t) => t.status === s.id)
			})).filter((g) => g.tickets.length > 0);
		}
		if (group === 'priority') {
			return [...TICKET_PRIORITIES]
				.reverse()
				.map((p) => ({
					id: p.id,
					label: priorityLabel(p.id),
					dot: p.color,
					tickets: tickets.filter((t) => t.priority === p.id)
				}))
				.filter((g) => g.tickets.length > 0);
		}
		if (group === 'category') {
			return TICKET_CATEGORIES.map((c) => ({
				id: c.id,
				label: ticketCategoryLabel(c.id),
				dot: c.color,
				tickets: tickets.filter((t) => t.category === c.id)
			})).filter((g) => g.tickets.length > 0);
		}
		if (group === 'assignee') {
			const ids = Array.from(new Set(tickets.map((t) => t.assignedAgentId ?? '__none')));
			return ids
				.map((uid) => {
					const real = uid === '__none' ? null : uid;
					const u = real ? resolveUser(real) : undefined;
					return {
						id: uid,
						label: u?.name ?? mm.common_unassigned(),
						dot: u?.color ?? '#7c7c84',
						tickets: tickets.filter((t) => (t.assignedAgentId ?? '__none') === uid)
					};
				})
				.filter((g) => g.tickets.length > 0)
				.sort((a, b) => a.label.localeCompare(b.label));
		}
		// org
		const orgIds = Array.from(new Set(tickets.map((t) => t.orgId)));
		return orgIds
			.map((id) => {
				const sample = tickets.find((t) => t.orgId === id)!;
				return {
					id,
					label: sample.orgName,
					dot: sample.orgColor,
					tickets: tickets.filter((t) => t.orgId === id)
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
				<button
					type="button"
					onclick={() => toggle(g.id)}
					class="group sticky top-0 z-[5] flex h-10 w-full items-center gap-2.5 border-y border-border bg-surface px-5 text-left"
				>
					<span class="text-text-3 transition-transform {isCollapsed ? '-rotate-90' : ''}">
						<Icon name="chevron" size={12} />
					</span>
					<span class="h-2 w-2 rounded-full" style:background={g.dot}></span>
					<span class="text-[13px] font-semibold text-text">{g.label}</span>
					<span class="font-mono text-[11px] text-text-3">{g.tickets.length}</span>
				</button>
			{/if}
			{#if !isCollapsed}
				<div transition:slide={{ duration: 180, easing: cubicOut }}>
					{#each g.tickets as t (t.id)}
						{@const assignee = resolveUser(t.assignedAgentId)}
						{@const sla = slaSignal(t)}
						<button
							type="button"
							onclick={() => onSelect?.(t)}
							class="flex h-10 w-full items-center gap-3 border-b border-border pr-4 pl-5 text-left text-[13px] transition-colors hover:bg-surface {selectedId ===
							t.id
								? 'bg-surface'
								: ''}"
						>
							<PriorityBars priority={t.priority} />
							<span class="w-[112px] shrink-0 truncate font-mono text-[11px] text-text-3"
								>{t.displayId}</span
							>
							<span
								class="h-2.5 w-2.5 shrink-0 rounded-full"
								style:background={statusDot(t.status)}
								title={t.status}
							></span>
							<span class="flex-1 truncate text-text">{t.subject}</span>
							{#if sla}
								<span
									class="hidden shrink-0 items-center gap-1.5 text-[11px] text-text-3 lg:inline-flex"
									title={sla.label}
								>
									<span class="h-1.5 w-1.5 rounded-full" style:background={sla.dot}></span>
									<span class="max-w-[180px] truncate">{sla.label}</span>
								</span>
							{/if}
							<span
								class="hidden shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] text-text-3 md:inline-flex"
								title={t.orgName}
							>
								<span class="h-1.5 w-1.5 rounded-full" style:background={t.orgColor}></span>
								<span class="max-w-[120px] truncate">{t.orgName}</span>
							</span>
							{#if t.messageCount > 0}
								<span
									class="hidden shrink-0 items-center gap-1 text-[11px] text-text-3 md:inline-flex"
								>
									<Icon name="msg" size={11} />
									{t.messageCount}
								</span>
							{/if}
							<span class="hidden w-[72px] shrink-0 text-right text-[11px] text-text-3 lg:inline">
								{relTime(t.lastMessageAt ?? t.updatedAt)}
							</span>
							{#if assignee}
								<Avatar user={assignee} size={20} />
							{:else}
								<span class="h-5 w-5 rounded-full border border-dashed border-border-strong"></span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
	{#if tickets.length === 0}
		<div class="grid flex-1 place-items-center text-[13px] text-text-3">
			{mm.tickets_none_match()}
		</div>
	{/if}
</div>
