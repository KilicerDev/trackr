<script lang="ts">
	import { pageTitle, brandName } from '$lib/brand';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import { m } from '$lib/paraglide/messages';

	const status = $derived(page.status);
	// SvelteKit's default status texts ("Not Found", "Forbidden", …) only repeat
	// the title; keep the friendlier hint unless the server said something specific.
	const DEFAULT_STATUS_TEXT = new Set([
		'Not Found',
		'Forbidden',
		'Unauthorized',
		'Internal Error',
		'Internal Server Error'
	]);
	const message = $derived.by(() => {
		const raw = page.error?.message ?? '';
		return DEFAULT_STATUS_TEXT.has(raw) ? '' : raw;
	});

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
						hint: message || m.shell_error_403_hint(),
						tone: 'warn'
					}
				: status === 404
					? {
							icon: 'search',
							title: m.shell_error_404_title(),
							hint: message || m.shell_error_404_hint(),
							tone: 'neutral'
						}
					: status === 500
						? {
								icon: 'refresh',
								title: m.shell_error_500_title(),
								hint: message || m.shell_error_500_hint(),
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

	function back() {
		if (typeof history !== 'undefined' && history.length > 1) history.back();
		else void goto('/');
	}
</script>

<svelte:head><title>{pageTitle(meta.title)}</title></svelte:head>

<Topbar
	crumbs={[
		{ label: m.shell_workspace_crumb({ brand: brandName() }), href: '/tasks' },
		{ label: meta.title }
	]}
/>

<div class="grid min-h-0 flex-1 place-items-center px-6 py-12">
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
			<Button variant="default" onclick={back}>
				<Icon name="chevron" size={13} class="rotate-90" />
				<span>{m.common_back()}</span>
			</Button>
			{#if status === 401}
				<Button variant="primary" onclick={() => goto('/login')}>
					<Icon name="logout" size={13} class="rotate-180" />
					<span>{m.shell_sign_in()}</span>
				</Button>
			{:else}
				<Button variant="primary" onclick={() => goto('/tasks')}>
					<Icon name="home" size={13} />
					<span>{m.shell_back_to_workspace()}</span>
				</Button>
			{/if}
		</div>

		{#if status >= 500}
			<button
				type="button"
				onclick={() => location.reload()}
				class="mt-4 inline-flex items-center gap-1.5 text-[13px] text-text-3 hover:text-text"
			>
				<Icon name="refresh" size={12} />
				<span>{m.shell_error_reload()}</span>
			</button>
		{/if}
	</div>
</div>
