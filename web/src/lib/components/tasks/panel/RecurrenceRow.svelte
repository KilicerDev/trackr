<script lang="ts">
	// The inspector's "Repeat" property: shows the task's recurring series and
	// edits it in a popover. Talks to /api/tasks/[uuid]/recurrence directly —
	// the series is its own record (a saved template + schedule), not a task
	// field, so it doesn't go through the inspector's task update action.
	//
	// The editor reads like the panel itself: a frequency switch, then label /
	// value rows whose values open the app's own pickers (DatePopover, menus),
	// and a live preview of the next dates.
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { getLocale } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
	import { showToast } from '$lib/stores/toast.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { formatDateLong } from '$lib/utils/format';
	import {
		formatDate,
		upcomingOccurrences,
		type RecurrenceFreq,
		type RecurrenceSchedule,
		type RecurrenceSeriesDTO
	} from '$lib/recurrence';
	import Icon from '../../Icon.svelte';
	import Button from '../../Button.svelte';
	import PopItem from '../../PopItem.svelte';
	import DatePopover from '../../popovers/DatePopover.svelte';
	import PropertyRow from './PropertyRow.svelte';
	import { OPEN, PROP_VALUE } from './styles';

	interface Props {
		/** Task uuid. */
		taskUuid: string;
		/** The task's due date, to default "due the day it's created" on setup. */
		taskDue: string | null;
		canEdit: boolean;
		open: boolean;
		ontoggle: () => void;
		onclose: () => void;
	}
	let { taskUuid, taskDue, canEdit, open, ontoggle, onclose }: Props = $props();

	let series = $state<RecurrenceSeriesDTO | null>(null);
	let busy = $state(false);

	async function load(uuid: string) {
		try {
			const res = await fetch(`/api/tasks/${uuid}/recurrence`);
			if (!res.ok) return;
			const data = (await res.json()) as { series: RecurrenceSeriesDTO | null };
			if (uuid === taskUuid) series = data.series;
		} catch {
			/* non-fatal: the row just reads "doesn't repeat" */
		}
	}
	$effect(() => {
		series = null;
		void load(taskUuid);
	});

	// ── Labels ────────────────────────────────────────────────────────────────
	const FREQS: RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
	const FREQ_LABEL: Record<RecurrenceFreq, () => string> = {
		daily: m.tasks_repeat_daily,
		weekly: m.tasks_repeat_weekly,
		monthly: m.tasks_repeat_monthly,
		yearly: m.tasks_repeat_yearly
	};
	const UNIT_LABEL: Record<RecurrenceFreq, () => string> = {
		daily: m.tasks_repeat_unit_days,
		weekly: m.tasks_repeat_unit_weeks,
		monthly: m.tasks_repeat_unit_months,
		yearly: m.tasks_repeat_unit_years
	};
	// ISO weekday 1..7, Monday first (same short names as the date picker).
	const WEEKDAYS: [number, () => string][] = [
		[1, m.tasks_weekday_mon],
		[2, m.tasks_weekday_tue],
		[3, m.tasks_weekday_wed],
		[4, m.tasks_weekday_thu],
		[5, m.tasks_weekday_fri],
		[6, m.tasks_weekday_sat],
		[7, m.tasks_weekday_sun]
	];
	const weekdayLabel = (iso: number) => WEEKDAYS[iso - 1][1]();

	const isoWeekdayOf = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
	const dayMonth = (date: string) =>
		new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
			new Date(`${date}T00:00:00Z`)
		);
	const shortDate = (date: string) =>
		new Intl.DateTimeFormat(getLocale(), {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		}).format(new Date(`${date}T00:00:00Z`));

	function describe(s: RecurrenceSchedule): string {
		const r = s.rule;
		const parts = [
			r.interval > 1
				? m.tasks_repeat_every_n({ n: String(r.interval), unit: UNIT_LABEL[r.freq]() })
				: FREQ_LABEL[r.freq]()
		];
		if (r.freq === 'weekly') {
			const days = r.weekdays?.length ? r.weekdays : [isoWeekdayOf(s.startsOn)];
			parts.push(days.map(weekdayLabel).join(', '));
		}
		if (r.freq === 'monthly') {
			parts.push(m.tasks_repeat_on_day({ day: String(r.monthDay ?? Number(s.startsOn.slice(8))) }));
		}
		if (r.freq === 'yearly') parts.push(dayMonth(s.startsOn));
		return parts.join(' · ');
	}

	const DUE_CHOICES = ['none', '0', '1', '2', '3', '5', '7', '14'];
	function dueLabel(v: string): string {
		if (v === 'none') return m.tasks_repeat_due_none();
		if (v === '0') return m.tasks_repeat_due_same();
		return m.tasks_repeat_due_after({ n: v });
	}

	// ── Editor state ──────────────────────────────────────────────────────────
	const today = () => {
		const d = new Date();
		return formatDate(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
	};

	let freq = $state<RecurrenceFreq>('weekly');
	let interval = $state(1);
	let weekdays = $state<number[]>([]);
	let monthDay = $state(1);
	// No time field yet: copies are created at the series' stored time (09:00
	// by default, kept from an existing series). The API and the runner
	// already honour it, for when timing starts to matter.
	let time = $state('09:00');
	let startsOn = $state('');
	let endsOn = $state<string | null>(null);
	let dueOffset = $state('none');
	let refreshTemplate = $state(false);
	/** Which inner picker is open. */
	let sub = $state<'starts' | 'ends' | 'due' | 'day' | 'menu' | null>(null);

	// Seed the editor whenever it opens.
	$effect(() => {
		if (!open) return;
		const s = series?.schedule;
		const start = s?.startsOn ?? today();
		freq = s?.rule.freq ?? 'weekly';
		interval = s?.rule.interval ?? 1;
		weekdays = s?.rule.weekdays ?? [isoWeekdayOf(start)];
		monthDay = s?.rule.monthDay ?? Number(start.slice(8));
		time = s?.time ?? '09:00';
		startsOn = start;
		endsOn = s?.endsOn ?? null;
		dueOffset = series
			? series.dueOffsetDays === null
				? 'none'
				: String(series.dueOffsetDays)
			: taskDue
				? '0'
				: 'none';
		refreshTemplate = false;
		sub = null;
	});

	const timezone = $derived(
		series?.schedule.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
	);

	const draftSchedule = $derived<RecurrenceSchedule>({
		rule: {
			freq,
			interval,
			...(freq === 'weekly' ? { weekdays: [...weekdays].sort((a, b) => a - b) } : {}),
			...(freq === 'monthly' ? { monthDay } : {})
		},
		time,
		timezone,
		startsOn,
		endsOn
	});

	const preview = $derived.by(() => {
		if (!startsOn) return [];
		// Mirrors the server: the task you're on covers today.
		const now = new Date();
		const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - 1;
		return upcomingOccurrences(draftSchedule, new Date(endOfToday), 3);
	});

	const MAX_INTERVAL: Record<RecurrenceFreq, number> = {
		daily: 365,
		weekly: 52,
		monthly: 24,
		yearly: 10
	};
	function stepInterval(delta: number) {
		interval = Math.min(MAX_INTERVAL[freq], Math.max(1, interval + delta));
	}
	function setFreq(f: RecurrenceFreq) {
		freq = f;
		interval = Math.min(interval, MAX_INTERVAL[f]);
		sub = null;
	}

	// A weekly rule always keeps at least one day.
	function toggleWeekday(d: number) {
		if (weekdays.includes(d)) {
			if (weekdays.length > 1) weekdays = weekdays.filter((x) => x !== d);
		} else {
			weekdays = [...weekdays, d];
		}
	}

	function toggleSub(id: NonNullable<typeof sub>) {
		sub = sub === id ? null : id;
	}

	// ── Persistence ───────────────────────────────────────────────────────────
	async function call(method: string, body?: unknown): Promise<boolean> {
		busy = true;
		try {
			const res = await fetch(`/api/tasks/${taskUuid}/recurrence`, {
				method,
				headers: body ? { 'content-type': 'application/json' } : undefined,
				body: body ? JSON.stringify(body) : undefined
			});
			if (!res.ok) {
				const msg = (await res.json().catch(() => null))?.message;
				showToast('err', msg ?? m.tasks_repeat_save_failed());
				return false;
			}
			series = ((await res.json()) as { series: RecurrenceSeriesDTO | null }).series;
			return true;
		} catch {
			showToast('err', m.tasks_repeat_save_failed());
			return false;
		} finally {
			busy = false;
		}
	}

	async function save() {
		const ok = await call('PUT', {
			schedule: draftSchedule,
			dueOffsetDays: dueOffset === 'none' ? null : Number(dueOffset),
			refreshTemplate
		});
		if (ok) {
			showToast('ok', m.tasks_repeat_saved());
			onclose();
		}
	}

	async function setPaused(paused: boolean) {
		await call('PATCH', { paused });
	}

	async function stop() {
		const yes = await confirm({
			title: m.tasks_repeat_stop_confirm_title(),
			message: m.tasks_repeat_stop_confirm_message(),
			confirmLabel: m.tasks_repeat_stop(),
			cancelLabel: m.common_cancel(),
			tone: 'danger',
			icon: 'repeat'
		});
		if (yes && (await call('DELETE'))) onclose();
	}

	const PAUSE_REASON: Record<string, () => string> = {
		owner_missing: m.tasks_repeat_paused_owner_missing,
		no_permission: m.tasks_repeat_paused_no_permission,
		project_archived: m.tasks_repeat_paused_project_archived
	};

	// Label / value row inside the editor (narrower label than the panel's).
	const ROW = 'grid min-h-8 grid-cols-[76px_minmax(0,1fr)] items-center gap-2';
	const ROW_LABEL = 'text-[13px] text-text-3';
	const MENU =
		'absolute top-full left-0 z-50 mt-1.5 w-[230px] rounded-[10px] border border-border bg-bg-elev p-1.5 text-[13px] shadow-lg';
</script>

<PropertyRow label={m.tasks_panel_repeat()}>
	<button
		type="button"
		onclick={ontoggle}
		disabled={!canEdit && !series}
		class="{PROP_VALUE} {open ? OPEN : ''}"
	>
		{#if series}
			<Icon name="repeat" size={14} class={series.paused ? 'text-text-3' : 'text-accent'} />
			<span class="truncate {series.paused || !series.nextRunAt ? 'text-text-3' : ''}">
				{describe(series.schedule)}
			</span>
			{#if series.paused}
				<span class="shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-text-3">
					{m.tasks_repeat_paused()}
				</span>
			{:else if !series.nextRunAt}
				<span class="shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-text-3">
					{m.tasks_repeat_ended()}
				</span>
			{/if}
		{:else}
			<span class="text-text-3">{m.tasks_repeat_none()}</span>
		{/if}
	</button>

	{#if open}
		<div
			use:clickOutside={onclose}
			use:autoPlace
			in:fly={POPOVER_IN}
			class="absolute top-full z-40 mt-1.5 w-[336px] rounded-[12px] border border-border bg-bg-elev shadow-lg"
		>
			<!-- Header: what you're building, in words. -->
			<div class="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5">
				<span
					class="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"
				>
					<Icon name="repeat" size={14} />
				</span>
				<div class="min-w-0 flex-1">
					<div class="text-[13px] font-medium text-text">{m.tasks_panel_repeat()}</div>
					<div class="truncate text-[12px] text-text-3">
						{startsOn ? describe(draftSchedule) : ''}
					</div>
				</div>
				<!-- Series actions live here, not in the footer, so the footer is
				     only the save decision. -->
				{#if series && canEdit}
					<div class="relative shrink-0">
						<button
							type="button"
							onclick={() => toggleSub('menu')}
							disabled={busy}
							aria-label={m.tasks_repeat_actions()}
							class="grid h-7 w-7 place-items-center rounded-md text-text-3 transition-colors hover:bg-surface hover:text-text {sub ===
							'menu'
								? 'bg-surface text-text'
								: ''}"
						>
							<Icon name="more" size={15} />
						</button>
						{#if sub === 'menu'}
							<div
								use:clickOutside={() => (sub = null)}
								use:autoPlace={{ align: 'right' }}
								in:fly={POPOVER_IN}
								class="absolute top-full right-0 z-50 mt-1.5 w-[200px] rounded-[10px] border border-border bg-bg-elev p-1.5 text-[13px] shadow-lg"
							>
								<button
									type="button"
									onclick={() => {
										sub = null;
										void setPaused(!series?.paused);
									}}
									class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
								>
									<Icon name={series.paused ? 'play' : 'pause'} size={14} class="text-text-3" />
									{series.paused ? m.tasks_repeat_resume() : m.tasks_repeat_pause()}
								</button>
								<button
									type="button"
									onclick={() => {
										sub = null;
										void stop();
									}}
									class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-prio-urgent transition-colors hover:bg-surface-2"
								>
									<Icon name="trash" size={14} />
									{m.tasks_repeat_stop()}
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			{#if series?.paused && series.pausedReason && PAUSE_REASON[series.pausedReason]}
				<div
					class="mx-3.5 mb-2.5 flex gap-2 rounded-lg bg-surface px-2.5 py-2 text-[12px] leading-snug text-text-2"
				>
					<Icon name="pause" size={13} class="mt-px shrink-0 text-text-3" />
					<span>{PAUSE_REASON[series.pausedReason]()}</span>
				</div>
			{/if}

			<fieldset disabled={!canEdit || busy} class="flex flex-col gap-3 px-3.5 pb-3">
				<!-- Frequency -->
				<div class="grid grid-cols-4 gap-0.5 rounded-lg bg-surface p-0.5" role="radiogroup">
					{#each FREQS as f (f)}
						<button
							type="button"
							role="radio"
							aria-checked={freq === f}
							onclick={() => setFreq(f)}
							class="h-7 rounded-md text-[12px] font-medium transition-colors {freq === f
								? 'bg-bg-elev text-text shadow-sm'
								: 'text-text-3 hover:text-text'}"
						>
							{FREQ_LABEL[f]()}
						</button>
					{/each}
				</div>

				<div class="flex flex-col gap-0.5">
					<!-- Every n units -->
					<div class={ROW}>
						<span class={ROW_LABEL}>{m.tasks_repeat_every()}</span>
						<div class="flex items-center gap-2">
							<div class="inline-flex h-7 items-center rounded-lg border border-border bg-surface">
								<button
									type="button"
									onclick={() => stepInterval(-1)}
									disabled={interval <= 1}
									aria-label="−1"
									class="grid h-full w-7 place-items-center rounded-l-lg text-text-3 transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-40 disabled:hover:bg-transparent"
								>
									<Icon name="minus" size={12} />
								</button>
								<span class="min-w-7 text-center font-mono text-[13px] text-text tabular-nums">
									{interval}
								</span>
								<button
									type="button"
									onclick={() => stepInterval(1)}
									disabled={interval >= MAX_INTERVAL[freq]}
									aria-label="+1"
									class="grid h-full w-7 place-items-center rounded-r-lg text-text-3 transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-40 disabled:hover:bg-transparent"
								>
									<Icon name="plus" size={12} />
								</button>
							</div>
							<span class="text-[13px] text-text-2">{UNIT_LABEL[freq]()}</span>
						</div>
					</div>

					<!-- On: weekdays / day of month / date -->
					{#if freq === 'weekly'}
						<div class={ROW}>
							<span class={ROW_LABEL}>{m.tasks_repeat_on()}</span>
							<div class="grid grid-cols-7 gap-1">
								{#each WEEKDAYS as [d, label] (d)}
									{@const on = weekdays.includes(d)}
									<button
										type="button"
										aria-pressed={on}
										onclick={() => toggleWeekday(d)}
										class="h-7 rounded-md text-[11px] font-medium transition-colors {on
											? 'bg-accent text-white hover:bg-accent-strong'
											: 'bg-surface text-text-3 hover:bg-surface-2 hover:text-text'}"
									>
										{label().slice(0, 2)}
									</button>
								{/each}
							</div>
						</div>
					{:else if freq === 'monthly'}
						<div class={ROW}>
							<span class={ROW_LABEL}>{m.tasks_repeat_on()}</span>
							<div class="relative min-w-0">
								<button
									type="button"
									onclick={() => toggleSub('day')}
									class="{PROP_VALUE} {sub === 'day' ? OPEN : ''}"
								>
									{m.tasks_repeat_on_day({ day: String(monthDay) })}
									<Icon name="chevron" size={12} class="text-text-3" />
								</button>
								{#if sub === 'day'}
									<div
										use:clickOutside={() => (sub = null)}
										use:autoPlace
										in:fly={POPOVER_IN}
										class="{MENU} w-[236px] p-2"
									>
										<div class="grid grid-cols-7 gap-px">
											{#each Array.from({ length: 31 }, (_, i) => i + 1) as d (d)}
												<button
													type="button"
													onclick={() => {
														monthDay = d;
														sub = null;
													}}
													class="grid aspect-square place-items-center rounded-md font-mono text-[12px] transition-colors {monthDay ===
													d
														? 'bg-accent font-medium text-white'
														: 'text-text-2 hover:bg-surface-2'}"
												>
													{d}
												</button>
											{/each}
										</div>
										<p
											class="mt-2 border-t border-border px-1 pt-2 text-[11px] leading-snug text-text-3"
										>
											{m.tasks_repeat_month_day_hint()}
										</p>
									</div>
								{/if}
							</div>
						</div>
					{:else if freq === 'yearly'}
						<div class={ROW}>
							<span class={ROW_LABEL}>{m.tasks_repeat_on()}</span>
							<span class="text-[13px] text-text-2">{startsOn ? dayMonth(startsOn) : ''}</span>
						</div>
					{/if}

					<div class="my-1.5 h-px bg-border"></div>

					<!-- Starts -->
					<div class={ROW}>
						<span class={ROW_LABEL}>{m.tasks_repeat_starts()}</span>
						<div class="relative min-w-0">
							<button
								type="button"
								onclick={() => toggleSub('starts')}
								class="{PROP_VALUE} {sub === 'starts' ? OPEN : ''}"
							>
								<Icon name="calendar" size={13} class="text-text-3" />
								{startsOn === today() ? m.common_today() : formatDateLong(startsOn)}
							</button>
							{#if sub === 'starts'}
								<DatePopover
									value={startsOn}
									onchange={(v) => {
										if (!v) return;
										startsOn = v;
										if (endsOn && endsOn < v) endsOn = null;
										if (freq === 'monthly') monthDay = Number(v.slice(8));
									}}
									onclose={() => (sub = null)}
								/>
							{/if}
						</div>
					</div>

					<!-- Ends -->
					<div class={ROW}>
						<span class={ROW_LABEL}>{m.tasks_repeat_ends()}</span>
						<div class="relative min-w-0">
							<button
								type="button"
								onclick={() => toggleSub('ends')}
								class="{PROP_VALUE} {sub === 'ends' ? OPEN : ''}"
							>
								<Icon name="calendar" size={13} class="text-text-3" />
								{#if endsOn}
									{formatDateLong(endsOn)}
								{:else}
									<span class="text-text-3">{m.tasks_repeat_never()}</span>
								{/if}
							</button>
							{#if sub === 'ends'}
								<DatePopover
									value={endsOn}
									onchange={(v) => (endsOn = v && v < startsOn ? startsOn : v)}
									onclose={() => (sub = null)}
								/>
							{/if}
						</div>
					</div>

					<!-- Due -->
					<div class={ROW}>
						<span class={ROW_LABEL}>{m.tasks_repeat_due_label()}</span>
						<div class="relative min-w-0">
							<button
								type="button"
								onclick={() => toggleSub('due')}
								class="{PROP_VALUE} {sub === 'due' ? OPEN : ''}"
							>
								<span class="truncate {dueOffset === 'none' ? 'text-text-3' : ''}">
									{dueLabel(dueOffset)}
								</span>
								<Icon name="chevron" size={12} class="shrink-0 text-text-3" />
							</button>
							{#if sub === 'due'}
								<div
									use:clickOutside={() => (sub = null)}
									use:autoPlace
									in:fly={POPOVER_IN}
									class={MENU}
								>
									<div class="px-2 pt-1 pb-1.5 text-[11px] text-text-3">
										{m.tasks_repeat_due()}
									</div>
									{#each DUE_CHOICES as v (v)}
										<PopItem
											selected={dueOffset === v}
											onclick={() => {
												dueOffset = v;
												sub = null;
											}}
										>
											{dueLabel(v)}
										</PopItem>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Next dates -->
				<div class="rounded-lg bg-surface px-2.5 py-2">
					<div class="mb-1.5 text-[11px] font-medium tracking-[0.06em] text-text-4 uppercase">
						{m.tasks_repeat_next()}
					</div>
					{#if preview.length}
						<div class="flex flex-wrap gap-1.5">
							{#each preview as p, i (p.date)}
								<span
									class="rounded-md px-1.5 py-0.5 text-[12px] {i === 0
										? 'bg-accent-soft font-medium text-accent'
										: 'bg-bg-elev text-text-2'}"
								>
									{shortDate(p.date)}
								</span>
							{/each}
						</div>
					{:else}
						<p class="text-[12px] text-text-3">{m.tasks_repeat_no_more()}</p>
					{/if}
				</div>

				<!-- Template: a switch row for an existing series, a quiet note on setup. -->
				{#if series}
					<label
						class="flex cursor-pointer items-center gap-3 rounded-lg border px-2.5 py-2 transition-colors {refreshTemplate
							? 'border-accent/40 bg-accent/5'
							: 'border-border hover:bg-surface'}"
					>
						<span class="min-w-0 flex-1">
							<span class="block text-[13px] text-text">{m.tasks_repeat_refresh_template()}</span>
							<span class="mt-0.5 block text-[12px] leading-snug text-text-3">
								{m.tasks_repeat_refresh_template_hint()}
							</span>
						</span>
						<input type="checkbox" bind:checked={refreshTemplate} class="sr-only" />
						<span
							aria-hidden="true"
							class="relative h-5 w-9 shrink-0 rounded-full border transition-colors {refreshTemplate
								? 'border-accent bg-accent'
								: 'border-border bg-surface-2'}"
						>
							<span
								class="absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full transition-transform {refreshTemplate
									? 'translate-x-4 bg-white'
									: 'translate-x-0 bg-text-2'}"
							></span>
						</span>
					</label>
				{:else}
					<p class="flex gap-2 text-[12px] leading-snug text-text-3">
						<Icon name="copy" size={13} class="mt-px shrink-0" />
						<span>{m.tasks_repeat_template_hint()}</span>
					</p>
				{/if}
			</fieldset>

			{#if canEdit}
				<div class="flex items-center justify-end gap-1.5 border-t border-border px-3 py-2.5">
					<Button size="sm" variant="ghost" onclick={onclose}>{m.common_cancel()}</Button>
					<Button size="sm" variant="primary" disabled={busy || !startsOn} onclick={save}>
						{m.common_save()}
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</PropertyRow>
