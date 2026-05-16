<script lang="ts">
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import Avatar from '../Avatar.svelte';
	import Popover from '../Popover.svelte';
	import Kbd from '../Kbd.svelte';
	import FeedbackModal from '../FeedbackModal.svelte';
	import { page } from '$app/state';
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

	let acctOpen = $state(false);
	let feedbackOpen = $state(false);
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
		<IconButton ariaLabel="Notifications" dot>
			<Icon name="bell" size={15} />
		</IconButton>
		<IconButton ariaLabel="Messages">
			<Icon name="msg" size={15} />
		</IconButton>
		<div class="w-px h-5 bg-border mx-1"></div>
		<div class="relative">
			<button
				type="button"
				onclick={() => (acctOpen = !acctOpen)}
				class="w-8 h-8 rounded-full grid place-items-center hover:shadow-[0_0_0_2px_var(--border-strong)] transition-shadow"
				aria-label="Account"
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
					<span>Profile</span>
				</a>
				<a
					href="/me/settings"
					onclick={() => (acctOpen = false)}
					class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none"
				>
					<span class="grid place-items-center w-4 h-4 text-text-3 shrink-0"><Icon name="settings" size={14} /></span>
					<span>Account settings</span>
				</a>
				<a
					href="/me/notifications"
					onclick={() => (acctOpen = false)}
					class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none"
				>
					<span class="grid place-items-center w-4 h-4 text-text-3 shrink-0"><Icon name="bell" size={14} /></span>
					<span>Notifications</span>
				</a>
				<div class="h-px bg-border -mx-0.5 my-1"></div>
				<button class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none">
					<span class="grid place-items-center w-4 h-4 text-text-3 shrink-0"><Icon name="home" size={14} /></span>
					<span>Switch workspace</span>
					<span class="ml-auto"><Kbd>⌘O</Kbd></span>
				</button>
				<button
					type="button"
					onclick={() => {
						acctOpen = false;
						feedbackOpen = true;
					}}
					class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none"
				>
					<span class="grid place-items-center w-4 h-4 text-text-3 shrink-0"><Icon name="send" size={14} /></span>
					<span>Send feedback</span>
				</button>
				<div class="h-px bg-border -mx-0.5 my-1"></div>
				<form method="post" action="/logout" class="contents">
					<button
						type="submit"
						class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-[13px] leading-none hover:bg-[#ef4f5e]/10"
						style:color="#ef4f5e"
					>
						<span class="grid place-items-center w-4 h-4 shrink-0"><Icon name="logout" size={14} /></span>
						<span>Sign out</span>
					</button>
				</form>
			</Popover>
		</div>
	</div>
</header>

<FeedbackModal open={feedbackOpen} onclose={() => (feedbackOpen = false)} />
