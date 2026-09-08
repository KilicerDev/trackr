<script lang="ts">
	import { pageTitle } from '$lib/brand';
	import { enhance } from '$app/forms';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '$lib/components/Avatar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { m } from '$lib/paraglide/messages';

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
	type Inbox = { items: NotifItem[]; hasMore: boolean; filter: 'all' | 'unread'; limit: number };
	type OrgUser = {
		id: string;
		name: string | null;
		email: string;
		initials: string;
		color: string;
	};

	const inbox = $derived((page.data as { inbox: Inbox }).inbox);
	const users = $derived((page.data?.users as OrgUser[] | undefined) ?? []);
	const usersById = $derived(new Map(users.map((u) => [u.id, u])));

	function actorAvatar(actorId: string | null) {
		if (!actorId) return undefined;
		const u = usersById.get(actorId);
		if (!u) return undefined;
		const name = u.name ?? u.email;
		return { name, initials: u.initials, color: u.color };
	}

	function timeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const s = Math.max(1, Math.floor(diff / 1000));
		if (s < 60) return `${s}s`;
		const mins = Math.floor(s / 60);
		if (mins < 60) return `${mins}m`;
		const h = Math.floor(mins / 60);
		if (h < 24) return `${h}h`;
		const d = Math.floor(h / 24);
		if (d < 7) return `${d}d`;
		return new Date(iso).toLocaleDateString();
	}

	const filterHref = (f: 'all' | 'unread') => `?filter=${f}`;
	const moreHref = $derived(`?filter=${inbox.filter}&limit=${inbox.limit + 40}`);

	let markingAll = $state(false);

	async function openNotification(e: MouseEvent, n: NotifItem) {
		if (n.readAt) return;
		e.preventDefault();
		try {
			await fetch('/api/notifications/read', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: n.id })
			});
			await invalidate('app:notifications');
		} catch {
			// non-fatal — navigate anyway
		}
		await goto(n.url);
	}
</script>

<svelte:head><title>{pageTitle(m.notif_inbox_title())}</title></svelte:head>

<header class="mb-6 flex items-end justify-between gap-4">
	<div>
		<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.notif_inbox_title()}</h1>
		<p class="mt-1 text-[14px] text-text-3">{m.notif_inbox_subtitle()}</p>
	</div>
	<a href="/me/settings" class="flex items-center gap-1.5 text-[13px] text-text-3 hover:text-text">
		<Icon name="settings" size={14} />
		<span>{m.notif_inbox_settings()}</span>
	</a>
</header>

<div class="mb-4 flex items-center justify-between gap-4">
	<div class="inline-flex h-8 items-center rounded-lg border border-border bg-surface p-0.5">
		{#each [{ v: 'all' as const, l: m.notif_filter_all() }, { v: 'unread' as const, l: m.notif_filter_unread() }] as opt (opt.v)}
			<a
				href={filterHref(opt.v)}
				class="grid h-full place-items-center rounded-md px-3 text-[13px] {inbox.filter === opt.v
					? 'bg-bg-elev text-text shadow-sm'
					: 'text-text-3 hover:text-text'}"
			>
				{opt.l}
			</a>
		{/each}
	</div>
	<form
		method="post"
		action="?/markAll"
		use:enhance={() => {
			markingAll = true;
			return async ({ result }) => {
				markingAll = false;
				if (result.type === 'success') await invalidate('app:notifications');
			};
		}}
	>
		<button
			type="submit"
			disabled={markingAll}
			class="text-[13px] text-text-3 hover:text-text disabled:opacity-50"
		>
			{m.shell_notifications_mark_all_read()}
		</button>
	</form>
</div>

{#if inbox.items.length === 0}
	<div
		class="rounded-2xl border border-border bg-bg-elev px-5 py-16 text-center text-[14px] text-text-3"
	>
		{inbox.filter === 'unread' ? m.notif_inbox_empty_unread() : m.shell_notifications_empty()}
	</div>
{:else}
	<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
		<div class="divide-y divide-border">
			{#each inbox.items as n (n.id)}
				{@const actor = actorAvatar(n.actorId)}
				<a
					href={n.url}
					onclick={(e) => openNotification(e, n)}
					class="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2 {n.readAt
						? 'text-text-2'
						: 'text-text'}"
				>
					<span class="mt-2 w-1.5 shrink-0">
						{#if !n.readAt}
							<span class="block h-1.5 w-1.5 rounded-full bg-accent"></span>
						{/if}
					</span>
					{#if actor}
						<Avatar user={actor} size={30} />
					{:else}
						<span
							class="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-surface-2 text-text-3"
						>
							<Icon name="bell" size={14} />
						</span>
					{/if}
					<div class="min-w-0 flex-1">
						<div class="text-[14px] font-medium">{n.title}</div>
						{#if n.body}
							<div class="mt-0.5 line-clamp-2 text-[13px] text-text-3">{n.body}</div>
						{/if}
					</div>
					<span class="mt-0.5 shrink-0 text-[12px] text-text-4">{timeAgo(n.createdAt)}</span>
				</a>
			{/each}
		</div>
	</div>

	{#if inbox.hasMore}
		<div class="mt-4 flex justify-center">
			<a
				href={moreHref}
				class="rounded-lg border border-border px-4 py-1.5 text-[13px] text-text-2 hover:bg-surface hover:text-text"
			>
				{m.notif_inbox_load_more()}
			</a>
		</div>
	{/if}
{/if}
