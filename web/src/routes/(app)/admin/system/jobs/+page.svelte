<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const statusStyles: Record<string, string> = {
		queued: 'bg-surface text-text-3',
		running: 'bg-blue-500/15 text-blue-400',
		succeeded: 'bg-emerald-500/15 text-emerald-400',
		failed: 'bg-red-500/15 text-red-400',
		cancelled: 'bg-amber-500/15 text-amber-400'
	};
	const statusLabels: Record<string, () => string> = {
		queued: () => m.jobs_status_queued(),
		running: () => m.jobs_status_running(),
		succeeded: () => m.jobs_status_succeeded(),
		failed: () => m.jobs_status_failed(),
		cancelled: () => m.jobs_status_cancelled()
	};
	const summaryOrder = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;

	const isCancellable = (s: string) => s === 'queued' || s === 'running';
	const isRetryable = (s: string) =>
		s === 'succeeded' || s === 'failed' || s === 'cancelled';

	const cols = '2fr 1fr 0.7fr 1.2fr 1.2fr 0.8fr';
</script>

<svelte:head><title>{m.jobs_title()} · {m.system_title()}</title></svelte:head>

<div class="mb-6 flex items-end gap-4">
	<div>
		<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.jobs_title()}</h1>
		<p class="mt-1 max-w-xl text-[12.5px] text-text-3">{m.jobs_description()}</p>
	</div>
	<div class="ml-auto">
		<Button variant="default" size="sm" onclick={() => invalidateAll()}>
			<Icon name="refresh" size={13} />
			{m.jobs_refresh()}
		</Button>
	</div>
</div>

<!-- Queue health -->
<div class="mb-5 flex flex-wrap gap-2">
	{#each summaryOrder as status (status)}
		<span
			class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-2.5 py-1.5 text-[12.5px] text-text-3"
		>
			<span class="inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium {statusStyles[status]}">
				{statusLabels[status]()}
			</span>
			<span class="font-semibold text-text">{data.counts[status]}</span>
		</span>
	{/each}
</div>

<!-- Send a test email — smoke-tests the mail worker end-to-end -->
<div class="mb-6 max-w-xl rounded-2xl border border-border bg-bg-elev p-5">
	<h2 class="text-[14px] font-semibold text-text">{m.jobs_enqueue_heading()}</h2>
	<p class="mt-1 text-[12.5px] text-text-3">{m.jobs_enqueue_description()}</p>
	<form
		method="post"
		action="?/sendTest"
		class="mt-4"
		use:enhance={() => {
			return async ({ result, update }) => {
				await update();
				if (result.type === 'success') {
					showToast('ok', m.jobs_enqueue_success());
					await invalidateAll();
				}
			};
		}}
	>
		<Button variant="primary" size="sm" type="submit">{m.jobs_enqueue_submit()}</Button>
	</form>
	{#if form?.message}
		<p class="mt-3 text-[12.5px] text-red-400">{form.message}</p>
	{/if}
</div>

<!-- Job list -->
<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
	{#if data.jobs.length === 0}
		<EmptyState icon="list" title={m.jobs_empty_title()} hint={m.jobs_empty_description()} />
	{:else}
		<div
			class="grid h-9 items-center gap-3 border-b border-border px-5 text-[11px] uppercase tracking-[0.08em] text-text-4"
			style:grid-template-columns={cols}
		>
			<span>{m.jobs_col_job()}</span>
			<span>{m.jobs_col_status()}</span>
			<span>{m.jobs_col_attempts()}</span>
			<span>{m.jobs_col_created()}</span>
			<span>{m.jobs_col_updated()}</span>
			<span class="text-right">{m.jobs_col_actions()}</span>
		</div>
		{#each data.jobs as j (j.id)}
			<div
				class="grid items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[12.5px] last:border-b-0"
				style:grid-template-columns={cols}
			>
				<div class="min-w-0">
					<span class="font-medium text-text">{j.type}</span>
					{#if j.priority !== 0}
						<span
							class="ml-2 rounded bg-surface px-1.5 py-0.5 text-[11px] text-text-3"
							title={m.jobs_priority_title()}
						>
							P{j.priority}
						</span>
					{/if}
					<span class="block truncate font-mono text-[11px] text-text-4">{j.id}</span>
					{#if j.lastError}
						<span class="mt-0.5 block max-w-md truncate text-[12px] text-red-400">{j.lastError}</span>
					{/if}
				</div>
				<div>
					<span
						class="inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-medium {statusStyles[
							j.status
						] ?? statusStyles.queued}"
					>
						{statusLabels[j.status]?.() ?? j.status}
					</span>
				</div>
				<div class="text-text-3">{j.attempts}/{j.maxAttempts}</div>
				<div class="font-mono text-text-3">{j.createdAt}</div>
				<div class="font-mono text-text-3">{j.updatedAt}</div>
				<div class="text-right">
					{#if isCancellable(j.status)}
						<form
							method="post"
							action="?/cancel"
							class="inline"
							use:enhance={() => {
								return async ({ result, update }) => {
									await update();
									if (result.type === 'success') await invalidateAll();
								};
							}}
						>
							<input type="hidden" name="id" value={j.id} />
							<button
								type="submit"
								class="inline-flex h-7 cursor-pointer items-center rounded-md border border-border bg-surface px-2.5 text-[12px] text-text-2 transition-colors hover:text-text"
							>
								{m.jobs_action_cancel()}
							</button>
						</form>
					{:else if isRetryable(j.status)}
						<form
							method="post"
							action="?/retry"
							class="inline"
							use:enhance={() => {
								return async ({ result, update }) => {
									await update();
									if (result.type === 'success') await invalidateAll();
								};
							}}
						>
							<input type="hidden" name="id" value={j.id} />
							<button
								type="submit"
								class="inline-flex h-7 cursor-pointer items-center rounded-md border border-border bg-surface px-2.5 text-[12px] text-text-2 transition-colors hover:text-text"
							>
								{m.jobs_action_retry()}
							</button>
						</form>
					{/if}
				</div>
			</div>
		{/each}
	{/if}
</div>
