<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import PickerSelect, { type PickerOption } from '../PickerSelect.svelte';
	import SecretReveal from './SecretReveal.svelte';
	import { m } from '$lib/paraglide/messages';

	export type ApiKeyUserOption = { id: string; name: string; email: string; role: string | null };

	interface Props {
		open: boolean;
		onclose: () => void;
		users: ApiKeyUserOption[];
	}
	let { open, onclose, users }: Props = $props();

	let submitting = $state(false);
	let serverError = $state<string | null>(null);
	let created = $state<{ id: string; secret: string; userName: string } | null>(null);
	let formKey = $state(0);

	let userId = $state<string[]>([]);
	let name = $state('');
	let expiry = $state('90');

	const userOptions = $derived<PickerOption[]>(
		users.map((u) => ({
			value: u.id,
			label: u.name,
			description: u.email,
			hint: u.role && u.role !== 'user' ? u.role : undefined
		}))
	);
	const selectedUser = $derived(users.find((u) => u.id === userId[0]) ?? null);

	const expiryOptions = $derived([
		{ value: '30', label: m.api_keys_expiry_days({ count: 30 }) },
		{ value: '90', label: m.api_keys_expiry_days({ count: 90 }) },
		{ value: '365', label: m.api_keys_expiry_year() },
		{ value: '', label: m.api_keys_expiry_never() }
	]);

	// Reset on every open. The writes are untracked so the effect only depends
	// on `open` (formKey++ would otherwise read what it writes and loop).
	$effect(() => {
		if (!open) return;
		untrack(() => {
			submitting = false;
			serverError = null;
			created = null;
			userId = [];
			name = '';
			expiry = '90';
			formKey++;
		});
	});

	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape' && !created) onclose();
	}
</script>

<svelte:window onkeydown={onKey} />

<Modal {open} onclose={() => !created && onclose()} maxWidth={600}>
	{#if created}
		<div class="px-5 pt-5 pb-4">
			<div class="mb-1 text-[12px] tracking-[0.08em] text-text-4 uppercase">
				{m.settings_tab_api_keys()}
			</div>
			<div class="mb-1 text-[18px] font-semibold">{m.api_keys_created_title()}</div>
			<p class="mb-4 text-[13px] text-text-3">
				{m.api_keys_created_for({ name: created.userName })}
			</p>
			<SecretReveal
				secret={created.secret}
				title={m.api_keys_secret_shown_once()}
				description={m.api_keys_secret_shown_once_desc()}
			/>
			<div class="mt-4 rounded-lg border border-border bg-bg/40 p-3">
				<div class="mb-1 text-[12px] tracking-[0.08em] text-text-4 uppercase">
					{m.api_keys_how_to_use()}
				</div>
				<pre
					class="overflow-x-auto font-mono text-[12px] leading-relaxed text-text-2">curl -H "Authorization: Bearer {created.secret}" \
  {typeof location !== 'undefined' ? location.origin : ''}/api/v1/me</pre>
			</div>
		</div>
		<div class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3">
			<div class="ml-auto flex items-center gap-2">
				<Button variant="primary" onclick={onclose}>{m.common_done()}</Button>
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
					const userName = selectedUser?.name ?? '';
					return async ({ result }: { result: ActionResult }) => {
						submitting = false;
						if (result.type === 'success') {
							const d = result.data as { id: string; secret: string };
							created = { id: d.id, secret: d.secret, userName };
							await invalidateAll();
						} else if (result.type === 'failure') {
							serverError =
								(result.data as { message?: string } | undefined)?.message ??
								m.api_keys_err_save_failed();
						} else if (result.type === 'error') {
							serverError = result.error?.message ?? m.api_keys_err_save_failed();
						}
					};
				}}
			>
				<div class="flex items-center border-b border-border px-5 pt-4 pb-3">
					<div>
						<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">
							{m.settings_tab_api_keys()}
						</div>
						<div class="text-[15px] font-semibold">{m.api_keys_new()}</div>
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
				<div class="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
					<div>
						<span class="mb-1 block text-[12px] tracking-[0.08em] text-text-4 uppercase"
							>{m.api_keys_field_user()}</span
						>
						<PickerSelect
							name="userId"
							bind:value={userId}
							options={userOptions}
							placeholder={m.api_keys_field_user_placeholder()}
							searchPlaceholder={m.common_search()}
							ariaLabel={m.api_keys_field_user()}
						/>
						<span class="mt-1 block text-[12px] text-text-4">{m.api_keys_field_user_hint()}</span>
					</div>
					<label class="block">
						<span class="mb-1 block text-[12px] tracking-[0.08em] text-text-4 uppercase"
							>{m.api_keys_field_name()}</span
						>
						<input
							name="name"
							bind:value={name}
							required
							maxlength="120"
							placeholder={m.api_keys_field_name_placeholder()}
							class="h-9 w-full rounded-lg border border-border bg-surface px-3 text-[14px] outline-none focus:border-border-strong"
						/>
					</label>
					<div>
						<span class="mb-1 block text-[12px] tracking-[0.08em] text-text-4 uppercase"
							>{m.api_keys_field_expiry()}</span
						>
						<div class="flex flex-wrap gap-2">
							{#each expiryOptions as o (o.value)}
								<label
									class="cursor-pointer rounded-lg border px-3 py-1.5 text-[13px] transition-colors {expiry ===
									o.value
										? 'border-border-strong bg-surface text-text'
										: 'border-border text-text-3 hover:text-text'}"
								>
									<input
										type="radio"
										name="expiry"
										value={o.value}
										bind:group={expiry}
										class="sr-only"
									/>
									{o.label}
								</label>
							{/each}
						</div>
					</div>
					{#if serverError}
						<div
							class="rounded-lg border border-prio-urgent/35 bg-prio-urgent/8 px-3 py-2 text-[14px] text-accent"
						>
							{serverError}
						</div>
					{/if}
				</div>
				<div
					class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3"
				>
					<span class="text-[12px] text-text-3">{m.api_keys_create_note()}</span>
					<div class="ml-auto flex items-center gap-2">
						<Button variant="default" onclick={onclose}>{m.common_cancel()}</Button>
						<Button variant="primary" type="submit" disabled={submitting || !userId.length}
							>{submitting ? m.common_creating() : m.api_keys_create()}</Button
						>
					</div>
				</div>
			</form>
		{/key}
	{/if}
</Modal>
