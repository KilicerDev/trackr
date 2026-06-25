<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import MentionTextarea from './MentionTextarea.svelte';
	import { m } from '$lib/paraglide/messages';

	type Accent = 'default' | 'warning';

	interface Props {
		value: string;
		placeholder?: string;
		sending?: boolean;
		disabled?: boolean;
		// Border tone — 'warning' switches to the system yellow (used by
		// tickets when composing an internal note).
		accent?: Accent;
		onsend: () => void;
		// Trailing actions injected before the send button (e.g. the attach
		// button and the internal-note toggle used by tickets). Omit for plain
		// composers.
		rightActions?: Snippet;
		// Scope @-mention suggestions to people who can access this project
		// (see MentionTextarea). Omit for org-level surfaces like tickets.
		projectId?: string | null;
		// Opt-in inline `#` tagging (chat). Passed straight through to
		// MentionTextarea; the tag lands as a chip via onTagAdd, not in the text.
		tags?: import('$lib/server/chat').ChatTag[];
		onTagAdd?: (id: string | null, label: string) => void;
	}

	let {
		value = $bindable(),
		placeholder = m.composer_placeholder(),
		sending = false,
		disabled = false,
		accent = 'default',
		onsend,
		rightActions,
		projectId = null,
		tags,
		onTagAdd
	}: Props = $props();

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			if (!sending && value.trim()) onsend();
		}
	}
</script>

<div
	class="rounded-xl border bg-surface transition-colors {accent === 'warning'
		? 'border-[#e9c46a]/40 focus-within:border-[#e9c46a]/70'
		: 'border-border focus-within:border-border-strong'}"
>
	<MentionTextarea
		bind:value
		onkeydown={onKey}
		{projectId}
		{tags}
		{onTagAdd}
		{placeholder}
		rows={2}
		disabled={disabled || sending}
		class="w-full resize-none border-0 bg-transparent px-3.5 pt-3 pb-1 text-[13px] leading-relaxed outline-none placeholder:text-text-3 disabled:opacity-60"
	/>
	<div class="flex items-center gap-1 px-2 pb-2">
		<div class="ml-auto flex items-center gap-1">
			{#if rightActions}{@render rightActions()}{/if}
			<button
				type="button"
				aria-label={m.composer_send()}
				onclick={onsend}
				disabled={sending || !value.trim()}
				class="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white shadow-btn transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if sending}
					<span class="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent"
					></span>
				{:else}
					<Icon name="send" size={13} />
				{/if}
			</button>
		</div>
	</div>
</div>
