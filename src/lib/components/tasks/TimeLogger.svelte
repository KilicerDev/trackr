<script lang="ts">
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { formatEstimate } from '$lib/data';

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
	let m = $state(0);
	let date = $state(todayIso());
	let note = $state('');

	let totalLogged = $derived(
		(task.timeLogs ?? []).reduce((s, t) => s + t.minutes, 0)
	);
	let summary = $derived.by(() => {
		if (totalLogged === 0 && !task.estimate) return 'None logged';
		if (totalLogged === 0) return `0 / ${formatEstimate(task.estimate)}`;
		if (!task.estimate) return `${formatEstimate(totalLogged)} logged`;
		return `${formatEstimate(totalLogged)} / ${formatEstimate(task.estimate)}`;
	});

	function cancel() {
		open = false;
		h = 0;
		m = 0;
		note = '';
	}
	function submit() {
		if (h === 0 && m === 0) return;
		onlog?.({ h, m, date, note });
		cancel();
	}
</script>

<div class="relative">
	<!-- Trigger row: always in flow, fixed height -->
	<button
		type="button"
		onclick={() => (open = !open)}
		class="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border border-border bg-surface/40 hover:bg-surface text-left transition-colors {open ? 'invisible' : ''}"
	>
		<span class="w-7 h-7 rounded-md grid place-items-center bg-bg-elev border border-border text-text-3">
			<Icon name="calendar" size={13} />
		</span>
		<span class="text-[13px] font-medium text-text">Log time</span>
		<span class="ml-auto text-[11.5px] text-text-3 font-mono">{summary}</span>
		<span class="text-text-3">
			<Icon name="chevron" size={11} />
		</span>
	</button>

	{#if open}
		<!-- Expanded panel: floats over the elements below -->
		<div
			use:clickOutside={cancel}
			class="absolute inset-x-0 top-0 z-30 rounded-xl border border-border bg-bg-elev overflow-hidden"
			style:box-shadow="var(--shadow-lg)"
		>
			<button
				type="button"
				onclick={() => (open = false)}
				class="flex items-center gap-2 w-full px-3 py-2.5 text-left"
			>
				<span class="w-7 h-7 rounded-md grid place-items-center bg-surface border border-border text-text-3">
					<Icon name="calendar" size={13} />
				</span>
				<span class="text-[13px] font-medium text-text">Log time</span>
				<span class="ml-auto text-[11.5px] text-text-3 font-mono">{summary}</span>
				<span class="text-text-3 rotate-180">
					<Icon name="chevron" size={11} />
				</span>
			</button>
			<div class="border-t border-border p-3 space-y-2.5">
				<div class="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
					<div class="relative">
						<input
							type="number"
							min="0"
							bind:value={h}
							class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] font-mono outline-none focus:border-border-strong pr-7"
						/>
						<span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11.5px] text-text-3 font-mono pointer-events-none">h</span>
					</div>
					<div class="relative">
						<input
							type="number"
							min="0"
							max="59"
							bind:value={m}
							class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] font-mono outline-none focus:border-border-strong pr-7"
						/>
						<span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11.5px] text-text-3 font-mono pointer-events-none">m</span>
					</div>
					<input
						type="date"
						bind:value={date}
						class="bg-surface border border-border rounded-lg px-3 py-2 text-[13px] font-mono outline-none focus:border-border-strong"
					/>
				</div>
				<textarea
					bind:value={note}
					placeholder="What did you work on?"
					rows="2"
					class="w-full resize-none bg-surface border border-border rounded-lg px-3 py-2 text-[13px] placeholder:text-text-3 outline-none focus:border-border-strong"
				></textarea>
				<div class="flex items-center justify-end gap-2">
					<Button size="sm" variant="default" onclick={cancel}>Cancel</Button>
					<Button size="sm" variant="primary" onclick={submit}>Log time</Button>
				</div>
			</div>
		</div>
	{/if}
</div>
