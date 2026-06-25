<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import BrandMark from '$lib/components/auth/BrandMark.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
	let emailInput = $state<HTMLInputElement | null>(null);
	let email = $state(form?.email ?? '');
	let showPassword = $state(false);

	const justReset = $derived(page.url.searchParams.get('reset') === '1');
	const next = $derived(page.url.searchParams.get('next') ?? '');

	$effect(() => {
		emailInput?.focus();
	});
</script>

<svelte:head>
	<title>{m.auth_login_page_title()}</title>
</svelte:head>

<div class="relative flex min-h-screen items-center justify-center px-4 py-10">
	<!-- Ambient accent glow -->
	<div
		class="pointer-events-none absolute inset-x-0 top-[-12%] mx-auto h-[420px] max-w-[640px] opacity-60 blur-[90px]"
		style:background="radial-gradient(closest-side, rgba(239,122,109,0.18), transparent 70%)"
	></div>

	<div class="relative w-full max-w-[400px]">
		<BrandMark />

		<div
			class="rounded-[14px] border border-border bg-bg-elev px-7 pt-7 pb-6"
			style:box-shadow="0 1px 0 rgba(255,255,255,0.03) inset, 0 24px 60px -28px rgba(0,0,0,0.55)"
		>
			<h1 class="text-[19px] font-semibold tracking-[-0.012em] text-text">
				{m.auth_login_welcome()}
			</h1>
			<p class="mt-1 text-[13.5px] text-text-3">
				{m.auth_login_subtitle()}
			</p>

			{#if justReset}
				<div
					class="mt-5 flex items-start gap-2 rounded-[8px] border border-status-done/30 px-3 py-2 text-[13px] text-status-done bg-status-done/8"
				>
					<Icon name="check" size={14} stroke={2} class="mt-0.5 shrink-0" />
					<span>{m.auth_login_reset_success()}</span>
				</div>
			{/if}

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
				{#if next}
					<input type="hidden" name="next" value={next} />
				{/if}

				<label class="flex flex-col gap-1.5">
					<span class="text-[12.5px] font-medium text-text-2">{m.auth_email_label()}</span>
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

				<label class="flex flex-col gap-1.5">
					<div class="flex items-center justify-between">
						<span class="text-[12.5px] font-medium text-text-2">{m.auth_password_label()}</span>
						<a
							href="/forgot-password"
							class="text-[12px] font-medium text-text-3 transition-colors hover:text-text"
						>
							{m.auth_login_forgot()}
						</a>
					</div>
					<div class="relative">
						<input
							type={showPassword ? 'text' : 'password'}
							name="password"
							required
							autocomplete="current-password"
							placeholder="••••••••"
							class="h-10 w-full rounded-[8px] border border-border bg-surface pr-10 pl-3 text-[14px] text-text transition-colors placeholder:text-text-4 focus:border-border-strong focus:bg-surface-2"
						/>
						<button
							type="button"
							onclick={() => (showPassword = !showPassword)}
							class="absolute top-1/2 right-2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-[6px] text-text-4 transition-colors hover:bg-[var(--row-hover)] hover:text-text-2"
							aria-label={showPassword ? m.auth_hide_password() : m.auth_show_password()}
							tabindex={-1}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="15"
								height="15"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								{#if showPassword}
									<path
										d="M2 12s3.5-7 10-7c2.2 0 4.1.6 5.6 1.5M22 12s-3.5 7-10 7c-2.2 0-4.1-.6-5.6-1.5"
									/>
									<path d="m3 3 18 18" />
								{:else}
									<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
									<circle cx="12" cy="12" r="3" />
								{/if}
							</svg>
						</button>
					</div>
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
					class="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-accent text-[13.5px] font-semibold text-white shadow-btn-lg transition-[background,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-default disabled:opacity-70"
				>
					{#if submitting}
						<span
							class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
						></span>
						<span>{m.auth_login_signing_in()}</span>
					{:else}
						<span>{m.auth_login_sign_in()}</span>
					{/if}
				</button>
			</form>
		</div>

		<p class="mt-5 text-center text-[12px] text-text-4">
			{m.auth_footer_internal()}
		</p>
	</div>
</div>
