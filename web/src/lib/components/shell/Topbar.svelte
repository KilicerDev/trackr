<script lang="ts">
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import Avatar from '../Avatar.svelte';
	import Popover from '../Popover.svelte';
	import Kbd from '../Kbd.svelte';
	import FeedbackModal from '../FeedbackModal.svelte';
	import { page } from '$app/state';
	import { setActiveOrg, type PortalOrg } from '$lib/api/portal';
	import { getSidebar } from '$lib/stores/sidebar.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Snippet } from 'svelte';

	// Present only inside the main AppShell (not the portal shell).
	const sidebarUi = getSidebar();

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
		page.data?.isPortalUser ? ((page.data?.orgs as PortalOrg[] | undefined) ?? []) : []
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

<header class="flex shrink-0 items-center gap-3.5 border-b border-border bg-bg px-[22px] py-3">
	{#if sidebarUi}
		<button
			type="button"
			onclick={() => sidebarUi.toggle()}
			title={sidebarUi.collapsed ? m.shell_expand_sidebar() : m.shell_collapse_sidebar()}
			aria-label={sidebarUi.collapsed ? m.shell_expand_sidebar() : m.shell_collapse_sidebar()}
			class="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
		>
			<Icon name="sidebar" size={16} />
		</button>
	{/if}
	<div class="flex items-center gap-2 text-[13px]">
		{#each crumbs as c, i (c.label)}
			{#if i > 0}<span class="text-text-4">/</span>{/if}
			{#if c.href}
				<a href={c.href} class="text-text-3 hover:text-text">{c.label}</a>
			{:else}
				<span class="font-medium text-text">{c.label}</span>
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
						<span class="text-[11px] tracking-[0.08em] text-text-3 uppercase">
							{m.shell_notifications_unread({ n: notifications.unreadCount })}
						</span>
					{/if}
				</div>
				<div class="-mx-0.5 mb-1 h-px bg-border"></div>
				{#if notifications.items.length === 0}
					<div class="px-2 py-6 text-center text-[12px] text-text-3">
						{m.shell_notifications_empty()}
					</div>
				{:else}
					<div class="-mx-0.5 max-h-[360px] overflow-y-auto">
						{#each notifications.items as n (n.id)}
							<a
								href={n.url}
								onclick={() => (bellOpen = false)}
								class="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-surface-2 {n.readAt
									? 'text-text-2'
									: 'text-text'}"
							>
								{#if !n.readAt}
									<span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
								{:else}
									<span class="mt-1.5 h-1.5 w-1.5 shrink-0"></span>
								{/if}
								<div class="min-w-0 flex-1">
									<div class="truncate text-[13px] font-medium">{n.title}</div>
									{#if n.body}
										<div class="mt-0.5 line-clamp-2 text-[11px] text-text-3">{n.body}</div>
									{/if}
								</div>
								<span class="mt-0.5 shrink-0 text-[11px] text-text-4">{timeAgo(n.createdAt)}</span
								>
							</a>
						{/each}
					</div>
					<div class="-mx-0.5 mt-1 h-px bg-border"></div>
					<a
						href="/me/notifications"
						onclick={() => (bellOpen = false)}
						class="block px-2 py-1.5 text-center text-[11px] text-text-3 hover:text-text"
					>
						{m.shell_notifications_view_all()}
					</a>
				{/if}
			</Popover>
		</div>
		<div class="mx-1 h-5 w-px bg-border"></div>
		<div class="relative">
			<button
				type="button"
				onclick={() => (acctOpen = !acctOpen)}
				class="grid h-8 w-8 place-items-center rounded-full transition-shadow hover:shadow-[0_0_0_2px_var(--border-strong)]"
				aria-label={m.shell_account()}
			>
				<Avatar user={me} size={28} />
			</button>
			<Popover open={acctOpen} onclose={() => (acctOpen = false)} align="right" minWidth={240}>
				{#if me}
					<div class="flex items-center gap-2.5 px-2 pt-2 pb-3">
						<Avatar user={me} size={32} />
						<div class="flex min-w-0 flex-col">
							<span class="truncate text-[13px] font-medium">{me.name}</span>
							<span class="truncate text-[11px] text-text-3">{me.email}</span>
						</div>
					</div>
					<div class="-mx-0.5 mb-1 h-px bg-border"></div>
				{/if}
				<a
					href="/me/profile"
					onclick={() => (acctOpen = false)}
					class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
				>
					<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
						><Icon name="user" size={14} /></span
					>
					<span>{m.shell_account_profile()}</span>
				</a>
				<a
					href="/me/settings"
					onclick={() => (acctOpen = false)}
					class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
				>
					<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
						><Icon name="settings" size={14} /></span
					>
					<span>{m.shell_account_settings()}</span>
				</a>
				<a
					href="/me/notifications"
					onclick={() => (acctOpen = false)}
					class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
				>
					<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
						><Icon name="bell" size={14} /></span
					>
					<span>{m.shell_notifications()}</span>
				</a>
				<div class="-mx-0.5 my-1 h-px bg-border"></div>
				{#if showOrgSwitcher}
					<button
						type="button"
						onclick={() => (orgListOpen = !orgListOpen)}
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
					>
						<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
							><Icon name="org" size={14} /></span
						>
						<span>{m.shell_switch_organization()}</span>
						<span class="ml-auto text-text-3"
							><Icon name={orgListOpen ? 'chevron' : 'chevron-r'} size={12} /></span
						>
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
									class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
								>
									<span class="h-2 w-2 shrink-0 rounded-full" style:background={o.color}></span>
									<span class="truncate">{o.name}</span>
									<span
										class="ml-auto text-accent {o.id === activeOrgId ? 'opacity-100' : 'opacity-0'}"
									>
										<Icon name="check" size={13} />
									</span>
								</button>
							{/each}
						</div>
					{/if}
				{:else if !page.data?.isPortalUser}
					<button
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
					>
						<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
							><Icon name="home" size={14} /></span
						>
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
					class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
				>
					<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
						><Icon name="send" size={14} /></span
					>
					<span>{m.shell_send_feedback()}</span>
				</button>
				<div class="-mx-0.5 my-1 h-px bg-border"></div>
				<form method="post" action="/logout" class="contents">
					<button
						type="submit"
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none hover:bg-[#ef4f5e]/10 text-prio-urgent"
					>
						<span class="grid h-4 w-4 shrink-0 place-items-center"
							><Icon name="logout" size={14} /></span
						>
						<span>{m.shell_sign_out()}</span>
					</button>
				</form>
			</Popover>
		</div>
	</div>
</header>

<FeedbackModal open={feedbackOpen} onclose={() => (feedbackOpen = false)} />
