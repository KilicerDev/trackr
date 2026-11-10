<script lang="ts">
	// "Log time" dropdown for the task panel, built like the other pickers
	// (EstimatePopover): anchored under its trigger, kept in view by autoPlace,
	// closed by an outside click. Quick presets fill the duration; Cancel and
	// Log time are the same size.
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { m } from '$lib/paraglide/messages';
	import Icon from '../Icon.svelte';
	import DatePopover from './DatePopover.svelte';
	import { formatDate } from '$lib/utils/format';

	interface Props {
		onlog: (entry: { h: number; m: number; date: string; note: string }) => void;
		onclose: () => void;
		/** Date the form starts on (My Week passes the day the task was opened from). */
		defaultDate?: string;
	}
	let { onlog, onclose, defaultDate }: Props = $props();

	function todayIso(): string {
		const d = new Date();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${d.getFullYear()}-${mm}-${dd}`;
	}

	let h = $state(0);
	let min = $state(0);
	// Seeded once when the dropdown opens.
	// svelte-ignore state_referenced_locally
	let date = $state(defaultDate ?? todayIso());
	let note = $state('');
	let datePickerOpen = $state(false);

	const PRESETS = [15, 30, 60, 120] as const;
	const presetLabel = (p: number) => (p < 60 ? `${p}m` : `${p / 60}h`);
	const isPreset = (p: number) => h * 60 + min === p;
	function preset(p: number) {
		h = Math.floor(p / 60);
		min = p % 60;
	}

	const canLog = $derived(h * 60 + min > 0);
	function submit() {
		if (!canLog) return;
		onlog({ h, m: min, date, note });
		onclose();
	}

	const INPUT =
		'w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[14px] outline-none focus:border-border-strong';
	const BUTTON =
		'inline-flex h-8 items-center justify-center rounded-lg text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
</script>

<div
	use:clickOutside={onclose}
	use:autoPlace
	in:fly={POPOVER_IN}
	role="dialog"
	aria-label={m.tasks_log_time()}
	class="absolute top-full z-50 mt-1.5 w-[300px] space-y-2 rounded-[10px] border border-border bg-bg-elev p-2.5 shadow-lg"
>
	<div class="grid grid-cols-4 gap-1.5">
		{#each PRESETS as p (p)}
			<button
				type="button"
				onclick={() => preset(p)}
				class="rounded-md border py-1.5 text-[13px] font-medium transition-colors {isPreset(p)
					? 'border-accent/50 bg-accent-soft text-accent'
					: 'border-border bg-surface text-text hover:bg-surface-2'}"
			>
				{presetLabel(p)}
			</button>
		{/each}
	</div>

	<div class="grid grid-cols-2 gap-2">
		<div class="relative">
			<input type="number" min="0" bind:value={h} aria-label="h" class="{INPUT} pr-7" />
			<span
				class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[12px] text-text-3"
				>h</span
			>
		</div>
		<div class="relative">
			<input type="number" min="0" max="59" bind:value={min} aria-label="m" class="{INPUT} pr-7" />
			<span
				class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[12px] text-text-3"
				>m</span
			>
		</div>
	</div>

	<!-- The app's own date picker, not <input type="date">: the browser field
	     shows dates in the OS locale (mm/dd/yyyy on a US system). -->
	<div class="relative">
		<button
			type="button"
			onclick={() => (datePickerOpen = !datePickerOpen)}
			aria-expanded={datePickerOpen}
			class="{INPUT} flex items-center justify-between text-left hover:border-border-strong"
		>
			<span>{formatDate(date)}</span>
			<Icon name="calendar" size={14} class="text-text-3" />
		</button>
		{#if datePickerOpen}
			<DatePopover
				value={date}
				onchange={(v) => {
					if (v) date = v;
				}}
				onclose={() => (datePickerOpen = false)}
			/>
		{/if}
	</div>

	<textarea
		bind:value={note}
		placeholder={m.tasks_what_did_you_work_on()}
		rows="2"
		class="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-[14px] outline-none placeholder:text-text-3 focus:border-border-strong"
	></textarea>

	<!-- Equal columns, so Cancel and Log time are exactly the same size. -->
	<div class="grid grid-cols-2 gap-2 pt-0.5">
		<button
			type="button"
			onclick={onclose}
			class="{BUTTON} border border-border bg-surface text-text hover:bg-surface-2"
		>
			{m.common_cancel()}
		</button>
		<button
			type="button"
			onclick={submit}
			disabled={!canLog}
			class="{BUTTON} border border-transparent bg-accent text-white shadow-btn hover:bg-accent-strong"
		>
			{m.tasks_log_time()}
		</button>
	</div>
</div>
