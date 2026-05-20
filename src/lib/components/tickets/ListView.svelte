<script lang="ts">
	import Icon from '../Icon.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { resolveUser } from '$lib/lookup.svelte';
	import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '$lib/data';
	import type { TicketRow } from '$lib/server/tickets';

	type GroupBy = 'status' | 'priority' | 'category' | 'org' | 'none';

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
				label: s.label,
				dot: s.dot,
				tickets: tickets.filter((t) => t.status === s.id)
			})).filter((g) => g.tickets.length > 0);
		}
		if (group === 'priority') {
			return [...TICKET_PRIORITIES]
				.reverse()
				.map((p) => ({
					id: p.id,
					label: p.label,
					dot: p.color,
					tickets: tickets.filter((t) => t.priority === p.id)
				}))
				.filter((g) => g.tickets.length > 0);
		}
		if (group === 'category') {
			return TICKET_CATEGORIES.map((c) => ({
				id: c.id,
				label: c.label,
				dot: c.color,
				tickets: tickets.filter((t) => t.category === c.id)
			})).filter((g) => g.tickets.length > 0);
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

	function relTime(iso: string | null): string {
		if (!iso) return '';
		const t = new Date(iso).getTime();
		const diff = Date.now() - t;
		const m = Math.floor(diff / 60_000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		if (d < 7) return `${d}d ago`;
		return new Date(iso).toLocaleDateString();
	}

	function statusDot(id: string) {
		return TICKET_STATUSES.find((s) => s.id === id)?.dot ?? '#7c7c84';
	}
</script>

<div class="flex flex-col min-h-0 flex-1 overflow-auto">
	{#each groups as g (g.id)}
		{@const isCollapsed = collapsed.has(g.id)}
		<div>
			{#if g.label}
				<button
					type="button"
					onclick={() => toggle(g.id)}
					class="group sticky top-0 z-[5] flex items-center gap-2.5 w-full px-5 h-10 bg-surface border-y border-border text-left"
				>
					<span class="transition-transform text-text-3 {isCollapsed ? '-rotate-90' : ''}">
						<Icon name="chevron" size={12} />
					</span>
					<span class="w-2 h-2 rounded-full" style:background={g.dot}></span>
					<span class="text-[13px] font-semibold text-text">{g.label}</span>
					<span class="font-mono text-[11px] text-text-3">{g.tickets.length}</span>
				</button>
			{/if}
			{#if !isCollapsed}
				<div transition:slide={{ duration: 180, easing: cubicOut }}>
					{#each g.tickets as t (t.id)}
						{@const assignee = resolveUser(t.assignedAgentId)}
						<button
							type="button"
							onclick={() => onSelect?.(t)}
							class="w-full flex items-center gap-3 pl-5 pr-4 h-10 border-b border-border text-left text-[13px] hover:bg-surface transition-colors {selectedId === t.id ? 'bg-surface' : ''}"
						>
							<PriorityBars priority={t.priority} />
							<span class="font-mono text-[11.5px] text-text-3 shrink-0 w-[112px] truncate">{t.displayId}</span>
							<span
								class="w-2.5 h-2.5 rounded-full shrink-0"
								style:background={statusDot(t.status)}
								title={t.status}
							></span>
							<span class="truncate flex-1 text-text">{t.subject}</span>
							<span
								class="hidden md:inline-flex items-center gap-1 text-[11.5px] text-text-3 px-1.5 py-0.5 rounded-md border border-border bg-surface shrink-0"
								title={t.orgName}
							>
								<span class="w-1.5 h-1.5 rounded-full" style:background={t.orgColor}></span>
								<span class="truncate max-w-[120px]">{t.orgName}</span>
							</span>
							{#if t.messageCount > 0}
								<span class="hidden md:inline-flex items-center gap-1 text-[11.5px] text-text-3 shrink-0">
									<Icon name="msg" size={11} />
									{t.messageCount}
								</span>
							{/if}
							<span class="hidden lg:inline text-[11px] text-text-3 shrink-0 w-[72px] text-right">
								{relTime(t.lastMessageAt ?? t.updatedAt)}
							</span>
							{#if assignee}
								<Avatar user={assignee} size={20} />
							{:else}
								<span class="w-5 h-5 rounded-full border border-dashed border-border-strong"></span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
	{#if tickets.length === 0}
		<div class="flex-1 grid place-items-center text-text-3 text-[13px]">
			No tickets match the current filters.
		</div>
	{/if}
</div>
