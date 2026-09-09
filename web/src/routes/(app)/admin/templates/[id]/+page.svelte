<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { deserialize } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { showToast } from '$lib/stores/toast.svelte';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Popover from '$lib/components/Popover.svelte';
	import PopItem from '$lib/components/PopItem.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';
	import PriorityBars from '$lib/components/PriorityBars.svelte';
	import TypeBadge from '$lib/components/TypeBadge.svelte';
	import TemplateTaskInspector, {
		type TemplateTaskDraft
	} from '$lib/components/projects/TemplateTaskInspector.svelte';
	import { TRACKR_PRIORITIES, TRACKR_STATUSES, TRACKR_TYPES } from '$lib/config/taxonomy';
	import { priorityLabel, statusLabel, typeLabel } from '$lib/utils/labels';
	import type { PriorityId, StatusId, TypeId } from '$lib/types';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Status = 'draft' | 'published';

	const PALETTE = [
		'#ef7a6d',
		'#e07a5f',
		'#f0a85c',
		'#e9c46a',
		'#7fc8a9',
		'#5fb3c2',
		'#7a9cf0',
		'#9b8cf0',
		'#c08bd6',
		'#d97cae'
	];

	// ── Local, optimistic copy of the template ───────────────────────────────
	// Edits are applied here first and persisted in the background; we never
	// re-fetch after a save so a slow round-trip can't wipe a keystroke.
	let name = $state('');
	let description = $state('');
	let color = $state(PALETTE[6]);
	let status = $state<Status>('draft');
	let tasks = $state<TemplateTaskDraft[]>([]);

	$effect(() => {
		const id = data.template.id;
		void id;
		untrack(() => {
			name = data.template.name;
			description = data.template.description ?? '';
			color = data.template.color;
			status = data.template.status;
			tasks = data.tasks.map((t) => ({ ...t, checklist: [...t.checklist] }));
			openId = null;
		});
	});

	const icon = $derived(name.trim() ? name.trim()[0].toUpperCase() : 'T');
	const totalMinutes = $derived(tasks.reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0));

	// ── Persistence ──────────────────────────────────────────────────────────
	let pending = $state(0);
	let lastSavedAt = $state<number | null>(null);
	let saveError = $state(false);

	async function post(action: string, fields: Record<string, string | string[]>) {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) {
			if (Array.isArray(v)) for (const x of v) fd.append(k, x);
			else fd.append(k, v);
		}
		pending++;
		try {
			const res = await fetch(`?/${action}`, {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			if (result.type !== 'success') throw new Error('save failed');
			saveError = false;
			lastSavedAt = Date.now();
			return result;
		} catch (e) {
			saveError = true;
			showToast('err', m.templates_action_error());
			throw e;
		} finally {
			pending--;
		}
	}

	// Plain object, not reactive: timer handles never drive rendering.
	const timers: Record<string, ReturnType<typeof setTimeout>> = {};
	function debounced(key: string, fn: () => void, ms = 500) {
		clearTimeout(timers[key]);
		timers[key] = setTimeout(fn, ms);
	}

	function saveName() {
		if (!name.trim()) return;
		debounced('name', () => void post('update', { name: name.trim() }).catch(() => {}));
	}
	function saveDescription() {
		debounced('description', () => void post('update', { description }).catch(() => {}));
	}
	function pickColor(c: string) {
		color = c;
		void post('update', { color: c }).catch(() => {});
	}

	let statusPop = $state(false);
	async function setStatus(next: Status) {
		statusPop = false;
		if (next === status) return;
		const prev = status;
		status = next;
		try {
			await post('status', { status: next });
			showToast(
				'ok',
				next === 'published' ? m.templates_published_toast() : m.templates_draft_toast()
			);
		} catch {
			status = prev;
		}
	}

	// ── Tasks ────────────────────────────────────────────────────────────────
	let newTitle = $state('');
	let adding = $state(false);
	let addInput = $state<HTMLInputElement>();

	async function addTask() {
		const title = newTitle.trim();
		if (!title || adding) return;
		adding = true;
		try {
			const result = await post('task_add', { title });
			const id = (result.data as { id?: string } | undefined)?.id;
			if (!id) throw new Error('no id');
			tasks.push({
				id,
				title,
				description: null,
				status: 'todo',
				priority: 'none',
				type: 'task',
				estimateMinutes: null,
				tags: [],
				checklist: []
			});
			newTitle = '';
		} catch {
			/* toast already shown */
		} finally {
			adding = false;
			await tick();
			addInput?.focus();
		}
	}

	function patchTask(t: TemplateTaskDraft, patch: Partial<TemplateTaskDraft>, immediate = true) {
		Object.assign(t, patch);
		const fields: Record<string, string> = { taskId: t.id };
		for (const [k, v] of Object.entries(patch)) {
			if (k === 'tags') fields.tags = (v as string[]).join(',');
			else if (k === 'checklist') fields.checklist = JSON.stringify(v);
			else fields[k] = v == null ? '' : String(v);
		}
		const run = () => void post('task_update', fields).catch(() => {});
		if (immediate) run();
		else debounced(`task:${t.id}:${Object.keys(patch).join(',')}`, run);
	}

	async function removeTask(t: TemplateTaskDraft) {
		const idx = tasks.findIndex((x) => x.id === t.id);
		if (idx < 0) return;
		const [removed] = tasks.splice(idx, 1);
		if (openId === t.id) openId = null;
		try {
			await post('task_delete', { taskId: t.id });
		} catch {
			tasks.splice(idx, 0, removed);
		}
	}

	// ── Detail panel ─────────────────────────────────────────────────────────
	// Clicking a row opens the same kind of side panel a real task has, with
	// description, checklist, and tags. Quick pickers stay on the row.
	let openId = $state<string | null>(null);
	const openIndex = $derived(tasks.findIndex((t) => t.id === openId));
	const openTask = $derived(openIndex >= 0 ? tasks[openIndex] : null);

	// Tags already used on other tasks in this template, offered as quick picks.
	const tagSuggestions = $derived(
		tasks
			.flatMap((t) => t.tags)
			.filter((tag, i, all) => all.indexOf(tag) === i)
			.sort()
	);

	// Per-row pickers: only one open at a time across the whole list.
	let pop = $state<{ id: string; kind: 'type' | 'status' | 'priority' } | null>(null);
	const isOpen = (id: string, kind: 'type' | 'status' | 'priority') =>
		pop?.id === id && pop.kind === kind;
	function togglePop(id: string, kind: 'type' | 'status' | 'priority') {
		pop = isOpen(id, kind) ? null : { id, kind };
	}

	// ── Estimates ────────────────────────────────────────────────────────────
	// Accepts "90", "1h", "1h30", "1h 30m", "45m", "1.5h" — stored as minutes.
	function parseEstimate(raw: string): number | null {
		const s = raw.trim().toLowerCase().replace(',', '.');
		if (!s) return null;
		if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
		let total = 0;
		let matched = false;
		const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
		if (h) {
			total += Number(h[1]) * 60;
			matched = true;
		}
		const min = s.match(/(\d+)\s*m/);
		if (min) {
			total += Number(min[1]);
			matched = true;
		}
		// "1h30" without a unit on the minutes part.
		const tail = s.match(/h\s*(\d+)$/);
		if (tail && !min) total += Number(tail[1]);
		return matched ? Math.round(total) : null;
	}
	function formatEstimate(minutes: number | null): string {
		if (!minutes) return '';
		const h = Math.floor(minutes / 60);
		const mm = minutes % 60;
		if (h && mm) return `${h}h ${mm}m`;
		if (h) return `${h}h`;
		return `${mm}m`;
	}
	function commitEstimate(t: TemplateTaskDraft, e: Event) {
		const input = e.target as HTMLInputElement;
		const parsed = parseEstimate(input.value);
		input.value = formatEstimate(parsed);
		if (parsed !== t.estimateMinutes) patchTask(t, { estimateMinutes: parsed });
	}

	// ── Drag to reorder ──────────────────────────────────────────────────────
	// Rows reorder live under the pointer; the new order is persisted once on
	// drop. HTML5 DnD keeps it dependency-free and works with the animate:flip.
	let dragId = $state<string | null>(null);
	let orderBeforeDrag: string[] = [];

	function onDragStart(e: DragEvent, id: string) {
		dragId = id;
		orderBeforeDrag = tasks.map((t) => t.id);
		e.dataTransfer?.setData('text/plain', id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	function onDragOver(e: DragEvent, overId: string) {
		e.preventDefault();
		if (!dragId || dragId === overId) return;
		const from = tasks.findIndex((t) => t.id === dragId);
		const to = tasks.findIndex((t) => t.id === overId);
		if (from < 0 || to < 0) return;
		const [moved] = tasks.splice(from, 1);
		tasks.splice(to, 0, moved);
	}
	async function onDragEnd() {
		if (!dragId) return;
		dragId = null;
		const order = tasks.map((t) => t.id);
		if (order.join() === orderBeforeDrag.join()) return;
		try {
			await post('reorder', { ids: order });
		} catch {
			const byId = new Map(tasks.map((t) => [t.id, t]));
			tasks = orderBeforeDrag.map((id) => byId.get(id)!).filter(Boolean);
		}
	}

	// ── Delete ───────────────────────────────────────────────────────────────
	async function deleteTemplate() {
		const ok = await uiConfirm({
			title: m.templates_delete_title(),
			message: m.templates_delete_message({ name, count: tasks.length }),
			confirmLabel: m.common_delete(),
			tone: 'danger'
		});
		if (!ok) return;
		const fd = new FormData();
		const res = await fetch('?/delete', {
			method: 'POST',
			body: fd,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result: ActionResult = deserialize(await res.text());
		if (result.type === 'redirect' || result.type === 'success') {
			showToast('ok', m.templates_deleted_toast());
			await goto('/admin/templates');
		} else showToast('err', m.templates_action_error());
	}

	const published = $derived(status === 'published');
</script>

<svelte:head
	><title>{name || m.templates_title()}</title></svelte:head
>

<div class="mx-auto max-w-[880px]">
	<a
		href="/admin/templates"
		class="mb-5 inline-flex items-center gap-1 text-[13px] text-text-3 transition-colors hover:text-text"
	>
		<span class="rotate-90"><Icon name="chevron" size={12} /></span>
		{m.templates_title()}
	</a>

	<!-- Identity: tile, name, description. The tile picks up the color live. -->
	<header class="mb-8 flex items-start gap-4">
		<span
			class="grid size-14 shrink-0 place-items-center rounded-[15px] text-[24px] font-semibold text-white transition-[background] duration-200"
			style:background="linear-gradient(140deg, {color}, color-mix(in oklch, {color} 70%, #000) 85%)"
			style:box-shadow="var(--shadow-edge), 0 8px 22px {color}33"
		>
			{icon}
		</span>

		<div class="min-w-0 flex-1">
			<input
				type="text"
				bind:value={name}
				oninput={saveName}
				placeholder={m.templates_editor_name_placeholder()}
				class="block w-full border-0 bg-transparent text-[26px] font-semibold tracking-[-0.014em] text-text outline-none placeholder:text-text-3"
			/>
			<textarea
				bind:value={description}
				oninput={saveDescription}
				rows="1"
				placeholder={m.templates_editor_description_placeholder()}
				class="mt-1 block field-sizing-content w-full resize-none border-0 bg-transparent text-[14px] leading-relaxed text-text-2 outline-none placeholder:text-text-3"
			></textarea>

			<div class="mt-3 flex items-center gap-1.5">
				{#each PALETTE as c (c)}
					<button
						type="button"
						onclick={() => pickColor(c)}
						aria-label={m.projects_pick_color({ color: c })}
						class="grid h-5 w-5 place-items-center rounded-md transition-transform hover:scale-110 active:scale-95"
						style:background="linear-gradient(140deg, {c}, color-mix(in oklch, {c} 70%, #000) 85%)"
						style:box-shadow={color === c
							? `0 0 0 2px var(--bg), 0 0 0 3.5px ${c}`
							: 'var(--shadow-edge)'}
					></button>
				{/each}
			</div>
		</div>

		<div class="flex shrink-0 flex-col items-end gap-2">
			<div class="relative">
				<button
					type="button"
					onclick={() => (statusPop = !statusPop)}
					class="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[14px] font-medium transition-colors {published
						? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-500/50'
						: 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-500/50'}"
				>
					<span class="h-2 w-2 rounded-full {published ? 'bg-emerald-400' : 'bg-amber-300'}"></span>
					{published ? m.templates_status_published() : m.templates_status_draft()}
					<Icon name="chevron" size={12} class="opacity-70" />
				</button>
				<Popover open={statusPop} onclose={() => (statusPop = false)} align="right" minWidth={280}>
					<PopItem selected={!published} onclick={() => setStatus('draft')}>
						<span class="mt-1.5 h-2 w-2 shrink-0 self-start rounded-full bg-amber-300"></span>
						<span class="min-w-0">
							<span class="block text-text">{m.templates_status_draft()}</span>
							<span class="block text-[12px] text-text-3">{m.templates_status_draft_hint()}</span>
						</span>
					</PopItem>
					<PopItem selected={published} onclick={() => setStatus('published')}>
						<span class="mt-1.5 h-2 w-2 shrink-0 self-start rounded-full bg-emerald-400"></span>
						<span class="min-w-0">
							<span class="block text-text">{m.templates_status_published()}</span>
							<span class="block text-[12px] text-text-3"
								>{m.templates_status_published_hint()}</span
							>
						</span>
					</PopItem>
				</Popover>
			</div>

			<div class="h-4 text-[12px] text-text-4">
				{#if pending > 0}
					<span transition:fade={{ duration: 120 }}>{m.common_saving()}</span>
				{:else if saveError}
					<span class="text-[#ef4f5e]" transition:fade={{ duration: 120 }}
						>{m.templates_editor_unsaved()}</span
					>
				{:else if lastSavedAt}
					<span class="inline-flex items-center gap-1" transition:fade={{ duration: 120 }}>
						<Icon name="check" size={11} />
						{m.templates_editor_saved()}
					</span>
				{/if}
			</div>
		</div>
	</header>

	<!-- Tasks -->
	<div class="mb-3 flex items-end gap-3">
		<div class="min-w-0 flex-1">
			<h2 class="text-[16px] font-semibold text-text">
				{m.templates_editor_tasks_title()}
				<span class="ml-1.5 font-mono text-[13px] font-normal text-text-3">{tasks.length}</span>
			</h2>
			<p class="mt-0.5 max-w-xl text-[13px] text-text-3">{m.templates_editor_tasks_hint()}</p>
		</div>
		{#if totalMinutes > 0}
			<div class="shrink-0 text-right text-[13px] text-text-3">
				<span class="font-mono text-text-2">{formatEstimate(totalMinutes)}</span>
				{m.templates_editor_total_estimate()}
			</div>
		{/if}
	</div>

	<!-- No overflow clipping here: the row pickers pop out below the card edge. -->
	<div class="rounded-2xl border border-border bg-bg-elev">
		{#if tasks.length === 0}
			<div class="px-5 py-8 text-center text-[13px] text-text-3">
				{m.templates_editor_empty()}
			</div>
		{/if}

		{#each tasks as t, i (t.id)}
			{@const checked = t.checklist.filter((c) => c.done).length}
			{@const isActive = openId === t.id}
			<div
				animate:flip={{ duration: 180, easing: cubicOut }}
				role="listitem"
				ondragover={(e) => onDragOver(e, t.id)}
				class="border-b border-border/40 transition-colors first:rounded-t-2xl {dragId === t.id
					? 'bg-surface/60 opacity-60'
					: isActive
						? 'bg-surface/50'
						: 'hover:bg-[var(--row-hover)]'}"
			>
				<div
					class="grid items-center gap-2 py-1.5 pr-2 pl-2 text-[14px]"
					style:grid-template-columns="20px 34px auto minmax(0,1fr) auto auto auto 76px 28px"
				>
					<button
						type="button"
						draggable="true"
						ondragstart={(e) => onDragStart(e, t.id)}
						ondragend={onDragEnd}
						aria-label={m.templates_aria_drag()}
						title={m.templates_aria_drag()}
						class="grid h-7 w-5 cursor-grab place-items-center rounded text-text-4 transition-colors hover:text-text-2 active:cursor-grabbing"
					>
						<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
							<circle cx="2.5" cy="2" r="1.4" /><circle cx="7.5" cy="2" r="1.4" />
							<circle cx="2.5" cy="7" r="1.4" /><circle cx="7.5" cy="7" r="1.4" />
							<circle cx="2.5" cy="12" r="1.4" /><circle cx="7.5" cy="12" r="1.4" />
						</svg>
					</button>

					<span class="font-mono text-[12px] text-text-4">#{i + 1}</span>

					<div class="relative">
						<button
							type="button"
							onclick={() => togglePop(t.id, 'type')}
							aria-label={typeLabel(t.type)}
							class="rounded-md transition-opacity hover:opacity-80"
						>
							<TypeBadge type={t.type as TypeId} showLabel={false} />
						</button>
						<Popover open={isOpen(t.id, 'type')} onclose={() => (pop = null)} minWidth={180}>
							{#each TRACKR_TYPES as ty (ty.id)}
								<PopItem
									selected={t.type === ty.id}
									onclick={() => {
										patchTask(t, { type: ty.id });
										pop = null;
									}}
								>
									<TypeBadge type={ty.id} showLabel={false} />
									{typeLabel(ty.id)}
								</PopItem>
							{/each}
						</Popover>
					</div>

					<!-- Title opens the detail panel, like a row in the real task list. -->
					<button
						type="button"
						onclick={() => (openId = isActive ? null : t.id)}
						title={m.templates_editor_open_task()}
						class="min-w-0 truncate rounded-md px-1.5 py-1 text-left text-text transition-colors hover:text-accent"
					>
						{t.title}
					</button>

					<!-- What the panel holds, at a glance -->
					<span class="flex items-center gap-2 text-[12px] text-text-4">
						{#if t.description}
							<span title={m.tasks_description_placeholder()}><Icon name="file" size={13} /></span>
						{/if}
						{#if t.checklist.length > 0}
							<span
								class="inline-flex items-center gap-1 font-mono {checked === t.checklist.length
									? 'text-[#7fc8a9]'
									: ''}"
							>
								<Icon name="check" size={12} />{checked}/{t.checklist.length}
							</span>
						{/if}
						{#if t.tags.length > 0}
							<span class="inline-flex items-center gap-1 font-mono">
								<Icon name="bookmark" size={12} />{t.tags.length}
							</span>
						{/if}
					</span>

					<div class="relative">
						<button
							type="button"
							onclick={() => togglePop(t.id, 'status')}
							aria-label={statusLabel(t.status)}
							title={statusLabel(t.status)}
							class="grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-surface"
						>
							<StatusDot status={t.status as StatusId} size={14} />
						</button>
						<Popover open={isOpen(t.id, 'status')} onclose={() => (pop = null)} minWidth={180}>
							{#each TRACKR_STATUSES as s (s.id)}
								<PopItem
									selected={t.status === s.id}
									onclick={() => {
										patchTask(t, { status: s.id });
										pop = null;
									}}
								>
									<StatusDot status={s.id} size={14} />
									{statusLabel(s.id)}
								</PopItem>
							{/each}
						</Popover>
					</div>

					<div class="relative">
						<button
							type="button"
							onclick={() => togglePop(t.id, 'priority')}
							aria-label={priorityLabel(t.priority)}
							title={priorityLabel(t.priority)}
							class="grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-surface"
						>
							<PriorityBars priority={t.priority as PriorityId} />
						</button>
						<Popover open={isOpen(t.id, 'priority')} onclose={() => (pop = null)} minWidth={180}>
							{#each TRACKR_PRIORITIES as p (p.id)}
								<PopItem
									selected={t.priority === p.id}
									onclick={() => {
										patchTask(t, { priority: p.id });
										pop = null;
									}}
								>
									<PriorityBars priority={p.id} />
									{priorityLabel(p.id)}
								</PopItem>
							{/each}
						</Popover>
					</div>

					<input
						type="text"
						value={formatEstimate(t.estimateMinutes)}
						placeholder={m.templates_editor_estimate_placeholder()}
						onblur={(e) => commitEstimate(t, e)}
						onkeydown={(e) => {
							if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
						}}
						class="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right font-mono text-[12px] text-text-3 transition-colors outline-none placeholder:text-text-4 focus:border-border-strong focus:bg-surface focus:text-text"
					/>

					<button
						type="button"
						onclick={() => removeTask(t)}
						aria-label={m.templates_aria_remove_task()}
						title={m.templates_aria_remove_task()}
						class="grid h-7 w-7 place-items-center rounded-md text-text-4 transition-colors hover:bg-surface hover:text-[#ef4f5e]"
					>
						<Icon name="x" size={14} />
					</button>
				</div>
			</div>
		{/each}

		<!-- Composer: always the last row so the list reads as one growing sheet. -->
		<form
			onsubmit={(e) => {
				e.preventDefault();
				void addTask();
			}}
			class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 py-1.5 pr-2 pl-2"
		>
			<span class="grid h-7 w-5 place-items-center text-text-4"><Icon name="plus" size={14} /></span
			>
			<span class="w-[34px] font-mono text-[12px] text-text-4">#{tasks.length + 1}</span>
			<input
				type="text"
				bind:this={addInput}
				bind:value={newTitle}
				placeholder={m.templates_editor_add_placeholder()}
				class="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[14px] text-text transition-colors outline-none placeholder:text-text-3 focus:border-border-strong focus:bg-surface"
			/>
			{#if newTitle.trim()}
				<button
					type="submit"
					transition:fade={{ duration: 100 }}
					class="inline-flex h-7 items-center rounded-md border border-transparent bg-accent px-2.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-strong"
				>
					{m.common_add()}
				</button>
			{/if}
		</form>
	</div>

	<div class="mt-10 flex items-center justify-between border-t border-border pt-5">
		<p class="text-[13px] text-text-4">{m.templates_editor_delete_hint()}</p>
		<button
			type="button"
			onclick={deleteTemplate}
			class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] text-text-2 transition-colors hover:border-[#ef4f5e]/40 hover:text-[#ef4f5e]"
		>
			<Icon name="trash" size={13} />
			{m.templates_editor_delete()}
		</button>
	</div>
</div>

<TemplateTaskInspector
	task={openTask}
	index={openIndex}
	saving={pending > 0}
	{tagSuggestions}
	onclose={() => (openId = null)}
	onpatch={(patch, immediate) => {
		if (openTask) patchTask(openTask, patch, immediate);
	}}
	ondelete={() => {
		if (openTask) void removeTask(openTask);
	}}
/>
