<script lang="ts" module>
	export type SavedViewEntry<C = Record<string, unknown>> = {
		id: string;
		name: string;
		config: C;
	};
	export const MAX_SAVED_VIEWS = 20;
	export const MAX_VIEW_NAME = 60;
</script>

<script lang="ts" generics="C extends Record<string, unknown>">
	import Icon from './Icon.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		views: SavedViewEntry<C>[];
		current: C;
		onApply: (config: C) => void;
		onChange: (views: SavedViewEntry<C>[]) => void;
	}
	let { views, current, onApply, onChange }: Props = $props();

	// Anchored with `position: fixed` (mirroring the toolbar Group/Time menus)
	// so the trigger can live inside a horizontally-scrollable strip without
	// the dropdown getting clipped by its overflow.
	let open = $state(false);
	let anchor: HTMLElement | null = null;
	let popPos = $state<{ left: number; top: number } | null>(null);

	function toggle(el: HTMLElement) {
		if (open) {
			close();
			return;
		}
		open = true;
		anchor = el;
		queueMicrotask(positionPop);
	}
	function close() {
		open = false;
		anchor = null;
		renamingId = null;
		savingOpen = false;
	}
	function positionPop() {
		if (!anchor) {
			popPos = null;
			return;
		}
		const r = anchor.getBoundingClientRect();
		const W = 244;
		const maxLeft = Math.max(8, window.innerWidth - W - 8);
		popPos = { left: Math.min(r.left, maxLeft), top: r.bottom + 6 };
	}
	$effect(() => {
		if (!open) return;
		const on = () => positionPop();
		window.addEventListener('resize', on);
		window.addEventListener('scroll', on, true);
		return () => {
			window.removeEventListener('resize', on);
			window.removeEventListener('scroll', on, true);
		};
	});

	// A view is "active" when its config matches the live page state modulo
	// noise: key order, filter-value order, and empty/undefined filter entries
	// (an empty selection filters nothing, same as no entry at all).
	function normalize(v: unknown): unknown {
		if (Array.isArray(v)) {
			return v.every((x) => typeof x === 'string') ? [...v].sort() : v.map(normalize);
		}
		if (v && typeof v === 'object') {
			const src = v as Record<string, unknown>;
			const out: Record<string, unknown> = {};
			for (const k of Object.keys(src).sort()) {
				const val = src[k];
				if (val === undefined) continue;
				if (Array.isArray(val) && val.length === 0) continue;
				out[k] = normalize(val);
			}
			return out;
		}
		return v;
	}
	const isActive = (e: SavedViewEntry<C>) =>
		JSON.stringify(normalize(e.config)) === JSON.stringify(normalize(current));

	// JSON round-trip instead of structuredClone: `current` closes over $state
	// proxies, which structuredClone refuses to serialize.
	const plain = (v: C): C => JSON.parse(JSON.stringify(v)) as C;

	function apply(e: SavedViewEntry<C>) {
		onApply(plain(e.config));
		close();
	}

	// ── Save current ─────────────────────────────────────────────────────────
	let savingOpen = $state(false);
	let saveText = $state('');
	const atLimit = $derived(views.length >= MAX_SAVED_VIEWS);
	function commitSave() {
		const name = saveText.trim();
		if (!name || name.length > MAX_VIEW_NAME || atLimit) return;
		onChange([...views, { id: crypto.randomUUID(), name, config: plain(current) }]);
		showToast('ok', m.views_saved_toast({ name }));
		saveText = '';
		savingOpen = false;
	}

	// ── Rename / delete ──────────────────────────────────────────────────────
	let renamingId = $state<string | null>(null);
	let renameText = $state('');
	function startRename(e: SavedViewEntry<C>) {
		savingOpen = false;
		renamingId = e.id;
		renameText = e.name;
	}
	function commitRename() {
		const name = renameText.trim();
		if (renamingId && name && name.length <= MAX_VIEW_NAME) {
			onChange(views.map((v) => (v.id === renamingId ? { ...v, name } : v)));
		}
		renamingId = null;
	}
	function remove(e: SavedViewEntry<C>) {
		onChange(views.filter((v) => v.id !== e.id));
		showToast('ok', m.views_deleted_toast({ name: e.name }));
	}

	function inputKey(ev: KeyboardEvent, commit: () => void, cancel: () => void) {
		if (ev.key === 'Enter') {
			ev.preventDefault();
			commit();
		} else if (ev.key === 'Escape') {
			ev.preventDefault();
			cancel();
		}
	}

	const focusOnMount = (el: HTMLInputElement) => {
		el.focus();
	};
