<script lang="ts">
	import { enhance } from '$app/forms';
	import BrandMark from '$lib/components/auth/BrandMark.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
	let emailInput = $state<HTMLInputElement | null>(null);
	let email = $state(form?.email ?? '');

	$effect(() => {
		emailInput?.focus();
	});
</script>

<svelte:head>
	<title>{m.auth_forgot_page_title()}</title>
</svelte:head>

<div class="relative flex min-h-screen items-center justify-center px-4 py-10">
	<div
		class="pointer-events-none absolute inset-x-0 top-[-12%] mx-auto h-[420px] max-w-[640px] opacity-60 blur-[90px]"
		style:background="radial-gradient(closest-side, rgba(239,122,109,0.18), transparent 70%)"
	></div>

	<div class="relative w-full max-w-[400px]">
		<BrandMark />

		<div
			class="rounded-[14px] border border-border bg-bg-elev px-7 pt-7 pb-6 shadow-card"
		>
			{#if form?.sent}
				<div
					class="mx-auto grid h-11 w-11 place-items-center rounded-full text-status-done bg-status-done/12"
				>
					<Icon name="check" size={20} stroke={2} />
				</div>
				<h1 class="mt-4 text-center text-[20px] font-semibold tracking-[-0.012em] text-text">
					{m.auth_forgot_check_email()}
				</h1>
				<p class="mt-1.5 text-center text-[13px] leading-relaxed text-text-3">
					{m.auth_forgot_sent_message({ email: form.email })}
				</p>
				<a
					href="/login"
					class="mt-6 inline-flex h-10 w-full items-center justify-center rounded-[8px] border border-border bg-surface text-[13px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
				>
					{m.auth_back_to_sign_in()}
				</a>
			{:else}
				<h1 class="text-[20px] font-semibold tracking-[-0.012em] text-text">
					{m.auth_forgot_title()}
				</h1>
				<p class="mt-1 text-[13px] text-text-3">
					{m.auth_forgot_subtitle()}
				</p>

				<form
					method="post"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update();
							submitting = false;
						};
					}}
					class="mt-6 flex flex-col gap-4"
				>
					<label class="flex flex-col gap-1.5">
						<span class="text-[13px] font-medium text-text-2">{m.auth_email_label()}</span>
						<input
							bind:this={emailInput}
							type="email"
							name="email"
							required
							autocomplete="email"
							spellcheck="false"
							bind:value={email}
							placeholder="you@example.com"
							class="h-10 rounded-[8px] border border-border bg-surface px-3 text-[14px] text-text transition-colors placeholder:text-text-4 focus:border-border-strong focus:bg-surface-2"
						/>
					</label>

					{#if form?.message}
						<div
							class="rounded-[8px] border border-prio-urgent/35 px-3 py-2 text-[13px] text-prio-urgent bg-prio-urgent/8"
						>
							{form.message}
						</div>
					{/if}

					<button
						type="submit"
						disabled={submitting}
						class="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-accent text-[13px] font-semibold text-white shadow-btn-lg transition-[background,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-default disabled:opacity-70"
					>
						{#if submitting}
							<span
								class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
							></span>
							<span>{m.auth_forgot_sending()}</span>
						{:else}
							<span>{m.auth_forgot_send_link()}</span>
						{/if}
					</button>
				</form>
			{/if}
		</div>

		<p class="mt-5 text-center text-[12px]">
			<a href="/login" class="text-text-3 transition-colors hover:text-text"
				>{m.auth_back_to_sign_in()}</a
			>
		</p>
	</div>
</div>
