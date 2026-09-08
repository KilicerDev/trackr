<script lang="ts">
	import { pageTitle } from '$lib/brand';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import { m } from '$lib/paraglide/messages';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? '');

	type Meta = { icon: string; title: string; hint: string; tone: 'warn' | 'danger' | 'neutral' };

	const meta = $derived<Meta>(
		status === 401
			? {
					icon: 'shield',
					title: m.shell_error_401_title(),
					hint: m.shell_error_401_hint(),
					tone: 'warn'
				}
			: status === 403
				? {
						icon: 'shield',
						title: m.shell_error_403_title(),
						hint: message || m.shell_error_403_hint_short(),
						tone: 'warn'
					}
				: status === 404
					? {
							icon: 'search',
							title: m.shell_error_404_title(),
							hint: message || m.shell_error_404_hint_short(),
							tone: 'neutral'
						}
					: status === 500
						? {
								icon: 'refresh',
								title: m.shell_error_500_title(),
								hint: message || m.shell_error_500_hint_short(),
								tone: 'danger'
							}
						: {
								icon: 'x',
								title: m.shell_error_generic_title({ status }),
								hint: message || m.shell_error_generic_hint(),
								tone: 'danger'
							}
	);

	const accent = $derived(
		meta.tone === 'danger' ? '#ef4f5e' : meta.tone === 'warn' ? '#e9c46a' : '#7a9cf0'
	);
</script>

<svelte:head><title>{pageTitle(meta.title)}</title></svelte:head>

<div class="grid min-h-screen place-items-center bg-bg px-6 py-12 text-text">
	<div class="flex max-w-md flex-col items-center text-center">
		<div
			class="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-border bg-bg-elev"
			style:box-shadow="0 0 0 1px {accent}22, 0 8px 24px {accent}15"
		>
			<span
				class="absolute inset-0 rounded-2xl opacity-20"
				style:background="radial-gradient({accent} 0%, transparent 70%)"
			></span>
			<span style:color={accent} class="relative">
				<Icon name={meta.icon} size={24} />
			</span>
		</div>

		<div class="mb-1 font-mono text-[12px] tracking-[0.12em] text-text-4 uppercase">
			{m.shell_error_label({ status })}
		</div>
		<h1 class="mb-2 text-[22px] font-semibold tracking-[-0.012em] text-text">{meta.title}</h1>
		<p class="mb-6 text-[14px] leading-relaxed text-text-3">{meta.hint}</p>

		<div class="flex items-center gap-2">
			{#if status === 401}
				<Button variant="primary" onclick={() => goto('/login')}>
					<Icon name="logout" size={13} class="rotate-180" />
					<span>{m.shell_sign_in()}</span>
				</Button>
			{:else}
				<Button variant="primary" onclick={() => goto('/')}>
					<Icon name="home" size={13} />
					<span>{m.shell_go_home()}</span>
				</Button>
			{/if}
		</div>
	</div>
</div>
