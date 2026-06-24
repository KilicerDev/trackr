<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from './Icon.svelte';
	import Kbd from './Kbd.svelte';
	import { m } from '$lib/paraglide/messages';

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

	const ITEMS: Item[] = $derived([
		{
			id: 'nav.week',
			section: m.shell_palette_section_navigate(),
			label: m.shell_nav_week(),
			hint: m.shell_palette_week_hint(),
			icon: 'calendar'
		},
		{
			id: 'nav.tasks',
			section: m.shell_palette_section_navigate(),
			label: m.shell_nav_tasks(),
			hint: m.shell_palette_tasks_hint(),
			icon: 'check-square'
		},
		{
			id: 'nav.projects',
			section: m.shell_palette_section_navigate(),
			label: m.shell_nav_projects(),
			hint: m.shell_palette_projects_hint(),
			icon: 'folder'
		},
		{
			id: 'nav.tickets',
			section: m.shell_palette_section_navigate(),
			label: m.shell_nav_tickets(),
			hint: m.shell_palette_tickets_hint(),
			icon: 'ticket'
		},
		{
			id: 'nav.wiki',
			section: m.shell_palette_section_navigate(),
			label: m.shell_nav_wiki(),
			hint: m.shell_palette_wiki_hint(),
			icon: 'book'
		},

		{
			id: 'create.task',
			section: m.shell_palette_section_create(),
			label: m.shell_palette_new_task(),
			hint: m.shell_palette_new_task_hint(),
			icon: 'plus',
			tone: 'accent'
		},
		{
			id: 'create.project',
			section: m.shell_palette_section_create(),
			label: m.shell_palette_new_project(),
			hint: m.shell_palette_new_project_hint(),
			icon: 'folder'
		},

		{
			id: 'me.signout',
			section: m.shell_palette_section_account(),
			label: m.shell_sign_out(),
			icon: 'logout',
			tone: 'danger'
		}
	]);

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
		const base =
			'w-7 h-7 grid place-items-center rounded-md border border-border shrink-0 transition-colors';
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
		aria-label={m.shell_palette_aria()}
		class="pointer-events-none fixed inset-0 z-50 flex justify-center px-4"
		onkeydown={onKeydown}
	>
		<div
			transition:fly={{ y: -8, duration: 180, easing: cubicOut }}
			class="pointer-events-auto flex w-full max-w-[640px] flex-col self-start overflow-hidden rounded-2xl border border-border bg-bg-elev"
			style:box-shadow="var(--shadow-lg)"
			style:margin-top="calc(30vh - 24px)"
		>
			<!-- Search row -->
			<div class="flex h-12 items-center gap-2.5 border-b border-border px-4">
				<Icon name="search" size={15} class="text-text-3" />
				<input
					bind:this={inputEl}
					bind:value={query}
					type="text"
					placeholder={m.shell_palette_search_placeholder()}
					class="flex-1 border-0 bg-transparent text-[14px] text-text outline-none placeholder:text-text-4"
					autocomplete="off"
					spellcheck="false"
				/>
				<span class="hidden sm:inline-flex"><Kbd>ESC</Kbd></span>
			</div>

			<!-- Results -->
			<div bind:this={listEl} class="overflow-y-auto py-2" style:max-height="260px">
				{#if grouped.length === 0}
					<div class="px-6 py-10 text-center">
						<div
							class="mb-2 inline-grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-text-3"
						>
							<Icon name="search" size={16} />
						</div>
						<div class="text-[13px] text-text-2">{m.shell_palette_no_results()}</div>
						<div class="mt-0.5 text-[11.5px] text-text-4">
							{m.shell_palette_no_results_hint()}
						</div>
					</div>
				{:else}
					{#each grouped as g, gi (g.section)}
						{#if gi > 0}
							<div class="mx-3 my-1.5 h-px bg-border/70"></div>
						{/if}
						<div class="px-3 pt-1.5 pb-1 text-[10.5px] tracking-[0.08em] text-text-4 uppercase">
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
									class="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors {selected
										? 'bg-surface'
										: 'hover:bg-surface/60'}"
								>
									<span class={iconBgClasses(it.tone, selected)}>
										<Icon name={it.icon} size={13} />
									</span>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-[13.5px] leading-tight {toneClasses(it.tone)}">
											{it.label}
										</span>
										{#if it.hint}
											<span class="mt-0.5 block truncate text-[11.5px] leading-tight text-text-4">
												{it.hint}
											</span>
										{/if}
									</span>
									{#if it.shortcut}
										<span class="flex shrink-0 items-center gap-1">
											{#each it.shortcut as k (k)}
												<Kbd>{k}</Kbd>
											{/each}
										</span>
									{/if}
									<span
										class="shrink-0 text-text-4 opacity-0 transition-opacity {selected
											? 'opacity-100'
											: ''}"
									>
										<Icon name="chevron-r" size={12} />
									</span>
								</button>
							{/each}
						</div>
					{/each}
				{/if}
			</div>

			<!-- Footer -->
			<div
				class="flex h-9 items-center gap-3 border-t border-border bg-surface/40 px-4 text-[11.5px] text-text-3"
			>
				<div class="flex items-center gap-1.5">
					<Kbd>↑</Kbd><Kbd>↓</Kbd>
					<span class="text-text-4">{m.shell_palette_navigate()}</span>
				</div>
				<div class="flex items-center gap-1.5">
					<Kbd>↵</Kbd>
					<span class="text-text-4">{m.common_open()}</span>
				</div>
				<div class="ml-auto flex items-center gap-1.5 font-mono text-[10.5px] text-text-4">
					<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
					Trackr
				</div>
			</div>
		</div>
	</div>
{/if}
