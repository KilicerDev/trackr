<script lang="ts" module>
	export type PickerOption = {
		value: string;
		label: string;
		description?: string;
		/** Secondary text shown after the label (e.g. an org key). */
		hint?: string;
		group?: string;
		/** Render the label in the mono face (event names, keys). */
		mono?: boolean;
	};
	export type PickerGroup = { id: string; label: string; note?: string };
</script>

<script lang="ts">
	// Searchable dropdown picker, single or multi. The panel is position:fixed
	// and measured from the trigger, so it works inside scrolling containers
	// (modals) that would clip an absolutely positioned popover. Selected values
	// are also emitted as hidden inputs when `name` is set, for form actions.
	import { fly } from 'svelte/transition';
	import { tick } from 'svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { POPOVER_IN } from '$lib/config/motion';
	import { m } from '$lib/paraglide/messages';
	import Icon from './Icon.svelte';

	interface Props {
		options: PickerOption[];
		groups?: PickerGroup[];
		value: string[];
		multiple?: boolean;
		name?: string;
		placeholder: string;
		searchPlaceholder?: string;
		ariaLabel?: string;
		/** Show selected values as removable chips in the trigger (multi only). */
		chips?: boolean;
		onchange?: (value: string[]) => void;
	}
	let {
		options,
		groups = [],
		value = $bindable([]),
		multiple = false,
		name,
		placeholder,
		searchPlaceholder,
		ariaLabel,
		chips = true,
		onchange
	}: Props = $props();

	let open = $state(false);
	let q = $state('');
	let active = $state(0);
	let trigger = $state<HTMLButtonElement>();
	let search = $state<HTMLInputElement>();
	let pos = $state({ top: 0, left: 0, width: 320, up: false, maxHeight: 360 });

	const byValue = $derived(new Map(options.map((o) => [o.value, o])));
	const selected = $derived(value.map((v) => byValue.get(v)).filter((o): o is PickerOption => !!o));

	const filtered = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		if (!needle) return options;
		return options.filter(
			(o) =>
				o.label.toLowerCase().includes(needle) ||
				o.value.toLowerCase().includes(needle) ||
				(o.description?.toLowerCase().includes(needle) ?? false) ||
				(o.hint?.toLowerCase().includes(needle) ?? false)
		);
	});

	// Grouped view: keeps group order from `groups`, ungrouped options last.
	const sections = $derived.by(() => {
		const out: { group: PickerGroup | null; items: PickerOption[] }[] = [];
		for (const g of groups) {
			const items = filtered.filter((o) => o.group === g.id);
			if (items.length) out.push({ group: g, items });
		}
		const rest = filtered.filter((o) => !o.group || !groups.some((g) => g.id === o.group));
		if (rest.length) out.push({ group: null, items: rest });
		return out;
	});
	const flat = $derived(sections.flatMap((s) => s.items));

	function has(v: string) {
		return value.includes(v);
	}
	function commit(next: string[]) {
		value = next;
		onchange?.(next);
	}
	function toggle(v: string) {
		if (!multiple) {
			commit(has(v) ? [] : [v]);
			open = false;
			return;
		}
		commit(has(v) ? value.filter((x) => x !== v) : [...value, v]);
	}
	function groupState(g: PickerGroup): 'none' | 'some' | 'all' {
		const ids = options.filter((o) => o.group === g.id).map((o) => o.value);
		const n = ids.filter((id) => value.includes(id)).length;
		return n === 0 ? 'none' : n === ids.length ? 'all' : 'some';
	}
	function toggleGroup(g: PickerGroup) {
		const ids = options.filter((o) => o.group === g.id).map((o) => o.value);
		if (groupState(g) === 'all') commit(value.filter((v) => !ids.includes(v)));
		else commit([...new Set([...value, ...ids])]);
	}
	function clear() {
		commit([]);
	}

	function place() {
		if (!trigger) return;
		const r = trigger.getBoundingClientRect();
		const gap = 6;
		const edge = 8;
		const width = Math.max(r.width, 320);
		const below = window.innerHeight - r.bottom - gap - edge;
		const above = r.top - gap - edge;
		const up = below < 240 && above > below;
		const maxHeight = Math.min(400, Math.max(160, up ? above : below));
		let left = r.left;
		if (left + width > window.innerWidth - edge)
			left = Math.max(edge, window.innerWidth - edge - width);
		pos = {
			top: up ? r.top - gap : r.bottom + gap,
			left,
			width,
			up,
			maxHeight
		};
	}
	async function show() {
		q = '';
		active = 0;
		place();
		open = true;
		await tick();
		search?.focus();
	}
	function hide() {
		open = false;
		trigger?.focus();
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			// Only close the picker — a modal listening on window must not close too.
			e.preventDefault();
			e.stopPropagation();
			hide();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(flat.length - 1, active + 1);
			scrollActive();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(0, active - 1);
			scrollActive();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const o = flat[active];
			if (o) toggle(o.value);
		}
	}
	function scrollActive() {
		const el = document.getElementById(`${uid}-opt-${active}`);
		el?.scrollIntoView({ block: 'nearest' });
	}
	$effect(() => {
		// Re-clamp the highlight when the filter changes.
		void filtered;
		active = 0;
	});
	$effect(() => {
		if (!open) return;
		const re = () => place();
		window.addEventListener('resize', re);
		window.addEventListener('scroll', re, true);
		return () => {
			window.removeEventListener('resize', re);
			window.removeEventListener('scroll', re, true);
		};
	});
	const uid = `pk-${Math.random().toString(36).slice(2, 8)}`;
