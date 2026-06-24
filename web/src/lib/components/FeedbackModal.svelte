<script lang="ts">
	import { page } from '$app/state';
	import { showToast } from '$lib/toast.svelte';
	import Modal from './Modal.svelte';
	import Icon from './Icon.svelte';
	import Button from './Button.svelte';
	import Kbd from './Kbd.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		onclose: () => void;
	}
	let { open, onclose }: Props = $props();

	type Kind = 'bug' | 'idea' | 'general';
	const KINDS: { value: Kind; label: string; icon: string; hint: string }[] = $derived([
		{
			value: 'bug',
			label: m.shell_feedback_kind_bug(),
			icon: 'shield',
			hint: m.shell_feedback_kind_bug_hint()
		},
		{
			value: 'idea',
			label: m.shell_feedback_kind_idea(),
			icon: 'star',
			hint: m.shell_feedback_kind_idea_hint()
		},
		{
			value: 'general',
			label: m.shell_feedback_kind_general(),
			icon: 'msg',
			hint: m.shell_feedback_kind_general_hint()
		}
	]);

	let kind = $state<Kind>('general');
	let message = $state('');
	let submitting = $state(false);
	let formEl = $state<HTMLFormElement>();

	$effect(() => {
		if (open) {
			kind = 'general';
			message = '';
			submitting = false;
		}
	});

	async function submit(e?: SubmitEvent) {
		e?.preventDefault();
		const msg = message.trim();
		if (!msg || submitting) return;
		submitting = true;
		try {
			const res = await fetch('/api/feedback', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ kind, message: msg, url: page.url.pathname + page.url.search })
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(data.message ?? m.shell_feedback_send_error());
			}
			showToast('ok', m.shell_feedback_sent());
			onclose();
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.shell_feedback_send_error());
		} finally {
			submitting = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') onclose();
		else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			formEl?.requestSubmit();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<Modal {open} {onclose} maxWidth={520}>
	<form bind:this={formEl} onsubmit={submit}>
		<div class="flex items-center border-b border-border px-5 pt-4 pb-3">
			<div>
				<div class="text-[11px] tracking-[0.08em] text-text-4 uppercase">
					{m.shell_feedback_eyebrow()}
				</div>
				<div class="text-[15px] font-semibold">{m.shell_send_feedback()}</div>
			</div>
			<button
				type="button"
				onclick={onclose}
				aria-label={m.common_close()}
				class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
			>
				<Icon name="x" size={14} />
			</button>
		</div>

		<div class="px-5 pt-5 pb-3">
			<div class="mb-2 text-[10.5px] tracking-[0.08em] text-text-4 uppercase">
				{m.shell_feedback_type()}
			</div>
			<div class="mb-4 grid grid-cols-3 gap-1.5">
				{#each KINDS as k (k.value)}
					{@const active = kind === k.value}
					<button
						type="button"
						onclick={() => (kind = k.value)}
						class="flex flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors {active
							? 'border-accent bg-accent/5 text-text'
							: 'border-border bg-surface text-text-2 hover:border-border-strong'}"
					>
						<span class="flex items-center gap-1.5 text-[12.5px] font-medium">
							<Icon name={k.icon} size={13} class={active ? 'text-accent' : 'text-text-3'} />
							{k.label}
						</span>
						<span class="text-[11px] leading-snug text-text-3">{k.hint}</span>
					</button>
				{/each}
			</div>

			<div class="mb-2 text-[10.5px] tracking-[0.08em] text-text-4 uppercase">
				{m.shell_feedback_message()}
			</div>
			<textarea
				bind:value={message}
				required
				placeholder={kind === 'bug'
					? m.shell_feedback_placeholder_bug()
					: kind === 'idea'
						? m.shell_feedback_placeholder_idea()
						: m.shell_feedback_placeholder_general()}
				rows="6"
				maxlength="4000"
				class="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-text outline-none placeholder:text-text-3 focus:border-border-strong"
			></textarea>

			<p class="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-text-3">
				<Icon name="link" size={11} class="text-text-4" />
				{m.shell_feedback_url_note()}
			</p>
		</div>

		<div class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3">
			<span class="text-[11.5px] text-text-3">
				<Kbd>⌘↵</Kbd>
				{m.shell_feedback_to_send()}
			</span>
			<div class="ml-auto flex items-center gap-2">
				<Button variant="default" onclick={onclose}>{m.common_cancel()}</Button>
				<button
					type="submit"
					disabled={submitting || !message.trim()}
					class="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-[11px] py-[7px] text-[13px] font-medium text-white shadow-btn transition-[background,border-color,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
				>
					<Icon name="send" size={13} />
					{submitting ? m.shell_feedback_sending() : m.shell_send_feedback()}
				</button>
			</div>
		</div>
	</form>
</Modal>
