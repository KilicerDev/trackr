<script lang="ts">
	import { enhance } from '$app/forms';
	import BrandMark from '$lib/components/auth/BrandMark.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const minLength = 8;

	let submitting = $state(false);
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let clientError = $state<string | null>(null);
	let passwordInput = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (data.invitation) passwordInput?.focus();
	});

	const strength = $derived.by(() => {
		if (!password) return null;
		if (password.length < minLength)
			return { label: m.auth_password_too_short(), tone: 'error' as const };
		if (password.length < 12) return { label: m.auth_password_ok(), tone: 'warn' as const };
		return { label: m.auth_password_strong(), tone: 'good' as const };
	});
</script>

<svelte:head>
	<title>{m.auth_invite_page_title()}</title>
</svelte:head>

<div class="relative flex min-h-screen items-center justify-center px-4 py-10">
	<div
		class="pointer-events-none absolute inset-x-0 top-[-12%] mx-auto h-[420px] max-w-[640px] opacity-60 blur-[90px]"
		style:background="radial-gradient(closest-side, rgba(239,122,109,0.18), transparent 70%)"
	></div>

	<div class="relative w-full max-w-[420px]">
		<BrandMark />

		{#if !data.invitation}
			<div
				class="rounded-[14px] border border-border bg-bg-elev px-7 pt-7 pb-6 text-center"
				style:box-shadow="0 1px 0 rgba(255,255,255,0.03) inset, 0 24px 60px -28px rgba(0,0,0,0.55)"
			>
				<div
					class="mx-auto grid h-11 w-11 place-items-center rounded-full text-prio-urgent"
					style:background="rgba(239,79,94,0.12)"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M12 8v4M12 16h.01" />
					</svg>
				</div>
				<h1 class="mt-4 text-[18px] font-semibold tracking-[-0.012em] text-text">
					{m.auth_invite_invalid()}
				</h1>
				<p class="mt-1.5 text-[13.5px] leading-relaxed text-text-3">
					{m.auth_invite_invalid_desc()}
				</p>
				<a
					href="/login"
					class="mt-6 inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-accent px-4 text-[13px] font-semibold text-white transition-colors hover:bg-accent-strong"
					style:box-shadow="var(--shadow-btn-lg)"
				>
					{m.auth_back_to_sign_in()}
				</a>
			</div>
		{:else}
			<div
				class="rounded-[14px] border border-border bg-bg-elev px-7 pt-7 pb-6"
				style:box-shadow="0 1px 0 rgba(255,255,255,0.03) inset, 0 24px 60px -28px rgba(0,0,0,0.55)"
			>
				<h1 class="text-[19px] font-semibold tracking-[-0.012em] text-text">
					{m.auth_invite_welcome({ name: data.invitation.name.split(' ')[0] })}
				</h1>
				<p class="mt-1 text-[13.5px] leading-relaxed text-text-3">
					{m.auth_invite_subtitle()}
				</p>

				<div
					class="mt-5 flex items-center gap-2 rounded-[8px] border border-border bg-surface px-3 py-2"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-text-4"
					>
						<rect x="3" y="5" width="18" height="14" rx="2" />
						<path d="m3 7 9 6 9-6" />
					</svg>
					<span class="truncate text-[13px] text-text-2">{data.invitation.email}</span>
				</div>

				<form
					method="post"
					use:enhance={({ cancel }) => {
						clientError = null;
						if (password.length < minLength) {
							clientError = m.auth_password_min_chars({ min: minLength });
							cancel();
							return;
						}
						if (password !== confirmPassword) {
							clientError = m.auth_passwords_no_match();
							cancel();
							return;
						}
						submitting = true;
						return async ({ update }) => {
							await update();
							submitting = false;
						};
					}}
					class="mt-5 flex flex-col gap-4"
				>
					<input type="hidden" name="token" value={data.token} />

					<label class="flex flex-col gap-1.5">
						<span class="text-[12.5px] font-medium text-text-2">{m.auth_password_label()}</span>
						<div class="relative">
							<input
								bind:this={passwordInput}
								bind:value={password}
								type={showPassword ? 'text' : 'password'}
								name="password"
								required
								minlength={minLength}
								autocomplete="new-password"
								placeholder={m.auth_password_min_placeholder({ min: minLength })}
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
						{#if strength}
							<span
								class="text-[11.5px] {strength.tone === 'error'
									? 'text-prio-urgent'
									: strength.tone === 'warn'
										? 'text-text-3'
										: 'text-status-done'}"
							>
								{strength.label}
							</span>
						{/if}
					</label>

					<label class="flex flex-col gap-1.5">
						<span class="text-[12.5px] font-medium text-text-2"
							>{m.auth_confirm_password_label()}</span
						>
						<input
							bind:value={confirmPassword}
							type={showPassword ? 'text' : 'password'}
							required
							autocomplete="new-password"
							placeholder={m.auth_reenter_password_placeholder()}
							class="h-10 rounded-[8px] border border-border bg-surface px-3 text-[14px] text-text transition-colors placeholder:text-text-4 focus:border-border-strong focus:bg-surface-2"
						/>
					</label>

					{#if clientError || form?.message}
						<div
							class="rounded-[8px] border border-prio-urgent/35 px-3 py-2 text-[13px] text-prio-urgent"
							style:background="rgba(239,79,94,0.08)"
						>
							{clientError ?? form?.message}
						</div>
					{/if}

					<button
						type="submit"
						disabled={submitting}
						class="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-accent text-[13.5px] font-semibold text-white transition-[background,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-default disabled:opacity-70"
						style:box-shadow="var(--shadow-btn-lg)"
					>
						{#if submitting}
							<span
								class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
							></span>
							<span>{m.auth_invite_activating()}</span>
						{:else}
							<span>{m.auth_invite_activate_account()}</span>
						{/if}
					</button>
				</form>
			</div>

			<p class="mt-5 text-center text-[12px]">
				<a href="/login" class="text-text-3 transition-colors hover:text-text"
					>{m.auth_back_to_sign_in()}</a
				>
			</p>
		{/if}
	</div>
</div>
