<script lang="ts">
	// Notifications at the top of the rail (they used to be a bell in the top
	// bar). The row says loudly when something is unread: the bell turns
	// accent, an accent count pill sits on the right, and a folded rail keeps
	// an accent dot on the icon. Clicking opens the inbox panel beside the
	// rail; it's fixed-positioned so the rail's overflow can't clip it.
	import Icon from '../Icon.svelte';
	import Avatar from '../Avatar.svelte';
	import { page } from '$app/state';
	import { goto, invalidate } from '$app/navigation';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { m } from '$lib/paraglide/messages';
	import type { Rail } from './rail.svelte';

	interface Props {
		rail: Rail;
	}
	let { rail }: Props = $props();

	type NotifItem = {
		id: string;
		kind: string;
		title: string;
		body: string | null;
		url: string;
		actorId: string | null;
		readAt: string | null;
		createdAt: string;
	};
	type NotifData = { items: NotifItem[]; unreadCount: number };

	const notifications = $derived(
		(page.data?.notifications as NotifData | undefined) ?? { items: [], unreadCount: 0 }
	);
	const unread = $derived(notifications.unreadCount);

	type OrgUser = {
		id: string;
		name: string | null;
		email: string;
		initials: string;
		color: string;
	};
	const usersById = $derived(
		new Map(((page.data?.users as OrgUser[] | undefined) ?? []).map((u) => [u.id, u]))
	);
	function actorOf(n: NotifItem) {
		const u = n.actorId ? usersById.get(n.actorId) : undefined;
		return u ? { name: u.name ?? u.email, initials: u.initials, color: u.color } : undefined;
	}
	function kindIcon(kind: string): string {
		if (kind.startsWith('ticket')) return 'ticket';
		if (kind.startsWith('task')) return 'check-square';
		if (kind.startsWith('chat')) return 'msg';
		if (kind.startsWith('project')) return 'folder';
		return 'bell';
	}
	function timeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const s = Math.max(1, Math.floor(diff / 1000));
		if (s < 60) return `${s}s`;
		const min = Math.floor(s / 60);
		if (min < 60) return `${min}m`;
		const h = Math.floor(min / 60);
		if (h < 24) return `${h}h`;
		return `${Math.floor(h / 24)}d`;
	}

	let open = $state(false);
	let trigger = $state<HTMLButtonElement>();
	// Where the panel sits: just right of the rail, top-aligned with the row,
	// kept inside the viewport.
	let pos = $state({ left: 0, top: 0 });
	function place() {
		if (!trigger) return;
		const row = trigger.getBoundingClientRect();
		const aside = trigger.closest('aside')?.getBoundingClientRect();
		const left = (aside?.right ?? row.right) + 8;
		const top = Math.max(8, Math.min(row.top - 4, window.innerHeight - 560));
		pos = { left: Math.min(left, window.innerWidth - 400), top };
	}
	function toggle() {
		if (!open) place();
		open = !open;
	}

	let markingAll = $state(false);
	async function openNotification(e: MouseEvent, n: NotifItem) {
		open = false;
		if (n.readAt) return; // already read — let the plain <a> navigation run
		e.preventDefault();
		try {
			await fetch('/api/notifications/read', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: n.id })
			});
			await invalidate('app:notifications');
		} catch {
			/* navigation below still happens */
		}
		await goto(n.url);
	}
	async function markAllRead() {
		if (markingAll || unread === 0) return;
		markingAll = true;
		try {
			await fetch('/api/notifications/read', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ all: true })
			});
			await invalidate('app:notifications');
		} catch {
			/* the badge simply stays */
		} finally {
			markingAll = false;
		}
	}
</script>

<svelte:window onresize={() => open && place()} />

