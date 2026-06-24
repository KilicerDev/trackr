<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const cols = '1.8fr 0.8fr 1.3fr 1.3fr 0.9fr 0.9fr';
</script>

<svelte:head><title>{m.system_tab_schedules()} · {m.system_title()}</title></svelte:head>

<div class="mb-6">
	<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.schedules_title()}</h1>
	<p class="mt-1 max-w-xl text-[12.5px] text-text-3">{m.schedules_description()}</p>
</div>

<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
	{#if data.schedules.length === 0}
		<EmptyState
			icon="calendar"
			title={m.schedules_empty_title()}
			hint={m.schedules_empty_description()}
		/>
	{:else}
		<div
			class="grid h-9 items-center gap-3 border-b border-border px-5 text-[11px] uppercase tracking-[0.08em] text-text-4"
			style:grid-template-columns={cols}
		>
			<span>{m.schedules_col_job()}</span>
			<span>{m.schedules_col_interval()}</span>
			<span>{m.schedules_col_next_run()}</span>
			<span>{m.schedules_col_last_run()}</span>
			<span>{m.schedules_col_status()}</span>
			<span class="text-right">{m.schedules_col_actions()}</span>
		</div>
		{#each data.schedules as s (s.id)}
			<div
				class="grid items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[12.5px] last:border-b-0"
				style:grid-template-columns={cols}
			>
				<div class="min-w-0">
					<span class="font-medium text-text">{s.jobType}</span>
					{#if s.dedupeKey}
						<span class="block truncate font-mono text-[11px] text-text-4">{s.dedupeKey}</span>
					{/if}
				</div>
				<div class="font-mono text-text-3">{s.interval}</div>
				<div class="font-mono text-text-3">{s.nextRunAt}</div>
				<div class="font-mono text-text-3">{s.lastRunAt ?? m.schedules_never()}</div>
				<div>
					<span
						class="inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-medium {s.enabled
							? 'bg-emerald-500/15 text-emerald-400'
							: 'bg-surface text-text-3'}"
					>
						{s.enabled ? m.schedules_status_enabled() : m.schedules_status_paused()}
					</span>
				</div>
				<div class="text-right">
					<form
						method="post"
						action="?/toggle"
						class="inline"
						use:enhance={() => {
							return async ({ result, update }) => {
								await update();
								if (result.type === 'success') await invalidateAll();
							};
						}}
					>
						<input type="hidden" name="id" value={s.id} />
						<input type="hidden" name="enabled" value={(!s.enabled).toString()} />
						<button
							type="submit"
							class="inline-flex h-7 cursor-pointer items-center rounded-md border border-border bg-surface px-2.5 text-[12px] text-text-2 transition-colors hover:text-text"
						>
							{s.enabled ? m.schedules_action_disable() : m.schedules_action_enable()}
						</button>
					</form>
				</div>
			</div>
		{/each}
	{/if}
</div>
