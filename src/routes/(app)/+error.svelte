<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Topbar from '$lib/components/shell/Topbar.svelte';
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
						hint:
							message ||
							'You don’t have permission to view this page. If you think this is wrong, ask a workspace admin to grant access.',
						tone: 'warn'
					}
				: status === 404
					? {
							icon: 'search',
							title: 'Not found',
							hint:
								message ||
								'We couldn’t find what you were looking for. It may have been moved, archived, or deleted.',
							tone: 'neutral'
						}
					: status === 500
						? {
								icon: 'refresh',
								title: 'Something went wrong',
								hint:
									message ||
									'An unexpected error occurred on our side. The team has been notified — try again in a moment.',
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

	function back() {
		if (typeof history !== 'undefined' && history.length > 1) history.back();
		else void goto('/');
	}
</script>

<svelte:head><title>Trackr · {meta.title}</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: meta.title }]} />

<div class="flex-1 min-h-0 grid place-items-center px-6 py-12">
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
			<Button variant="default" onclick={back}>
				<Icon name="chevron" size={12} class="rotate-90" />
				<span>Go back</span>
			</Button>
			{#if status === 401}
				<Button variant="primary" onclick={() => goto('/login')}>
					<Icon name="logout" size={12} class="rotate-180" />
					<span>Sign in</span>
				</Button>
			{:else}
				<Button variant="primary" onclick={() => goto('/tasks')}>
					<Icon name="home" size={12} />
					<span>Back to workspace</span>
				</Button>
			{/if}
		</div>

		{#if status >= 500}
			<button
				type="button"
				onclick={() => location.reload()}
				class="mt-4 inline-flex items-center gap-1.5 text-[12px] text-text-3 hover:text-text"
			>
				<Icon name="refresh" size={11} />
				<span>Reload the page</span>
			</button>
		{/if}
	</div>
</div>