</script>

{#if name}
	{#each value as v (v)}<input type="hidden" {name} value={v} />{/each}
{/if}

<button
	bind:this={trigger}
	type="button"
	aria-label={ariaLabel ?? placeholder}
	aria-haspopup="listbox"
	aria-expanded={open}
	onclick={() => (open ? hide() : show())}
	class="flex min-h-9 w-full items-center gap-2 rounded-lg border bg-surface px-2.5 py-1.5 text-left text-[14px] text-text transition-colors {open
		? 'border-border-strong ring-2 ring-accent/30'
		: 'border-border hover:border-border-strong'}"
>
	{#if selected.length === 0}
		<span class="flex-1 truncate text-text-3">{placeholder}</span>
	{:else if multiple && chips}
		<span class="flex min-w-0 flex-1 flex-wrap gap-1">
			{#each selected as o (o.value)}
				<span
					class="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-bg-elev px-1.5 py-0.5 text-[12px] {o.mono
						? 'font-mono'
						: ''}"
				>
					<span class="truncate">{o.label}</span>
					<span
						role="button"
						tabindex="-1"
						aria-label={m.common_remove()}
						onclick={(e) => {
							e.stopPropagation();
							toggle(o.value);
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.stopPropagation();
								toggle(o.value);
							}
						}}
						class="text-text-4 hover:text-text"><Icon name="x" size={11} /></span
					>
				</span>
			{/each}
		</span>
	{:else if multiple}
		<span class="flex-1 truncate">{m.picker_n_selected({ count: selected.length })}</span>
	{:else}
		<span class="flex-1 truncate {selected[0].mono ? 'font-mono text-[13px]' : ''}"
			>{selected[0].label}</span
		>
	{/if}
	<Icon name="chevron" size={13} class="shrink-0 text-text-3" />
</button>

{#if open}
	<div
		use:clickOutside={hide}
		in:fly={POPOVER_IN}
		role="dialog"
		tabindex="-1"
		onkeydown={onKey}
		class="fixed z-[60] flex flex-col rounded-[10px] border border-border bg-bg-elev p-1.5 text-[14px] shadow-lg"
		style:left="{pos.left}px"
		style:width="{pos.width}px"
		style:top={pos.up ? undefined : `${pos.top}px`}
		style:bottom={pos.up ? `${window.innerHeight - pos.top}px` : undefined}
		style:max-height="{pos.maxHeight}px"
	>
		<div class="mb-1 flex items-center gap-2 border-b border-border px-2 pt-1 pb-2">
			<span class="text-text-3"><Icon name="search" size={14} /></span>
			<input
				bind:this={search}
				type="text"
				bind:value={q}
				placeholder={searchPlaceholder ?? m.common_search()}
				class="min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none placeholder:text-text-3"
			/>
			{#if multiple && value.length > 0}
				<button
					type="button"
					onclick={clear}
					class="shrink-0 text-[12px] text-text-3 hover:text-text">{m.picker_clear()}</button
				>
			{/if}
		</div>
		<div role="listbox" aria-multiselectable={multiple} class="min-h-0 flex-1 overflow-y-auto">
			{#if flat.length === 0}
				<div class="px-2 py-3 text-center text-[13px] text-text-4">{m.picker_no_results()}</div>
			{/if}
			{#each sections as s (s.group?.id ?? '__rest')}
				{#if s.group}
					{@const st = groupState(s.group)}
					<div class="mt-1 flex items-center gap-2 px-2 pt-1.5 pb-1 first:mt-0">
						<span class="text-[11px] tracking-[0.08em] text-text-4 uppercase">{s.group.label}</span>
						{#if s.group.note}<span class="text-[11px] text-text-4">· {s.group.note}</span>{/if}
						{#if multiple}
							<button
								type="button"
								onclick={() => toggleGroup(s.group!)}
								class="ml-auto rounded px-1.5 py-0.5 text-[11px] {st === 'all'
									? 'text-accent'
									: 'text-text-3 hover:text-text'}"
							>
								{st === 'all' ? m.picker_group_none() : m.picker_group_all()}
							</button>
						{/if}
					</div>
				{/if}
				{#each s.items as o (o.value)}
					{@const i = flat.indexOf(o)}
					<button
						id="{uid}-opt-{i}"
						type="button"
						role="option"
						aria-selected={has(o.value)}
						onclick={() => toggle(o.value)}
						onmousemove={() => (active = i)}
						class="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors {i ===
						active
							? 'bg-surface-2 text-text'
							: 'text-text-2 hover:bg-surface-2 hover:text-text'}"
					>
						{#if multiple}
							<span
								class="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded border text-[9px] {has(
									o.value
								)
									? 'border-accent bg-accent text-white'
									: 'border-border'}">{has(o.value) ? '✓' : ''}</span
							>
						{/if}
						<span class="min-w-0 flex-1">
							<span class="flex items-baseline gap-2">
								<span class="truncate {o.mono ? 'font-mono text-[13px]' : ''}">{o.label}</span>
								{#if o.hint}<span class="shrink-0 font-mono text-[11px] text-text-4">{o.hint}</span
									>{/if}
							</span>
							{#if o.description}<span class="block text-[12px] text-text-4">{o.description}</span
								>{/if}
						</span>
						{#if !multiple}
							<span class="ml-auto text-accent {has(o.value) ? 'opacity-100' : 'opacity-0'}">
								<Icon name="check" size={14} />
							</span>
						{/if}
					</button>
				{/each}
			{/each}
		</div>
	</div>
{/if}
