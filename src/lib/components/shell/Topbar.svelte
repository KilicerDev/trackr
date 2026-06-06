<script lang="ts">
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import Avatar from '../Avatar.svelte';
	import Popover from '../Popover.svelte';
	import Kbd from '../Kbd.svelte';
	import FeedbackModal from '../FeedbackModal.svelte';
	import { page } from '$app/state';
	import { setActiveOrg, type PortalOrg } from '$lib/portal';
	import { m } from '$lib/paraglide/messages';
	import type { Snippet } from 'svelte';

	interface Crumb {
		label: string;
		href?: string;
	}
	interface Props {
		crumbs: Crumb[];
		actions?: Snippet;
	}
	let { crumbs, actions }: Props = $props();

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

	const me = $derived.by(() => {
		const u = page.data?.user as { id: string; name: string | null; email: string } | undefined;
		if (!u) return undefined;
		const name = u.name ?? u.email;
		const initials = name
			.split(/\s+/)
			.map((p) => p[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase();
		let h = 0;
		for (const c of u.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
		return { name, email: u.email, initials, color: `hsl(${h % 360} 55% 60%)` };
	});

	const notifications = $derived(
		(page.data?.notifications as NotifData | undefined) ?? { items: [], unreadCount: 0 }
	);

	let acctOpen = $state(false);
	let bellOpen = $state(false);
	let feedbackOpen = $state(false);
	let orgListOpen = $state(false);

	// Portal users (external ticket-only) belonging to multiple orgs get an
	// organization switcher in place of the (inert) "Switch workspace" item.
	const portalOrgs = $derived(
		(page.data?.isPortalUser ? ((page.data?.orgs as PortalOrg[] | undefined) ?? []) : [])
	);
	const activeOrgId = $derived((page.data?.activeOrgId as string | null | undefined) ?? null);
	const showOrgSwitcher = $derived(portalOrgs.length > 1);

	function timeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const s = Math.max(1, Math.floor(diff / 1000));
		if (s < 60) return `${s}s`;
		const m = Math.floor(s / 60);
		if (m < 60) return `${m}m`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h`;
		const d = Math.floor(h / 24);
		return `${d}d`;
	}
</script>

<header class="flex items-center gap-3.5 px-[22px] py-3 border-b border-border bg-bg shrink-0">
	<div class="flex items-center gap-2 text-[13.5px]">
		{#each crumbs as c, i (c.label)}
			{#if i > 0}<span class="text-text-4">/</span>{/if}
			{#if c.href}
				<a href={c.href} class="text-text-3 hover:text-text">{c.label}</a>
			{:else}
				<span class="text-text font-medium">{c.label}</span>
			{/if}
		{/each}
	</div>
	<div class="ml-auto flex items-center gap-2">
		{#if actions}{@render actions()}{/if}
		<div class="relative">
			<IconButton
				ariaLabel={m.shell_notifications()}
				dot={notifications.unreadCount > 0}
				onclick={() => (bellOpen = !bellOpen)}
			>
				<Icon name="bell" size={15} />
			</IconButton>
			<Popover open={bellOpen} onclose={() => (bellOpen = false)} align="right" minWidth={340}>
				<div class="flex items-center justify-between px-2 pt-1 pb-2">
					<span class="text-[12px] font-medium">{m.shell_notifications()}</span>
					{#if notifications.unreadCount > 0}
						<span class="text-[10.5px] uppercase tracking-[0.08em] text-text-3">
							{m.shell_notifications_unread({ n: notifications.unreadCount })}
						</span>
					{/if}
				</div>
				<div class="h-px bg-border -mx-0.5 mb-1"></div>
				{#if notifications.items.length === 0}
					<div class="px-2 py-6 text-center text-[12px] text-text-3">{m.shell_notifications_empty()}</div>
				{:else}
					<div class="max-h-[360px] overflow-y-auto -mx-0.5">
						{#each notifications.items as n (n.id)}
							<a
								href={n.url}
								onclick={() => (bellOpen = false)}
								class="flex items-start gap-2 px-2 py-2 rounded-md hover:bg-surface-2 {n.readAt
									? 'text-text-2'
									: 'text-text'}"
							>
								{#if !n.readAt}
									<span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0"></span>
								{:else}
									<span class="mt-1.5 w-1.5 h-1.5 shrink-0"></span>
								{/if}
								<div class="min-w-0 flex-1">
									<div class="text-[12.5px] font-medium truncate">{n.title}</div>
									{#if n.body}
										<div class="text-[11.5px] text-text-3 line-clamp-2 mt-0.5">{n.body}</div>
									{/if}
								</div>
								<span class="text-[10.5px] text-text-4 shrink-0 mt-0.5">{timeAgo(n.createdAt)}</span>
							</a>
						{/each}
					</div>
					<div class="h-px bg-border -mx-0.5 mt-1"></div>
					<a
						href="/me/notifications"
						onclick={() => (bellOpen = false)}
						class="block text-center text-[11.5px] text-text-3 hover:text-text px-2 py-1.5"
					>
						{m.shell_notifications_view_all()}
					</a>
				{/if}
			</Popover>
		</div>
		<div class="w-px h-5 bg-border mx-1"></div>
		<div class="relative">
			<button
				type="button"
				onclick={() => (acctOpen = !acctOpen)}
				class="w-8 h-8 rounded-full grid place-items-center hover:shadow-[0_0_0_2px_var(--border-strong)] transition-shadow"
				aria-label={m.shell_account()}
			>
				<Avatar user={me} size={28} />
			</button>
			<Popover open={acctOpen} onclose={() => (acctOpen = false)} align="right" minWidth={240}>
				{#if me}
					<div class="flex items-center gap-2.5 px-2 pt-2 pb-3">
						<Avatar user={me} size={32} />
						<div class="flex flex-col min-w-0">
							<span class="text-[13px] font-medium truncate">{me.name}</span>
							<span class="text-[11.5px] text-text-3 truncate">{me.email}</span>
						</div>
					</div>
					<div class="h-px bg-border -mx-0.5 mb-1"></div>
				{/if}
				<a
					href="/me/profile"
					onclick={() => (acctOpen = false)}
					class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none"
				>
					<span class="grid place-items-center w-4 h-4 text-text-3 shrink-0"><Icon name="user" size={14} /></span>
					<span>{m.shell_account_profile()}</span>
				</a>
				<a
					href="/me/settings"
					onclick={() => (acctOpen = false)}
					class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none"
				>
					<span class="grid place-items-center w-4 h-4 text-text-3 shrink-0"><Icon name="settings" size={14} /></span>
					<span>{m.shell_account_settings()}</span>
				</a>
				<a
					href="/me/notifications"
					onclick={() => (acctOpen = false)}
					class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none"
				>
					<span class="grid place-items-center w-4 h-4 text-text-3 shrink-0"><Icon name="bell" size={14} /></span>
					<span>{m.shell_notifications()}</span>
				</a>
				<div class="h-px bg-border -mx-0.5 my-1"></div>
				{#if showOrgSwitcher}
					<button
						type="button"
						onclick={() => (orgListOpen = !orgListOpen)}
						class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none"
					>
						<span class="grid place-items-center w-4 h-4 text-text-3 shrink-0"><Icon name="org" size={14} /></span>
						<span>{m.shell_switch_organization()}</span>
						<span class="ml-auto text-text-3"><Icon name={orgListOpen ? 'chevron' : 'chevron-r'} size={12} /></span>
					</button>
					{#if orgListOpen}
						<div class="pl-1.5">
							{#each portalOrgs as o (o.id)}
								<button
									type="button"
									onclick={() => {
										acctOpen = false;
										if (o.id !== activeOrgId) void setActiveOrg(o.id);
									}}
									class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[12.5px] leading-none"
								>
									<span class="w-2 h-2 rounded-full shrink-0" style:background={o.color}></span>
									<span class="truncate">{o.name}</span>
									<span class="ml-auto text-accent {o.id === activeOrgId ? 'opacity-100' : 'opacity-0'}">
										<Icon name="check" size={13} />
									</span>
								</button>
							{/each}
						</div>
					{/if}
				{:else if !page.data?.isPortalUser}
					<button class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none">
						<span class="grid place-items-center w-4 h-4 text-text-3 shrink-0"><Icon name="home" size={14} /></span>
						<span>{m.shell_switch_workspace()}</span>
						<span class="ml-auto"><Kbd>⌘O</Kbd></span>
					</button>
				{/if}
				<button
					type="button"
					onclick={() => {
						acctOpen = false;
						feedbackOpen = true;
					}}
					class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none"
				>
					<span class="grid place-items-center w-4 h-4 text-text-3 shrink-0"><Icon name="send" size={14} /></span>
					<span>{m.shell_send_feedback()}</span>
				</button>
				<div class="h-px bg-border -mx-0.5 my-1"></div>
				<form method="post" action="/logout" class="contents">
					<button
						type="submit"
						class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-[13px] leading-none hover:bg-[#ef4f5e]/10"
						style:color="#ef4f5e"
					>
						<span class="grid place-items-center w-4 h-4 shrink-0"><Icon name="logout" size={14} /></span>
						<span>{m.shell_sign_out()}</span>
					</button>
				</form>
			</Popover>
		</div>
	</div>
</header>

<FeedbackModal open={feedbackOpen} onclose={() => (feedbackOpen = false)} />
