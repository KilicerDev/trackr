<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import Icon from '../Icon.svelte';
	import { TODAY } from '$lib/data';

	interface Props {
		value: string | null;
		onchange: (v: string | null) => void;
		onclose: () => void;
	}
	let { value, onchange, onclose }: Props = $props();

	function parseISO(iso: string | null): Date {
		if (iso) {
			const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
			if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
		}
		const t = TODAY.match(/^(\d{4})-(\d{2})-(\d{2})/)!;
		return new Date(parseInt(t[1]), parseInt(t[2]) - 1, parseInt(t[3]));
	}

	function fmtISO(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${dd}`;
	}

	const initialValue = value;
	let cursor = $state(parseISO(initialValue));
	const today = parseISO(TODAY);
	const valueDate = $derived(value ? parseISO(value) : null);

	let title = $derived.by(() => {
		const months = [
			'January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'
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
			cellList.push({ date: new Date(cursor.getFullYear(), cursor.getMonth() - 1, day), current: false });
		}
		for (let d = 1; d <= daysInMonth; d++) {
			cellList.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), d), current: true });
		}
		while (cellList.length < 42) {
			const lastDate = cellList[cellList.length - 1].date;
			cellList.push({ date: new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate() + 1), current: false });
		}
		return cellList;
	});

	function step(delta: number) {
		cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
	}

	function sameDay(a: Date, b: Date) {
		return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
	class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-2.5 w-[268px]"
	style:box-shadow="var(--shadow-lg)"
>
	<div class="flex items-center justify-between px-1 pb-2">
		<button type="button" onclick={() => step(-1)} class="w-6 h-6 grid place-items-center rounded-md text-text-3 hover:text-text hover:bg-surface" aria-label="Previous month">
			<Icon name="chevron-r" size={11} class="rotate-180" />
		</button>
		<span class="text-[12.5px] font-medium">{title}</span>
		<button type="button" onclick={() => step(1)} class="w-6 h-6 grid place-items-center rounded-md text-text-3 hover:text-text hover:bg-surface" aria-label="Next month">
			<Icon name="chevron-r" size={11} />
		</button>
	</div>
	<div class="grid grid-cols-7 gap-px text-center text-[10.5px] uppercase tracking-[0.06em] text-text-4 mb-1">
		{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d, i (i)}
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
				class="aspect-square grid place-items-center rounded-md text-[12px] font-mono transition-colors
				{c.current ? 'text-text-2' : 'text-text-4'}
				{isVal ? 'border border-accent text-accent' : ''}
				{isToday && !isVal ? 'bg-surface text-text' : ''}
				hover:bg-surface-2"
			>
				{c.date.getDate()}
			</button>
		{/each}
	</div>
	<div class="flex items-center gap-1 mt-2 pt-2 border-t border-border">
		<button type="button" onclick={() => quick(0)} class="flex-1 text-[11.5px] px-2 py-1 rounded-md text-text-2 hover:bg-surface hover:text-text">Today</button>
		<button type="button" onclick={() => quick(1)} class="flex-1 text-[11.5px] px-2 py-1 rounded-md text-text-2 hover:bg-surface hover:text-text">Tomorrow</button>
		<button type="button" onclick={() => quick(7)} class="flex-1 text-[11.5px] px-2 py-1 rounded-md text-text-2 hover:bg-surface hover:text-text">+1w</button>
		<button type="button" onclick={() => { onchange(null); onclose(); }} class="text-[11.5px] px-2 py-1 rounded-md text-text-3 hover:bg-surface hover:text-text">Clear</button>
	</div>
</div>
