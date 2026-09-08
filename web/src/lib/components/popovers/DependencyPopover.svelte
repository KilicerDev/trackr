<script lang="ts">
	// Prerequisite picker for the task Inspector. Same-project tasks only; the
	// list opens from an optional in-page seed (instant) and is replaced by the
	// /api/tasks/pick result (complete, server-filtered) as soon as it lands.
	// Multi-select: stays open across picks, like the assignee popover.
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import type { TaskLink } from '$lib/types';
	import StatusDot from '../StatusDot.svelte';
	import Icon from '../Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		projectKey: string;
		/** Uuids currently set as prerequisites. */
		value: string[];
		/** Uuids that must never be offered: the task itself and its dependents. */
		exclude?: string[];
		/** Tasks already loaded on the page, shown before the fetch resolves. */
		seed?: TaskLink[];
		ontoggle: (link: TaskLink) => void;
		onclose: () => void;
	}
	let { projectKey, value, exclude = [], seed = [], ontoggle, onclose }: Props = $props();

	let q = $state('');
	let remote = $state<TaskLink[] | null>(null);
	let loading = $state(false);
	let active = $state(0);
	let inputEl = $state<HTMLInputElement>();
	let listEl = $state<HTMLDivElement>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let seq = 0;

	async function load(query: string) {
		const mine = ++seq;
		loading = true;
		try {
			const params = new URLSearchParams({ project: projectKey, q: query });
			const res = await fetch(`/api/tasks/pick?${params}`);
			if (!res.ok) return;
			const data = (await res.json()) as { tasks: TaskLink[] };
			if (mine === seq) remote = data.tasks;
		} catch {
			/* keep whatever we have — the seed still works */
		} finally {
			if (mine === seq) loading = false;
		}
	}

	$effect(() => {
		void load('');
		inputEl?.focus();
		return () => clearTimeout(timer);
	});

	function oninput() {
		active = 0;
		clearTimeout(timer);
		timer = setTimeout(() => void load(q.trim()), 150);
	}

	const excluded = $derived(new Set(exclude));
	const rows = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		const source = remote ?? seed;
		const list = source.filter(
			(t) =>
				!excluded.has(t.uuid) &&
				(!needle || t.title.toLowerCase().includes(needle) || t.id.toLowerCase().includes(needle))
		);
		// Open tasks first, done ones last; otherwise keep the source order.
		return list
			.map((t, i) => ({ t, i }))
			.sort((a, b) => Number(a.t.status === 'done') - Number(b.t.status === 'done') || a.i - b.i)
			.map((x) => x.t);
	});
	const showSkeleton = $derived(loading && remote === null && seed.length === 0);

	$effect(() => {
		if (active >= rows.length) active = Math.max(0, rows.length - 1);
	});
	$effect(() => {
		void active;
		listEl?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(active + 1, rows.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(active - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const row = rows[active];
			if (row) ontoggle(row);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		}
	}
</script>

<div
	use:clickOutside={onclose}
	use:autoPlace
	in:fly={POPOVER_IN}
	class="absolute top-full z-50 mt-1.5 w-[320px] max-w-[calc(100vw-40px)] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
>
	<div class="mb-1.5 flex items-center gap-2 border-b border-border px-2 pt-1 pb-2">
		<span class="text-text-3"><Icon name="search" size={14} /></span>
		<input
			bind:this={inputEl}
			type="text"
			bind:value={q}
			{oninput}
			{onkeydown}
			placeholder={m.tasks_dependency_search_placeholder()}
			aria-label={m.tasks_dependency_search_placeholder()}
			class="flex-1 border-0 bg-transparent text-[14px] outline-none placeholder:text-text-3"
		/>
	</div>
	<div bind:this={listEl} class="max-h-[308px] overflow-y-auto" role="listbox">
		{#if showSkeleton}
			{#each [0, 1, 2] as i (i)}
				<div class="flex items-center gap-2.5 px-2 py-1.5">
					<span class="h-3 w-3 animate-pulse rounded-full bg-surface-2"></span>
					<span class="h-3 w-14 animate-pulse rounded bg-surface-2"></span>
					<span class="h-3 flex-1 animate-pulse rounded bg-surface-2"></span>
				</div>
			{/each}
		{:else}
			{#each rows as t, i (t.uuid)}
				{@const picked = value.includes(t.uuid)}
				<button
					type="button"
					role="option"
					aria-selected={picked}
					data-active={i === active ? 'true' : undefined}
					onmousemove={() => (active = i)}
					onclick={() => ontoggle(t)}
					class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:text-text {i ===
					active
						? 'bg-surface-2 text-text'
						: ''} {t.status === 'done' ? 'opacity-60' : ''}"
				>
					<StatusDot status={t.status} size={12} />
					<span class="shrink-0 font-mono text-[12px] text-text-3">{t.id}</span>
					<span class="min-w-0 flex-1 truncate text-[14px]">{t.title}</span>
					<span class="shrink-0 text-accent {picked ? 'opacity-100' : 'opacity-0'}">
						<Icon name="check" size={14} />
					</span>
				</button>
			{:else}
				<div class="px-2 py-1.5 text-[14px] text-text-3">{m.tasks_no_matching_tasks()}</div>
			{/each}
		{/if}
	</div>
</div>
