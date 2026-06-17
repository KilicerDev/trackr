<script lang="ts">
	import { tick } from 'svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import Icon from '../Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	type PickableTask = { id: string; ref: string; title: string };

	interface Props {
		value: string; // task id, or '' for none
		onchange: (v: string) => void;
		onclose: () => void;
		tasks: PickableTask[];
		noneLabel: string;
	}
	let { value, onchange, onclose, tasks, noneLabel }: Props = $props();

	let q = $state('');
	const searching = $derived(q.trim().length > 0);
	const filtered = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		if (!needle) return tasks;
		return tasks.filter(
			(t) => t.title.toLowerCase().includes(needle) || t.ref.toLowerCase().includes(needle)
		);
	});

	// Row 0 is always the "none" option (hidden while searching); tasks follow.
	const rows = $derived(
		searching
			? filtered.map((t) => ({ id: t.id, ref: t.ref, title: t.title }))
			: [{ id: '', ref: '', title: noneLabel }, ...filtered]
	);

	let inputEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);
	let activeIndex = $state(0);

	$effect(() => {
		activeIndex = Math.max(0, rows.findIndex((r) => r.id === value));
		inputEl?.focus();
	});

	function pick(id: string) {
		onchange(id);
		onclose();
	}

	async function move(delta: number) {
		if (rows.length === 0) return;
		activeIndex = (activeIndex + delta + rows.length) % rows.length;
		await tick();
		listEl?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			move(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			move(-1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const r = rows[activeIndex];
			if (r) pick(r.id);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onclose();
		}
	}
</script>

<div
	use:clickOutside={onclose}
	use:autoPlace
	in:fly={POPOVER_IN}
	class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[300px] w-[var(--task-pop-w,300px)]"
	style:box-shadow="var(--shadow-lg)"
>
	<div class="flex items-center gap-2 px-2 pt-1 pb-2 border-b border-border mb-1.5">
		<span class="text-text-3"><Icon name="search" size={13} /></span>
		<input
			type="text"
			bind:this={inputEl}
			bind:value={q}
			{onkeydown}
			placeholder={m.notes_search_tasks_placeholder()}
			class="flex-1 bg-transparent border-0 outline-none text-[13px] placeholder:text-text-3"
		/>
	</div>

	<div bind:this={listEl} class="max-h-[300px] overflow-y-auto">
		{#each rows as r, i (r.id || 'none')}
			<button
				type="button"
				data-active={i === activeIndex}
				onclick={() => pick(r.id)}
				onmouseenter={() => (activeIndex = i)}
				class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-text-2 hover:text-text {i ===
				activeIndex
					? 'bg-surface-2 text-text'
					: ''}"
			>
				{#if r.ref}
					<span class="font-mono text-[11.5px] text-text-3 shrink-0">{r.ref}</span>
				{/if}
				<span class="text-[13px] truncate">{r.title}</span>
				<span class="ml-auto text-accent shrink-0 {r.id === value ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
		{#if searching && filtered.length === 0}
			<div class="px-2 py-3 text-[12.5px] text-text-3 text-center">
				{m.notes_no_tasks_match({ q })}
			</div>
		{/if}
	</div>
</div>