</script>

<div class="shrink-0">
	<button
		type="button"
		onclick={(e) => toggle(e.currentTarget)}
		class="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[14px] whitespace-nowrap transition-colors hover:bg-surface-2"
	>
		<Icon name="bookmark" size={14} class="text-text-3" />
		<span class="font-medium text-text">{m.views_menu_label()}</span>
		<Icon name="chevron" size={11} class="text-text-3" />
	</button>

	{#if open && popPos}
		<div
			use:clickOutside={close}
			in:fly={POPOVER_IN}
			class="fixed z-50 w-[244px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
			style:left="{popPos.left}px"
			style:top="{popPos.top}px"
		>
			{#if views.length === 0}
				<div class="px-2 py-1.5 text-[13px] text-text-4">{m.views_empty()}</div>
			{/if}

			{#each views as v (v.id)}
				{#if renamingId === v.id}
					<div class="px-1 py-1">
						<input
							use:focusOnMount
							bind:value={renameText}
							maxlength={MAX_VIEW_NAME}
							onkeydown={(e) => inputKey(e, commitRename, () => (renamingId = null))}
							onblur={commitRename}
							class="h-7 w-full rounded-md border border-border-strong bg-surface px-2 text-[14px] text-text outline-none"
						/>
					</div>
				{:else}
					<div class="group flex items-center gap-0.5 rounded-md pr-1 hover:bg-surface-2">
						<button
							type="button"
							onclick={() => apply(v)}
							class="flex h-8 min-w-0 flex-1 items-center gap-2 px-2 text-left"
						>
							<span class="truncate text-[14px] text-text-2 group-hover:text-text">{v.name}</span>
							<span class="ml-auto text-accent {isActive(v) ? 'opacity-100' : 'opacity-0'}">
								<Icon name="check" size={13} />
							</span>
						</button>
						<button
							type="button"
							aria-label={m.views_rename()}
							title={m.views_rename()}
							onclick={() => startRename(v)}
							class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-text-4 opacity-0 group-hover:opacity-100 hover:bg-bg-elev hover:text-text"
						>
							<Icon name="pencil" size={12} />
						</button>
						<button
							type="button"
							aria-label={m.common_delete()}
							title={m.common_delete()}
							onclick={() => remove(v)}
							class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-text-4 opacity-0 group-hover:opacity-100 hover:bg-bg-elev hover:text-text"
						>
							<Icon name="trash" size={12} />
						</button>
					</div>
				{/if}
			{/each}

			<div class="my-1 h-px bg-border"></div>

			{#if savingOpen}
				<div class="flex items-center gap-1 px-1 py-1">
					<input
						use:focusOnMount
						bind:value={saveText}
						maxlength={MAX_VIEW_NAME}
						placeholder={m.views_name_placeholder()}
						onkeydown={(e) =>
							inputKey(e, commitSave, () => {
								savingOpen = false;
								saveText = '';
							})}
						class="h-7 w-full min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 text-[14px] text-text outline-none placeholder:text-text-3"
					/>
					<button
						type="button"
						onclick={commitSave}
						disabled={!saveText.trim()}
						class="h-7 shrink-0 rounded-md bg-accent px-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
					>
						{m.common_save()}
					</button>
				</div>
			{:else}
				<button
					type="button"
					onclick={() => {
						renamingId = null;
						savingOpen = true;
					}}
					disabled={atLimit}
					class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] text-text-2 hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
				>
					<Icon name="plus" size={13} />
					<span>
						{atLimit ? m.views_limit_reached({ max: MAX_SAVED_VIEWS }) : m.views_save_current()}
					</span>
				</button>
			{/if}
		</div>
	{/if}
</div>
