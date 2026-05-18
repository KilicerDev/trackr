<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? '');

	type Meta = { icon: string; title: string; hint: string; tone: 'warn' | 'danger' | 'neutral' };

	const meta = $derived<Meta>(
		status === 401
			? {
					icon: 'shield',
					title: 'Sign in required',
					hint: 'You need to be signed in to view this page.',
					tone: 'warn'
				}
			: status === 403
				? {
						icon: 'shield',
						title: 'Restricted',
						hint: message || 'You don’t have permission to view this page.',
						tone: 'warn'
					}
				: status === 404
					? {
							icon: 'search',
							title: 'Not found',
							hint:
								message || 'We couldn’t find what you were looking for.',
							tone: 'neutral'
						}
					: status === 500
						? {
								icon: 'refresh',
								title: 'Something went wrong',
								hint:
									message ||
									'An unexpected error occurred on our side. Try again in a moment.',
								tone: 'danger'
							}
						: {
								icon: 'x',
								title: `Error ${status}`,
								hint: message || 'An unexpected error occurred.',
								tone: 'danger'
							}
	);

	const accent = $derived(
		meta.tone === 'danger' ? '#ef4f5e' : meta.tone === 'warn' ? '#e9c46a' : '#7a9cf0'
	);
</script>

<svelte:head><title>Trackr · {meta.title}</title></svelte:head>

<div class="min-h-screen grid place-items-center bg-bg text-text px-6 py-12">
	<div class="flex flex-col items-center text-center max-w-md">
		<div
			class="relative grid place-items-center w-16 h-16 rounded-2xl bg-bg-elev border border-border mb-5"
			style:box-shadow="0 0 0 1px {accent}22, 0 8px 24px {accent}15"
		>
			<span
				class="absolute inset-0 rounded-2xl opacity-20"
				style:background="radial-gradient({accent} 0%, transparent 70%)"
			></span>
			<span style:color={accent} class="relative">
				<Icon name={meta.icon} size={22} />
			</span>
		</div>

		<div class="font-mono text-[11px] uppercase tracking-[0.12em] text-text-4 mb-1">
			Error {status}
		</div>
		<h1 class="text-[20px] font-semibold tracking-[-0.012em] text-text mb-2">{meta.title}</h1>
		<p class="text-[13.5px] leading-relaxed text-text-3 mb-6">{meta.hint}</p>

		<div class="flex items-center gap-2">
			{#if status === 401}
				<Button variant="primary" onclick={() => goto('/login')}>
					<Icon name="logout" size={12} class="rotate-180" />
					<span>Sign in</span>
				</Button>
			{:else}
				<Button variant="primary" onclick={() => goto('/')}>
					<Icon name="home" size={12} />
					<span>Go home</span>
				</Button>
			{/if}
		</div>
	</div>
</div>
