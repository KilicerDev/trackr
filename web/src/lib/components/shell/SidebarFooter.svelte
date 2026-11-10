<script lang="ts">
	// Foot of the app and portal sidebars: the account tile (which used to be
	// the top bar's avatar) and, on the desktop app rail, the collapse button.
	// The account menu opens upwards and keeps a folded rail peeking open while
	// it's shown, so it never gets clipped.
	import Icon from '../Icon.svelte';
	import Avatar from '../Avatar.svelte';
	import Popover from '../Popover.svelte';
	import Kbd from '../Kbd.svelte';
	import FeedbackModal from '../FeedbackModal.svelte';
	import { page } from '$app/state';
	import { setActiveOrg, type PortalOrg } from '$lib/api/portal';
	import { getSidebar } from '$lib/stores/sidebar.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Rail } from './rail.svelte';

	interface Props {
		rail: Rail;
	}
	let { rail }: Props = $props();

	const sidebarUi = getSidebar();

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

	let feedbackOpen = $state(false);
	let orgListOpen = $state(false);

	const portalOrgs = $derived(
		page.data?.isPortalUser ? ((page.data?.orgs as PortalOrg[] | undefined) ?? []) : []
	);
	const activeOrgId = $derived((page.data?.activeOrgId as string | null | undefined) ?? null);
	const showOrgSwitcher = $derived(portalOrgs.length > 1);

	function closeAccount() {
		rail.accountOpen = false;
	}

	const ITEM =
		'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text';
</script>

<!--
	Rail foot. Mirrors the workspace tile at the top: a hairline above, then an
	account tile (avatar, name, email, ↕) with the collapse button beside it.
	The avatar keeps the rail's icon axis (x = 32: 8px pad + 10px + 14px), so
	folded it sits exactly under the nav icons; folding only fades the text,
	the button drops out so the tile keeps its width.
-->
<div class="shrink-0 border-t border-border/60 p-2">
	<div class="flex items-center gap-1">
		<div class="relative min-w-0 flex-1">
			<button
				type="button"
				onclick={() => (rail.accountOpen = !rail.accountOpen)}
				aria-label={m.shell_account()}
				aria-expanded={rail.accountOpen}
				title={rail.rail ? (me?.name ?? undefined) : undefined}
				class="group/acct flex h-12 w-full items-center gap-2.5 overflow-hidden rounded-[10px] border px-[9px] text-left transition-colors duration-150 {rail.accountOpen
					? 'border-border-strong bg-surface-2'
					: 'border-transparent hover:border-border hover:bg-surface'}"
			>
				<span class="relative shrink-0">
					<Avatar user={me} size={28} />
				</span>
				<span class="flex min-w-0 flex-1 flex-col gap-0.5 {rail.fade}">
					<span class="truncate text-[13.5px] leading-tight font-medium text-text"
						>{me?.name ?? ''}</span
					>
					<span class="truncate text-[12px] leading-tight text-text-3">{me?.email ?? ''}</span>
				</span>
				<span
					class="shrink-0 text-text-4 transition-colors group-hover/acct:text-text-3 {rail.fade}"
				>
					<Icon name="chevrons-vertical" size={14} />
				</span>
			</button>
			<Popover open={rail.accountOpen} onclose={closeAccount} align="left" minWidth={240} dropUp>
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
				<a href="/me/profile" onclick={closeAccount} class={ITEM}>
					<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
						><Icon name="user" size={15} /></span
					>
					<span>{m.shell_account_profile()}</span>
				</a>
				<a href="/me/settings" onclick={closeAccount} class={ITEM}>
					<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
						><Icon name="settings" size={15} /></span
					>
					<span>{m.shell_account_settings()}</span>
				</a>
				<a href="/me/notifications" onclick={closeAccount} class={ITEM}>
					<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3"
						><Icon name="bell" size={15} /></span
					>
					<span>{m.shell_notifications()}</span>
				</a>
				<div class="-mx-0.5 my-1 h-px bg-border"></div>
				{#if showOrgSwitcher}
					<button type="button" onclick={() => (orgListOpen = !orgListOpen)} class={ITEM}>
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
										closeAccount();
										if (o.id !== activeOrgId) void setActiveOrg(o.id);
									}}
									class={ITEM}
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
					<button class={ITEM}>
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
						closeAccount();
						feedbackOpen = true;
					}}
					class={ITEM}
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
		{#if sidebarUi?.collapsible && !rail.rail}
			<!-- Desktop only: on mobile the rail is a drawer opened from the top
			     bar. Folded, hovering the rail peeks it open, which brings this
			     button back to expand it. -->
			<button
				type="button"
				onclick={() => sidebarUi.toggle()}
				aria-label={sidebarUi.collapsed ? m.shell_expand_sidebar() : m.shell_collapse_sidebar()}
				title={sidebarUi.collapsed ? m.shell_expand_sidebar() : m.shell_collapse_sidebar()}
				class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text max-md:hidden"
			>
				<Icon name="sidebar" size={17} />
			</button>
		{/if}
	</div>
</div>

<FeedbackModal open={feedbackOpen} onclose={() => (feedbackOpen = false)} />
