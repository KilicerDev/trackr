<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from './Icon.svelte';
	import Kbd from './Kbd.svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
		onaction?: (id: string) => void;
		hiddenIds?: Set<string>;
	}
	let { open, onclose, onaction, hiddenIds }: Props = $props();

	function run(id: string) {
		onaction?.(id);
		onclose();
	}

	type Item = {
		id: string;
		label: string;
		hint?: string;
		icon: string;
		section: string;
		shortcut?: string[];
		tone?: 'default' | 'accent' | 'danger';
	};

	const ITEMS: Item[] = [
		{ id: 'nav.week', section: 'Navigate', label: 'My Week', hint: 'Plan and review this week', icon: 'calendar' },
		{ id: 'nav.tasks', section: 'Navigate', label: 'Tasks', hint: 'All tasks across the workspace', icon: 'check-square' },
		{ id: 'nav.projects', section: 'Navigate', label: 'Projects', hint: 'Browse and manage projects', icon: 'folder' },
		{ id: 'nav.tickets', section: 'Navigate', label: 'Support Tickets', hint: 'Inbox and triage', icon: 'ticket' },
		{ id: 'nav.wiki', section: 'Navigate', label: 'Wiki', hint: 'Docs and knowledge base', icon: 'book' },

		{ id: 'create.task', section: 'Create', label: 'New task', hint: 'Add a task to the workspace', icon: 'plus', tone: 'accent' },
		{ id: 'create.project', section: 'Create', label: 'New project', hint: 'Spin up a project workspace', icon: 'folder' },

		{ id: 'me.signout', section: 'Account', label: 'Sign out', icon: 'logout', tone: 'danger' }
	];

	let query = $state('');
	let active = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);

	const visible = $derived(
		hiddenIds && hiddenIds.size > 0 ? ITEMS.filter((i) => !hiddenIds.has(i.id)) : ITEMS
	);
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return visible;
		return visible.filter(
			(i) =>
				i.label.toLowerCase().includes(q) ||
				(i.hint ?? '').toLowerCase().includes(q) ||
				i.section.toLowerCase().includes(q)
		);
	});

	const grouped = $derived.by(() => {
		const out: { section: string; items: Item[] }[] = [];
		const order = new Map<string, number>();
		for (const it of filtered) {
			if (!order.has(it.section)) {
				order.set(it.section, out.length);
				out.push({ section: it.section, items: [] });
			}
			out[order.get(it.section)!].items.push(it);
		}
		return out;
	});

	// Flat list of ids matching the display order, used for arrow navigation.
	const flat = $derived(grouped.flatMap((g) => g.items));

	$effect(() => {
		// Clamp active selection when filtered list shrinks.
		if (active >= flat.length) active = Math.max(0, flat.length - 1);
	});

	$effect(() => {
		if (open) {
			query = '';
			active = 0;
			queueMicrotask(() => inputEl?.focus());
		}
	});

	function scrollActiveIntoView() {
		queueMicrotask(() => {
			if (!listEl) return;
			const el = listEl.querySelector<HTMLElement>(`[data-idx="${active}"]`);
			el?.scrollIntoView({ block: 'nearest' });
		});
	}

	function move(delta: number) {
		if (flat.length === 0) return;
		active = (active + delta + flat.length) % flat.length;
		scrollActiveIntoView();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			move(1);
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			move(-1);
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			const it = flat[active];
			if (it) run(it.id);
			else onclose();
			return;
		}
	}

	function toneClasses(tone: Item['tone']) {
		if (tone === 'accent') return 'text-accent';
		if (tone === 'danger') return 'text-[#ef7a6d]';
		return 'text-text';
	}

	function iconBgClasses(tone: Item['tone'], selected: boolean) {
		const base = 'w-7 h-7 grid place-items-center rounded-md border border-border shrink-0 transition-colors';
		if (selected) {
			if (tone === 'accent') return `${base} bg-accent-soft text-accent border-accent/30`;
			if (tone === 'danger') return `${base} border-[#ef7a6d]/30 text-[#ef7a6d]`;
			return `${base} bg-bg-elev text-text`;
		}
		return `${base} bg-surface text-text-2`;
	}
