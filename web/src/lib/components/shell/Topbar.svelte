<script lang="ts">
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import Avatar from '../Avatar.svelte';
	import Popover from '../Popover.svelte';
	import Kbd from '../Kbd.svelte';
	import FeedbackModal from '../FeedbackModal.svelte';
	import { page } from '$app/state';
	import { goto, invalidate } from '$app/navigation';
	import { setActiveOrg, type PortalOrg } from '$lib/api/portal';
	import { getSidebar } from '$lib/stores/sidebar.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Snippet } from 'svelte';

	// Shell state shared with the rail (AppShell and PortalShell both provide it).
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

	// Who did it: the actor's avatar leads each row when we know them (the
	// layout ships the org directory); otherwise a glyph for what the
	// notification is about.
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

	let markingAll = $state(false);

	// Mark a notification read, then navigate. We await the write so the layout
	// load on the destination recomputes the badge from committed state (a
	// fire-and-forget write races that count query and leaves the dot stale).
	async function openNotification(e: MouseEvent, n: NotifItem) {
		bellOpen = false;
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
			// Non-fatal: navigate anyway, entity-based mark-read may still clear it.
		}
		await goto(n.url);
	}

	async function markAllRead() {
		if (markingAll || notifications.unreadCount === 0) return;
		markingAll = true;
		try {
			await fetch('/api/notifications/read', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ all: true })
			});
			await invalidate('app:notifications');
		} catch {
			// swallow — the count simply won't update this attempt
		} finally {
			markingAll = false;
		}
	}
</script>

<header class="flex shrink-0 items-center gap-3.5 border-b border-border bg-bg px-[24px] py-3">
	{#if sidebarUi}
		<!-- Mobile: hamburger opens the slide-over drawer (both shells). -->
		<button
			type="button"
			onclick={() => sidebarUi.openMobile()}
			title={m.shell_open_menu()}
			aria-label={m.shell_open_menu()}
			class="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text md:hidden"
		>
			<Icon name="menu" size={18} />
		</button>
		{#if sidebarUi.collapsible}
			<!-- Desktop: collapse the rail to icons. -->
			<button
				type="button"
				onclick={() => sidebarUi.toggle()}
				title={sidebarUi.collapsed ? m.shell_expand_sidebar() : m.shell_collapse_sidebar()}
				aria-label={sidebarUi.collapsed ? m.shell_expand_sidebar() : m.shell_collapse_sidebar()}
				class="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text max-md:hidden"
			>
				<Icon name="sidebar" size={17} />
			</button>
		{/if}
	{/if}
	<div class="flex min-w-0 items-center gap-2 overflow-hidden text-[14px] whitespace-nowrap">
		{#each crumbs as c, i (`${i}:${c.label}`)}
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
				<Icon name="bell" size={16} />
			</IconButton>
			<Popover
				open={bellOpen}
				onclose={() => (bellOpen = false)}
				align="right"
				minWidth={380}
				maxWidth={420}
			>
				<!-- Popover pads 6px; the list wants edge-to-edge sections. -->
				<div class="-m-1.5 overflow-hidden rounded-[10px]">
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
							onclick={() => (bellOpen = false)}
							class="flex h-10 items-center justify-center border-t border-border text-[12.5px] text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
						>
							{m.shell_notifications_view_all()}
						</a>
					{/if}
				</div>
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
				<Avatar user={me} size={31} />
			</button>
			<Popover open={acctOpen} onclose={() => (acctOpen = false)} align="right" minWidth={240}>
				{#if me}
					<div class="flex items-center gap-2.5 px-2 pt-2 pb-3">
						<Avatar user={me} size={35} />
						<div class="flex min-w-0 flex-col">
							<span class="truncate text-[14px] font-medium">{me.name}</span>
							<span class="truncate text-[12px] text-text-3">{me.email}</span>
						</div>
					</div>
					<div class="-mx-0.5 mb-1 h-px bg-border"></div>
				{/if}
				<a
					href="/me/profile"
					onclick={() => (acctOpen = false)}
					class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
				>
					<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
						><Icon name="user" size={15} /></span
					>
					<span>{m.shell_account_profile()}</span>
				</a>
				<a
					href="/me/settings"
					onclick={() => (acctOpen = false)}
					class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
				>
					<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
						><Icon name="settings" size={15} /></span
					>
					<span>{m.shell_account_settings()}</span>
				</a>
				<a
					href="/me/notifications"
					onclick={() => (acctOpen = false)}
					class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
				>
					<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
						><Icon name="bell" size={15} /></span
					>
					<span>{m.shell_notifications()}</span>
				</a>
				<div class="-mx-0.5 my-1 h-px bg-border"></div>
				{#if showOrgSwitcher}
					<button
						type="button"
						onclick={() => (orgListOpen = !orgListOpen)}
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
					>
						<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
							><Icon name="org" size={15} /></span
						>
						<span>{m.shell_switch_organization()}</span>
						<span class="ml-auto text-text-3"
							><Icon name={orgListOpen ? 'chevron' : 'chevron-r'} size={13} /></span
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
									class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
								>
									<span class="h-2 w-2 shrink-0 rounded-full" style:background={o.color}></span>
									<span class="truncate">{o.name}</span>
									<span
										class="ml-auto text-accent {o.id === activeOrgId ? 'opacity-100' : 'opacity-0'}"
									>
										<Icon name="check" size={14} />
									</span>
								</button>
							{/each}
						</div>
					{/if}
				{:else if !page.data?.isPortalUser}
					<button
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
					>
						<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
							><Icon name="home" size={15} /></span
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
					class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
				>
					<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
						><Icon name="send" size={15} /></span
					>
					<span>{m.shell_send_feedback()}</span>
				</button>
				<div class="-mx-0.5 my-1 h-px bg-border"></div>
				<form method="post" action="/logout" class="contents">
					<button
						type="submit"
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-prio-urgent hover:bg-[#ef4f5e]/10"
					>
						<span class="grid h-4 w-4 shrink-0 place-items-center"
							><Icon name="logout" size={15} /></span
						>
						<span>{m.shell_sign_out()}</span>
					</button>
				</form>
			</Popover>
		</div>
	</div>
</header>

<FeedbackModal open={feedbackOpen} onclose={() => (feedbackOpen = false)} />
