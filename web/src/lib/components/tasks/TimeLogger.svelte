<script lang="ts">
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { formatEstimate } from '$lib/utils/format';
	import { m } from '$lib/paraglide/messages';

	function todayIso(): string {
		const d = new Date();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${d.getFullYear()}-${m}-${dd}`;
	}
	import type { Task } from '$lib/types';

	interface Props {
		task: Task;
		onlog?: (entry: { h: number; m: number; date: string; note: string }) => void;
	}
	let { task, onlog }: Props = $props();

	let open = $state(false);
	let h = $state(0);
	let min = $state(0);
	let date = $state(todayIso());
	let note = $state('');

	let totalLogged = $derived((task.timeLogs ?? []).reduce((s, t) => s + t.minutes, 0));
	let summary = $derived.by(() => {
		if (totalLogged === 0 && !task.estimate) return m.tasks_none_logged();
		if (totalLogged === 0) return `0 / ${formatEstimate(task.estimate)}`;
		if (!task.estimate) return m.tasks_estimate_logged({ value: formatEstimate(totalLogged) });
		return `${formatEstimate(totalLogged)} / ${formatEstimate(task.estimate)}`;
	});

	function cancel() {
		open = false;
		h = 0;
		min = 0;
		note = '';
	}
	function submit() {
		if (h === 0 && min === 0) return;
		onlog?.({ h, m: min, date, note });
		cancel();
	}
</script>

<div class="relative">
	<!-- Trigger row: always in flow, fixed height -->
	<button
		type="button"
		onclick={() => (open = !open)}
		class="flex w-full items-center gap-2 rounded-xl border border-border bg-surface/40 px-3 py-2.5 text-left transition-colors hover:bg-surface {open
			? 'invisible'
			: ''}"
	>
		<span
			class="grid h-7 w-7 place-items-center rounded-md border border-border bg-bg-elev text-text-3"
		>
			<Icon name="calendar" size={13} />
		</span>
		<span class="text-[13px] font-medium text-text">{m.tasks_log_time()}</span>
		<span class="ml-auto font-mono text-[11px] text-text-3">{summary}</span>
		<span class="text-text-3">
			<Icon name="chevron" size={11} />
		</span>
	</button>

	{#if open}
		<!-- Expanded panel: floats over the elements below -->
		<div
			use:clickOutside={cancel}
			class="absolute inset-x-0 top-0 z-30 overflow-hidden rounded-xl border border-border bg-bg-elev shadow-lg"
		>
			<button
				type="button"
				onclick={() => (open = false)}
				class="flex w-full items-center gap-2 px-3 py-2.5 text-left"
			>
				<span
					class="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface text-text-3"
				>
					<Icon name="calendar" size={13} />
				</span>
				<span class="text-[13px] font-medium text-text">{m.tasks_log_time()}</span>
				<span class="ml-auto font-mono text-[11px] text-text-3">{summary}</span>
				<span class="rotate-180 text-text-3">
					<Icon name="chevron" size={11} />
				</span>
			</button>
			<div class="space-y-2.5 border-t border-border p-3">
				<div class="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
					<div class="relative">
						<input
							type="number"
							min="0"
							bind:value={h}
							class="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-7 font-mono text-[13px] outline-none focus:border-border-strong"
						/>
						<span
							class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[11px] text-text-3"
							>h</span
						>
					</div>
					<div class="relative">
						<input
							type="number"
							min="0"
							max="59"
							bind:value={min}
							class="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-7 font-mono text-[13px] outline-none focus:border-border-strong"
						/>
						<span
							class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[11px] text-text-3"
							>m</span
						>
					</div>
					<input
						type="date"
						bind:value={date}
						class="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[13px] outline-none focus:border-border-strong"
					/>
				</div>
				<textarea
					bind:value={note}
					placeholder={m.tasks_what_did_you_work_on()}
					rows="2"
					class="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-[13px] outline-none placeholder:text-text-3 focus:border-border-strong"
				></textarea>
				<div class="flex items-center justify-end gap-2">
					<Button size="sm" variant="default" onclick={cancel}>{m.common_cancel()}</Button>
					<Button size="sm" variant="primary" onclick={submit}>{m.tasks_log_time()}</Button>
				</div>
			</div>
		</div>
	{/if}
</div>