</script>

{#if open}
	<div
		role="presentation"
		transition:fade={{ duration: 140 }}
		class="fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px]"
	></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Command palette"
		class="fixed inset-0 z-50 flex justify-center px-4 pointer-events-none"
		onkeydown={onKeydown}
	>
		<div
			transition:fly={{ y: -8, duration: 180, easing: cubicOut }}
			class="pointer-events-auto w-full max-w-[640px] bg-bg-elev border border-border rounded-2xl overflow-hidden flex flex-col self-start"
			style:box-shadow="var(--shadow-lg)"
			style:margin-top="calc(30vh - 24px)"
		>
			<!-- Search row -->
			<div class="flex items-center gap-2.5 px-4 h-12 border-b border-border">
				<Icon name="search" size={15} class="text-text-3" />
				<input
					bind:this={inputEl}
					bind:value={query}
					type="text"
					placeholder="Search tasks, projects, commands…"
					class="flex-1 bg-transparent border-0 outline-none text-[14px] text-text placeholder:text-text-4"
					autocomplete="off"
					spellcheck="false"
				/>
				<span class="hidden sm:inline-flex"><Kbd>ESC</Kbd></span>
			</div>

			<!-- Results -->
			<div bind:this={listEl} class="overflow-y-auto py-2" style:max-height="260px">
				{#if grouped.length === 0}
					<div class="px-6 py-10 text-center">
						<div class="inline-grid place-items-center w-10 h-10 rounded-xl bg-surface border border-border text-text-3 mb-2">
							<Icon name="search" size={16} />
						</div>
						<div class="text-[13px] text-text-2">No results</div>
						<div class="text-[11.5px] text-text-4 mt-0.5">
							Try a different search.
						</div>
					</div>
				{:else}
					{#each grouped as g, gi (g.section)}
						{#if gi > 0}
							<div class="my-1.5 mx-3 h-px bg-border/70"></div>
						{/if}
						<div class="px-3 pt-1.5 pb-1 text-[10.5px] uppercase tracking-[0.08em] text-text-4">
							{g.section}
						</div>
						<div class="px-1.5">
							{#each g.items as it (it.id)}
								{@const idx = flat.indexOf(it)}
								{@const selected = idx === active}
								<button
									type="button"
									data-idx={idx}
									onmousemove={() => (active = idx)}
									onclick={() => run(it.id)}
									class="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-colors {selected ? 'bg-surface' : 'hover:bg-surface/60'}"
								>
									<span class={iconBgClasses(it.tone, selected)}>
										<Icon name={it.icon} size={13} />
									</span>
									<span class="flex-1 min-w-0">
										<span class="block text-[13.5px] leading-tight truncate {toneClasses(it.tone)}">
											{it.label}
										</span>
										{#if it.hint}
											<span class="block text-[11.5px] text-text-4 leading-tight mt-0.5 truncate">
												{it.hint}
											</span>
										{/if}
									</span>
									{#if it.shortcut}
										<span class="flex items-center gap-1 shrink-0">
											{#each it.shortcut as k (k)}
												<Kbd>{k}</Kbd>
											{/each}
										</span>
									{/if}
									<span class="shrink-0 text-text-4 opacity-0 transition-opacity {selected ? 'opacity-100' : ''}">
										<Icon name="chevron-r" size={12} />
									</span>
								</button>
							{/each}
						</div>
					{/each}
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex items-center gap-3 px-4 h-9 border-t border-border bg-surface/40 text-[11.5px] text-text-3">
				<div class="flex items-center gap-1.5">
					<Kbd>↑</Kbd><Kbd>↓</Kbd>
					<span class="text-text-4">navigate</span>
				</div>
				<div class="flex items-center gap-1.5">
					<Kbd>↵</Kbd>
					<span class="text-text-4">open</span>
				</div>
				<div class="ml-auto flex items-center gap-1.5 font-mono text-[10.5px] text-text-4">
					<span class="w-1.5 h-1.5 rounded-full bg-accent"></span>
					Trackr
				</div>
			</div>
		</div>
	</div>
{/if}
