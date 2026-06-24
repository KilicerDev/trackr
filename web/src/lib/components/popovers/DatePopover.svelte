<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import Icon from '../Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		value: string | null;
		onchange: (v: string | null) => void;
		onclose: () => void;
		/** When set, an extra footer button appears with this label.
		 *  Pressing it invokes `onundated()` and closes the popover. */
		undatedLabel?: string;
		onundated?: () => void;
		undatedActive?: boolean;
	}
	let {
		value,
		onchange,
		onclose,
		undatedLabel,
		onundated,
		undatedActive = false
	}: Props = $props();

	function todayLocal(): Date {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), now.getDate());
	}

	function parseISO(iso: string | null): Date {
		if (iso) {
			const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
			if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
		}
		return todayLocal();
	}

	function fmtISO(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${dd}`;
	}

	const initialValue = value;
	let cursor = $state(parseISO(initialValue));
	const today = todayLocal();
	const valueDate = $derived(value ? parseISO(value) : null);

	let title = $derived.by(() => {
		const months = [
			m.tasks_month_january(),
			m.tasks_month_february(),
			m.tasks_month_march(),
			m.tasks_month_april(),
			m.tasks_month_may(),
			m.tasks_month_june(),
			m.tasks_month_july(),
			m.tasks_month_august(),
			m.tasks_month_september(),
			m.tasks_month_october(),
			m.tasks_month_november(),
			m.tasks_month_december()
		];
		return `${months[cursor.getMonth()]} ${cursor.getFullYear()}`;
	});

	let cells = $derived.by(() => {
		const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
		const startWeekday = (first.getDay() + 6) % 7; // Monday=0
		const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
		const daysInPrev = new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate();
		const cellList: { date: Date; current: boolean }[] = [];
		for (let i = 0; i < startWeekday; i++) {
			const day = daysInPrev - startWeekday + 1 + i;
			cellList.push({
				date: new Date(cursor.getFullYear(), cursor.getMonth() - 1, day),
				current: false
			});
		}
		for (let d = 1; d <= daysInMonth; d++) {
			cellList.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), d), current: true });
		}
		while (cellList.length < 42) {
			const lastDate = cellList[cellList.length - 1].date;
			cellList.push({
				date: new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate() + 1),
				current: false
			});
		}
		return cellList;
	});

	function step(delta: number) {
		cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
	}

	function sameDay(a: Date, b: Date) {
		return (
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate()
		);
	}

	function pick(d: Date) {
		onchange(fmtISO(d));
		onclose();
	}

	function quick(deltaDays: number) {
		const d = new Date(today);
		d.setDate(d.getDate() + deltaDays);
		onchange(fmtISO(d));
		onclose();
	}
</script>

<div
	use:clickOutside={onclose}
	use:autoPlace
	in:fly={POPOVER_IN}
	class="absolute top-full z-50 mt-1.5 w-[268px] rounded-[10px] border border-border bg-bg-elev p-2.5"
	style:box-shadow="var(--shadow-lg)"
>
	<div class="flex items-center justify-between px-1 pb-2">
		<button
			type="button"
			onclick={() => step(-1)}
			class="grid h-6 w-6 place-items-center rounded-md text-text-3 hover:bg-surface hover:text-text"
			aria-label={m.tasks_previous_month()}
		>
			<Icon name="chevron-r" size={11} class="rotate-180" />
		</button>
		<span class="text-[12.5px] font-medium">{title}</span>
		<button
			type="button"
			onclick={() => step(1)}
			class="grid h-6 w-6 place-items-center rounded-md text-text-3 hover:bg-surface hover:text-text"
			aria-label={m.tasks_next_month()}
		>
			<Icon name="chevron-r" size={11} />
		</button>
	</div>
	<div
		class="mb-1 grid grid-cols-7 gap-px text-center text-[10.5px] tracking-[0.06em] text-text-4 uppercase"
	>
		{#each [m.tasks_weekday_mon(), m.tasks_weekday_tue(), m.tasks_weekday_wed(), m.tasks_weekday_thu(), m.tasks_weekday_fri(), m.tasks_weekday_sat(), m.tasks_weekday_sun()] as d, i (i)}
			<span>{d}</span>
		{/each}
	</div>
	<div class="grid grid-cols-7 gap-px">
		{#each cells as c, i (i)}
			{@const isToday = sameDay(c.date, today)}
			{@const isVal = valueDate && sameDay(c.date, valueDate)}
			<button
				type="button"
				onclick={() => pick(c.date)}
				class="grid aspect-square place-items-center rounded-md font-mono text-[12px] transition-colors
				{c.current ? 'text-text-2' : 'text-text-4'}
				{isVal ? 'border border-accent text-accent' : ''}
				{isToday && !isVal ? 'bg-accent-soft font-medium text-accent' : ''}
				hover:bg-surface-2"
			>
				{c.date.getDate()}
			</button>
		{/each}
	</div>
	<div class="mt-2 flex items-center gap-1 border-t border-border pt-2">
		<button
			type="button"
			onclick={() => quick(0)}
			class="flex-1 rounded-md px-2 py-1 text-[11.5px] text-text-2 hover:bg-surface hover:text-text"
			>{m.common_today()}</button
		>
		<button
			type="button"
			onclick={() => quick(1)}
			class="flex-1 rounded-md px-2 py-1 text-[11.5px] text-text-2 hover:bg-surface hover:text-text"
			>{m.tasks_tomorrow()}</button
		>
		<button
			type="button"
			onclick={() => quick(7)}
			class="flex-1 rounded-md px-2 py-1 text-[11.5px] text-text-2 hover:bg-surface hover:text-text"
			>{m.tasks_plus_one_week()}</button
		>
		<button
			type="button"
			onclick={() => {
				onchange(null);
				onclose();
			}}
			class="rounded-md px-2 py-1 text-[11.5px] text-text-3 hover:bg-surface hover:text-text"
			>{m.tasks_clear()}</button
		>
	</div>
	{#if undatedLabel && onundated}
		<button
			type="button"
			onclick={() => {
				onundated();
				onclose();
			}}
			class="mt-1.5 w-full rounded-md px-2 py-1.5 text-[11.5px] transition-colors {undatedActive
				? 'bg-accent-soft text-accent'
				: 'text-text-2 hover:bg-surface hover:text-text'}"
			style:background={undatedActive ? 'rgba(239,122,109,0.14)' : ''}
		>
			{undatedLabel}
		</button>
	{/if}
</div>
