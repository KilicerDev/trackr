<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/toast.svelte';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import PriorityBars from '$lib/components/PriorityBars.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import { resolveUser } from '$lib/lookup.svelte';
	import {
		TICKET_CATEGORIES,
		TICKET_PRIORITIES,
		TICKET_STATUSES
	} from '$lib/data';
	import type { TicketRow, TicketMessageRow } from '$lib/server/tickets';

	type PageData = {
		ticket: TicketRow;
		messages: TicketMessageRow[];
		isAgent: boolean;
		users?: { id: string; name: string; initials: string; color: string }[];
	};
	let { data }: { data: PageData } = $props();

	const t = $derived(data.ticket);
	const statusMeta = $derived(TICKET_STATUSES.find((s) => s.id === t.status));
	const priorityMeta = $derived(TICKET_PRIORITIES.find((p) => p.id === t.priority));
	const categoryMeta = $derived(TICKET_CATEGORIES.find((c) => c.id === t.category));
	const assignee = $derived(resolveUser(t.assignedAgentId));
	const customer = $derived(resolveUser(t.customerId));

	let pop = $state<'status' | 'priority' | 'category' | 'assignee' | null>(null);
	let pending = $state(false);

	async function patch(field: 'status' | 'priority' | 'category' | 'assignedAgentId', value: string | null) {
		pending = true;
		const fd = new FormData();
		fd.set('id', t.id);
		fd.set(field, value ?? '');
		try {
			const res = await fetch('/tickets?/update', { method: 'POST', body: fd });
			if (!res.ok) throw new Error('Update failed');
			pop = null;
			await invalidateAll();
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : 'Update failed');
		} finally {
			pending = false;
		}
	}

	// ─── Composer ───────────────────────────────────────────────────────────
	let body = $state('');
	let internal = $state(false);
	let sending = $state(false);

	async function send() {
		const text = body.trim();
		if (!text || sending) return;
		sending = true;
		const fd = new FormData();
		fd.set('id', t.id);
		fd.set('body', text);
		fd.set('internal', internal ? '1' : '0');
		try {
			const res = await fetch('/tickets?/message', { method: 'POST', body: fd });
			if (!res.ok) throw new Error('Send failed');
			body = '';
			internal = false;
			await invalidateAll();
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : 'Send failed');
		} finally {
			sending = false;
		}
	}

	// ─── Activity events (timeline) ─────────────────────────────────────────
	type Event =
		| { id: string; kind: 'created'; at: string; userId: string | null }
		| { id: string; kind: 'message'; at: string; userId: string | null; body: string; internal: boolean };

	const events = $derived.by<Event[]>(() => {
		const out: Event[] = [
			{ id: '__created', kind: 'created', at: t.createdAt, userId: t.customerId }
		];
		for (const m of data.messages) {
			out.push({
				id: m.id,
				kind: 'message',
				at: m.createdAt,
				userId: m.authorId,
				body: m.body,
				internal: m.isInternalNote
			});
		}
		return out.sort((a, b) => a.at.localeCompare(b.at));
	});

	function relTime(iso: string): string {
		const ts = new Date(iso).getTime();
		const diff = Date.now() - ts;
		const m = Math.floor(diff / 60_000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		if (d < 7) return `${d}d ago`;
		return new Date(iso).toLocaleDateString();
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const isAgent = $derived(data.isAgent);
	const users = $derived(data.users ?? []);

	// Deletion is admin-only. effectivePermissions is the workspace-wide union
	// (UI gating only); the server re-checks org.tickets.delete.any per-org.
	const canDelete = $derived(
		((page.data.effectivePermissions as string[] | undefined) ?? []).includes(
			'org.tickets.delete.any'
		)
	);

	async function deleteTicket() {
		const ok = await uiConfirm({
			title: `Delete ${t.displayId}?`,
			message: `"${t.subject}" and its conversation will be removed from the ticket list. This is an administrative action.`,
			confirmLabel: 'Delete ticket',
			tone: 'danger',
			icon: 'trash'
		});
		if (!ok) return;
		const fd = new FormData();
		fd.set('id', t.id);
		try {
			const res = await fetch('/tickets?/delete', { method: 'POST', body: fd });
			if (!res.ok) throw new Error('Delete failed');
			await goto('/tickets');
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : 'Delete failed');
		}
	}
</script>

<svelte:head>
	<title>Trackr · {t.displayId} · {t.subject}</title>
</svelte:head>

<Topbar
	crumbs={[
		{ label: 'Trackr Workspace', href: '/tasks' },
		{ label: 'Support Tickets', href: '/tickets' },
		{ label: t.displayId }
	]}
/>

<div class="flex-1 min-h-0 overflow-auto">
	<div class="max-w-[820px] mx-auto px-6 py-6">
		<!-- Header -->
		<div class="flex items-center gap-2 text-[11.5px] text-text-3 mb-1">
			<span class="font-mono text-text-4">{t.displayId}</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="w-1.5 h-1.5 rounded-full" style:background={t.orgColor}></span>
				<span>{t.orgName}</span>
			</span>
			{#if canDelete}
				<button
					type="button"
					onclick={deleteTicket}
					class="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface text-[12px] text-text-2 hover:text-[#ef4f5e] hover:border-[#ef4f5e]/40 hover:bg-[#ef4f5e]/10 transition-colors"
				>
					<Icon name="trash" size={14} />
					<span>Delete</span>
				</button>
			{/if}
		</div>
		<h1 class="text-[22px] font-semibold tracking-[-0.012em] leading-tight text-text mb-4">
			{t.subject}
		</h1>

		<!-- Properties rail -->
		<div class="flex flex-wrap gap-2 mb-6">
			<!-- Status -->
			<div class="relative">
				<button
					type="button"
					disabled={!isAgent}
					onclick={() => (pop = pop === 'status' ? null : 'status')}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-[12.5px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed {isAgent
						? 'hover:border-border-strong'
						: ''} {pop === 'status' ? 'ring-2 ring-accent/40' : ''}"
				>
					<span class="w-2 h-2 rounded-full" style:background={statusMeta?.dot ?? '#7c7c84'}></span>
					<span>{statusMeta?.label ?? t.status}</span>
				</button>
				{#if pop === 'status'}
					<div
						use:clickOutside={() => (pop = null)}
						in:fly={POPOVER_IN}
						class="absolute top-full left-0 mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[200px]"
						style:box-shadow="var(--shadow-lg)"
					>
						{#each TICKET_STATUSES as s (s.id)}
							<button
								type="button"
								disabled={pending}
								onclick={() => patch('status', s.id)}
								class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text disabled:opacity-50"
							>
								<span class="w-2 h-2 rounded-full" style:background={s.dot}></span>
								<span class="text-[13px]">{s.label}</span>
								<span class="ml-auto text-accent {t.status === s.id ? 'opacity-100' : 'opacity-0'}">
									<Icon name="check" size={13} />
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Priority -->
			<div class="relative">
				<button
					type="button"
					disabled={!isAgent}
					onclick={() => (pop = pop === 'priority' ? null : 'priority')}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-[12.5px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed {isAgent
						? 'hover:border-border-strong'
						: ''} {pop === 'priority' ? 'ring-2 ring-accent/40' : ''}"
				>
					<PriorityBars priority={t.priority} />
					<span>{priorityMeta?.label ?? t.priority}</span>
				</button>
				{#if pop === 'priority'}
					<div
						use:clickOutside={() => (pop = null)}
						in:fly={POPOVER_IN}
						class="absolute top-full left-0 mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[160px]"
						style:box-shadow="var(--shadow-lg)"
					>
						{#each TICKET_PRIORITIES as p (p.id)}
							<button
								type="button"
								disabled={pending}
								onclick={() => patch('priority', p.id)}
								class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text disabled:opacity-50"
							>
								<PriorityBars priority={p.id} />
								<span class="text-[13px]">{p.label}</span>
								<span class="ml-auto text-accent {t.priority === p.id ? 'opacity-100' : 'opacity-0'}">
									<Icon name="check" size={13} />
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Category -->
			<div class="relative">
				<button
					type="button"
					disabled={!isAgent}
					onclick={() => (pop = pop === 'category' ? null : 'category')}
					class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-[12.5px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed {isAgent
						? 'hover:border-border-strong'
						: ''} {pop === 'category' ? 'ring-2 ring-accent/40' : ''}"
				>
					<span class="w-2 h-2 rounded-full" style:background={categoryMeta?.color ?? '#7c7c84'}></span>
					<span>{categoryMeta?.label ?? t.category}</span>
				</button>
				{#if pop === 'category'}
					<div
						use:clickOutside={() => (pop = null)}
						in:fly={POPOVER_IN}
						class="absolute top-full left-0 mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[180px]"
						style:box-shadow="var(--shadow-lg)"
					>
						{#each TICKET_CATEGORIES as c (c.id)}
							<button
								type="button"
								disabled={pending}
								onclick={() => patch('category', c.id)}
								class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text disabled:opacity-50"
							>
								<span class="w-2 h-2 rounded-full" style:background={c.color}></span>
								<span class="text-[13px]">{c.label}</span>
								<span class="ml-auto text-accent {t.category === c.id ? 'opacity-100' : 'opacity-0'}">
									<Icon name="check" size={13} />
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Assignee -->
			<div class="relative">
				<button
					type="button"
					disabled={!isAgent}
					onclick={() => (pop = pop === 'assignee' ? null : 'assignee')}
					class="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed {assignee
						? 'bg-surface border border-border'
						: 'border border-dashed border-border text-text-3'} {isAgent
						? assignee
							? 'hover:border-border-strong'
							: 'hover:text-text hover:border-border-strong'
						: ''} {pop === 'assignee' ? 'ring-2 ring-accent/40' : ''}"
				>
					{#if assignee}
						<Avatar user={assignee} size={18} />
						<span>{assignee.name}</span>
					{:else}
						<Icon name="user" size={13} />
						<span>Unassigned</span>
					{/if}
				</button>
				{#if pop === 'assignee'}
					<div
						use:clickOutside={() => (pop = null)}
						in:fly={POPOVER_IN}
						class="absolute top-full left-0 mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[240px] max-h-[320px] overflow-auto"
						style:box-shadow="var(--shadow-lg)"
					>
						<button
							type="button"
							disabled={pending}
							onclick={() => patch('assignedAgentId', null)}
							class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text disabled:opacity-50"
						>
							<span class="w-[18px] h-[18px] rounded-full border border-dashed border-border-strong"></span>
							<span class="text-[13px]">Unassigned</span>
							<span
								class="ml-auto text-accent {t.assignedAgentId == null ? 'opacity-100' : 'opacity-0'}"
							>
								<Icon name="check" size={13} />
							</span>
						</button>
						{#each users as u (u.id)}
							<button
								type="button"
								disabled={pending}
								onclick={() => patch('assignedAgentId', u.id)}
								class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text disabled:opacity-50"
							>
								<Avatar user={u} size={18} />
								<span class="text-[13px] truncate">{u.name}</span>
								<span
									class="ml-auto text-accent {t.assignedAgentId === u.id
										? 'opacity-100'
										: 'opacity-0'}"
								>
									<Icon name="check" size={13} />
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Description (if any) shown as opening message -->
		{#if t.description}
			<div class="mb-6 text-[13.5px] leading-relaxed text-text whitespace-pre-wrap">
				{t.description}
			</div>
		{/if}

		<!-- Activity timeline -->
		<div class="mt-2">
			<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3">Activity</div>
			<div class="relative space-y-4 pl-7">
				<span class="absolute left-[10px] top-2 bottom-2 w-px bg-border"></span>
				{#each events as e (e.id)}
					{@const u = resolveUser(e.userId)}
					<div class="relative">
						<span
							class="absolute -left-7 top-0.5 w-5 h-5 rounded-full grid place-items-center bg-bg-elev border border-border"
						>
							{#if e.kind === 'created'}
								<Icon name="plus" size={11} />
							{:else}
								<Avatar user={u} size={18} />
							{/if}
						</span>
						<div class="text-[12.5px] text-text-2">
							<span class="text-text font-medium">{u?.name ?? 'Unknown'}</span>
							{#if e.kind === 'created'}
								opened this ticket
							{:else if e.internal}
								added an <span class="text-[#e9c46a]">internal note</span>
							{:else}
								replied
							{/if}
							<span class="font-mono text-text-4">· {relTime(e.at)}</span>
						</div>
						{#if e.kind === 'message'}
							<div
								class="mt-2 p-3 rounded-lg text-[13px] leading-relaxed whitespace-pre-wrap {e.internal
									? 'bg-[#e9c46a]/8 border border-[#e9c46a]/30 text-text'
									: 'bg-surface border border-border text-text'}"
							>{e.body}</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- Footer meta -->
		<div class="mt-8 text-[11px] text-text-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4">
			<span>
				Reporter <span class="text-text-2">{customer?.name ?? '—'}</span>
			</span>
			<span>
				Channel <span class="text-text-2 font-mono">{t.channel}</span>
			</span>
			<span>
				Created <span class="font-mono text-text-3">{fmtDate(t.createdAt)}</span>
			</span>
			<span>
				First response <span class="font-mono text-text-3">{fmtDate(t.firstResponseAt)}</span>
			</span>
			{#if t.resolvedAt}
				<span>
					Resolved <span class="font-mono text-text-3">{fmtDate(t.resolvedAt)}</span>
				</span>
			{/if}
		</div>
	</div>
</div>

<!-- Composer docked at bottom -->
<div class="px-6 py-3">
	<div class="max-w-[820px] mx-auto">
		<Composer
			bind:value={body}
			placeholder={internal ? 'Add an internal note…' : 'Write a reply…'}
			accent={internal ? 'warning' : 'default'}
			{sending}
			onsend={send}
		>
			{#snippet rightActions()}
				{#if isAgent}
					<button
						type="button"
						aria-label={internal ? 'Switch to public reply' : 'Switch to internal note'}
						title={internal ? 'Internal note · click to switch to reply' : 'Internal note (agents only)'}
						aria-pressed={internal}
						onclick={() => (internal = !internal)}
						class="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[12px] transition-colors {internal
							? 'bg-[#e9c46a]/15 border-[#e9c46a]/40 text-[#e9c46a]'
							: 'bg-transparent border-transparent text-text-3 hover:text-text hover:bg-surface-2'}"
					>
						<Icon name="shield" size={12} />
						<span>{internal ? 'Internal' : 'Public'}</span>
					</button>
				{/if}
			{/snippet}
		</Composer>
	</div>
</div>
