<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

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
		// Extra trailing actions injected between the existing left-aligned
		// attach button and the send button. Used by tickets for the
		// internal-note toggle. Omit for plain composers.
		rightActions?: Snippet;
	}

	let {
		value = $bindable(),
		placeholder = 'Write a message…',
		sending = false,
		disabled = false,
		accent = 'default',
		onsend,
		rightActions
	}: Props = $props();

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			if (!sending && value.trim()) onsend();
		}
	}
</script>

<div
	class="rounded-xl bg-surface border transition-colors {accent === 'warning'
		? 'border-[#e9c46a]/40 focus-within:border-[#e9c46a]/70'
		: 'border-border focus-within:border-border-strong'}"
>
	<textarea
		bind:value
		onkeydown={onKey}
		{placeholder}
		rows="2"
		disabled={disabled || sending}
		class="w-full resize-none bg-transparent border-0 px-3.5 pt-3 pb-1 text-[13px] leading-relaxed outline-none placeholder:text-text-3 disabled:opacity-60"
	></textarea>
	<div class="flex items-center gap-1 px-2 pb-2">
		<button
			type="button"
			aria-label="Attach"
			class="w-8 h-8 grid place-items-center rounded-lg border border-transparent bg-transparent text-text-3 hover:text-text hover:bg-surface-2 transition-colors"
		>
			<Icon name="paperclip" size={13} />
		</button>
		<div class="ml-auto flex items-center gap-1">
			{#if rightActions}{@render rightActions()}{/if}
			<button
				type="button"
				aria-label="Send"
				onclick={onsend}
				disabled={sending || !value.trim()}
				class="w-8 h-8 grid place-items-center rounded-lg bg-accent hover:bg-accent-strong text-white shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_4px_12px_rgba(239,122,109,0.25)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{#if sending}
					<span class="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin"></span>
				{:else}
					<Icon name="send" size={13} />
				{/if}
			</button>
		</div>
	</div>
</div>