<div class="px-2">
	<button
		bind:this={trigger}
		type="button"
		onclick={toggle}
		aria-expanded={open}
		aria-label={unread > 0
			? `${m.shell_notifications()} · ${m.shell_notifications_unread({ n: unread })}`
			: m.shell_notifications()}
		title={rail.rail ? m.shell_notifications() : undefined}
		class="{rail.row} {rail.rail ? 'w-full' : 'w-[calc(100%-0.5rem)]'} {open
			? 'bg-[var(--row-hover)] !text-text'
			: ''} {unread > 0 ? '!text-text' : ''}"
	>
		<span class="relative {rail.icon(unread > 0 || open)}">
			<Icon name="bell" size={18} />
			{#if unread > 0}
				<!-- Folded: the dot is all that's left of the badge. -->
				<span
					class="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-bg-elev transition-opacity duration-150 {rail.rail
						? 'opacity-100'
						: 'opacity-0'}"
				></span>
			{/if}
		</span>
		<span class={rail.fade}>{m.shell_notifications()}</span>
		{#if unread > 0}
			<span
				class="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 font-mono text-[11px] leading-none font-semibold text-white tabular-nums {rail.fade}"
			>
				{unread > 99 ? '99+' : unread}
			</span>
		{/if}
	</button>
</div>

{#if open}
	<div
		use:clickOutside={() => (open = false)}
		in:fly={POPOVER_IN}
		role="dialog"
		aria-label={m.shell_notifications()}
		class="fixed z-[60] w-[392px] max-w-[calc(100vw-16px)] rounded-[12px] border border-border bg-bg-elev text-[14px] shadow-lg"
		style:left="{pos.left}px"
		style:top="{pos.top}px"
	>
		<div class="overflow-hidden rounded-[12px]">
			<div class="flex h-11 items-center gap-2 border-b border-border pr-2 pl-4">
				<span class="text-[13px] font-semibold text-text">{m.shell_notifications()}</span>
				{#if notifications.unreadCount > 0}
					<span
						class="rounded-full bg-accent-soft px-1.5 py-px text-[11px] font-medium text-accent tabular-nums"
					>
						{m.shell_notifications_unread({ n: notifications.unreadCount })}
					</span>
					<button
						type="button"
						onclick={markAllRead}
						disabled={markingAll}
						class="ml-auto rounded-md px-2 py-1 text-[12px] text-text-3 transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50"
					>
						{m.shell_notifications_mark_all_read()}
					</button>
				{/if}
			</div>

			{#if notifications.items.length === 0}
				<div class="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
					<span class="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-text-3">
						<Icon name="check" size={16} />
					</span>
					<span class="text-[13px] text-text-3">{m.shell_notifications_empty()}</span>
				</div>
			{:else}
				<div class="max-h-[440px] overflow-y-auto p-1.5">
					{#each notifications.items as n (n.id)}
						{@const actor = actorOf(n)}
						{@const unread = !n.readAt}
						<a
							href={n.url}
							onclick={(e) => openNotification(e, n)}
							class="group/n flex items-start gap-3 rounded-lg py-2.5 pr-3 pl-2.5 transition-colors hover:bg-surface-2"
						>
							<!-- Leading: who, or what kind. The unread dot rides its corner. -->
							<span class="relative mt-px shrink-0 {unread ? '' : 'opacity-60'}">
								{#if actor}
									<Avatar user={actor} size={28} />
								{:else}
									<span
										class="grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-text-3 group-hover/n:bg-surface"
									>
										<Icon name={kindIcon(n.kind)} size={14} />
									</span>
								{/if}
								{#if unread}
									<span
										class="absolute -top-px -right-px h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-bg-elev"
									></span>
								{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span
									class="line-clamp-2 text-[13.5px] leading-[1.35] {unread
										? 'font-medium text-text'
										: 'text-text-2'}"
								>
									{n.title}
								</span>
								{#if n.body}
									<span class="mt-0.5 block truncate text-[12px] leading-4 text-text-3">
										{n.body}
									</span>
								{/if}
							</span>
							<span class="mt-px shrink-0 text-[11.5px] text-text-4 tabular-nums">
								{timeAgo(n.createdAt)}
							</span>
						</a>
					{/each}
				</div>
				<a
					href="/me/notifications"
					onclick={() => (open = false)}
					class="flex h-10 items-center justify-center border-t border-border text-[12.5px] text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
				>
					{m.shell_notifications_view_all()}
				</a>
			{/if}
		</div>
	</div>
{/if}
