<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import WebhookForm, { type WebhookFormOptions } from './WebhookForm.svelte';
	import SecretReveal from './SecretReveal.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		onclose: () => void;
		options: WebhookFormOptions;
	}
	let { open, onclose, options }: Props = $props();

	let submitting = $state(false);
	let serverError = $state<string | null>(null);
	let created = $state<{ id: string; secret: string } | null>(null);
	let formKey = $state(0);

	// Reset on every open. The writes are untracked so the effect only depends
	// on `open` (formKey++ would otherwise read what it writes and loop).
	$effect(() => {
		if (!open) return;
		untrack(() => {
			submitting = false;
			serverError = null;
			created = null;
			formKey++;
		});
	});

	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape' && !created) onclose();
	}
</script>

<svelte:window onkeydown={onKey} />

<Modal {open} onclose={() => !created && onclose()} maxWidth={720}>
	{#if created}
		<div class="px-5 pt-5 pb-4">
			<div class="mb-1 text-[12px] tracking-[0.08em] text-text-4 uppercase">
				{m.settings_tab_webhooks()}
			</div>
			<div class="mb-4 text-[18px] font-semibold">{m.webhooks_created_title()}</div>
			<SecretReveal secret={created.secret} />
		</div>
		<div class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3">
			<div class="ml-auto flex items-center gap-2">
				<Button variant="default" onclick={onclose}>{m.common_done()}</Button>
				<a
					href="/admin/settings/webhooks/{created.id}"
					class="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-[12px] py-[8px] text-[14px] font-medium text-white shadow-btn hover:bg-accent-strong"
					>{m.webhooks_open_webhook()}</a
				>
			</div>
		</div>
	{:else}
		{#key formKey}
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					submitting = true;
					serverError = null;
					return async ({ result }: { result: ActionResult }) => {
						submitting = false;
						if (result.type === 'success') {
							const d = result.data as { id: string; secret: string };
							created = { id: d.id, secret: d.secret };
							await invalidateAll();
						} else if (result.type === 'failure') {
							serverError =
								(result.data as { message?: string } | undefined)?.message ??
								m.webhooks_err_save_failed();
						} else if (result.type === 'error') {
							serverError = result.error?.message ?? m.webhooks_err_save_failed();
						}
					};
				}}
			>
				<div class="flex items-center border-b border-border px-5 pt-4 pb-3">
					<div>
						<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">
							{m.settings_tab_webhooks()}
						</div>
						<div class="text-[15px] font-semibold">{m.webhooks_new()}</div>
					</div>
					<button
						type="button"
						onclick={onclose}
						aria-label={m.common_close()}
						class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
					>
						<Icon name="x" size={15} />
					</button>
				</div>
				<div class="max-h-[70vh] overflow-y-auto px-5 py-4">
					<WebhookForm {options} autofocus />
					{#if serverError}
						<div
							class="mt-4 rounded-lg border border-prio-urgent/35 bg-prio-urgent/8 px-3 py-2 text-[14px] text-accent"
						>
							{serverError}
						</div>
					{/if}
				</div>
				<div
					class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3"
				>
					<span class="text-[12px] text-text-3">{m.webhooks_create_note()}</span>
					<div class="ml-auto flex items-center gap-2">
						<Button variant="default" onclick={onclose}>{m.common_cancel()}</Button>
						<Button variant="primary" type="submit" disabled={submitting}
							>{submitting ? m.common_creating() : m.webhooks_create()}</Button
						>
					</div>
				</div>
			</form>
		{/key}
	{/if}
</Modal>
