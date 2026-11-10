<script lang="ts">
	// Mobile only: opens the rail as a slide-over drawer (both shells). It
	// carries the unread dot, since notifications live in the rail. Sits first
	// in each page's top row — the view toolbar or the page header.
	import Icon from '../Icon.svelte';
	import { page } from '$app/state';
	import { getSidebar } from '$lib/stores/sidebar.svelte';
	import { m } from '$lib/paraglide/messages';

	let { class: cls = '' }: { class?: string } = $props();

	const sidebarUi = getSidebar();
	const unread = $derived(
		((page.data?.notifications as { unreadCount?: number } | undefined)?.unreadCount ?? 0) > 0
	);
</script>

{#if sidebarUi}
	<button
		type="button"
		onclick={() => sidebarUi.openMobile()}
		title={m.shell_open_menu()}
		aria-label={m.shell_open_menu()}
		class="relative -ml-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text md:hidden {cls}"
	>
		<Icon name="menu" size={18} />
		{#if unread}
			<span class="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-bg"></span>
		{/if}
	</button>
{/if}
