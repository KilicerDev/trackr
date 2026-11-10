<script lang="ts">
	import Icon from '../Icon.svelte';
	import { page } from '$app/state';
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
		/** A back button before the crumbs (detail pages). */
		back?: { href: string; label: string };
	}
	let { crumbs, actions, back }: Props = $props();

	// Notifications live in the rail now; on mobile the rail is a closed drawer,
	// so the menu button carries the unread dot.
	const unread = $derived(
		((page.data?.notifications as { unreadCount?: number } | undefined)?.unreadCount ?? 0) > 0
	);
</script>

<header
	class="flex min-h-[60px] shrink-0 items-center gap-3.5 border-b border-border bg-bg px-[24px] py-3"
>
	{#if sidebarUi}
		<!-- Mobile: hamburger opens the slide-over drawer (both shells). -->
		<button
			type="button"
			onclick={() => sidebarUi.openMobile()}
			title={m.shell_open_menu()}
			aria-label={m.shell_open_menu()}
			class="relative -ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text md:hidden"
		>
			<Icon name="menu" size={18} />
			{#if unread}
				<span class="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent ring-2 ring-bg"></span>
			{/if}
		</button>
	{/if}
	{#if back}
		<a
			href={back.href}
			title={back.label}
			aria-label={back.label}
			class="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-surface text-text-2 transition-colors hover:border-border-strong hover:bg-surface-2 hover:text-text"
		>
			<Icon name="arrow-left" size={16} />
		</a>
	{/if}
	<div class="flex min-w-0 items-center gap-2 overflow-hidden text-[14px] whitespace-nowrap">
		<!--
			Narrow screens keep the current crumb, plus its parent when the trail is
			three deep or more (the parent is the way back: Projects, Notebook, …).
		-->
		{#each crumbs as c, i (`${i}:${c.label}`)}
			{@const last = crumbs.length - 1}
			{@const shown = i === last || (crumbs.length >= 3 && i === last - 1)}
			{@const trail = shown ? '' : 'max-md:hidden'}
			{#if i > 0}<span class="text-text-4 {i === last && crumbs.length >= 3 ? '' : 'max-md:hidden'}"
					>/</span
				>{/if}
			{#if c.href}
				<a href={c.href} class="shrink-0 text-text-3 hover:text-text {trail}">{c.label}</a>
			{:else}
				<span class="min-w-0 truncate font-medium text-text {trail}">{c.label}</span>
			{/if}
		{/each}
	</div>
	<div class="ml-auto flex items-center gap-2">
		{#if actions}{@render actions()}{/if}
	</div>
</header>
