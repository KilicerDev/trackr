<script lang="ts">
	/* eslint-disable svelte/no-dom-manipulating --
	   This is a contenteditable mention editor. Its children (text + chip nodes)
	   are managed imperatively here, not declaratively by Svelte — the template
	   `root` div is intentionally empty, so there's no Svelte-rendered DOM for the
	   runtime to get out of sync with. */
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { buildMentionToken, segmentMentions } from '$lib/utils/mentions';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { ChatTag } from '$lib/server/chat';

	type MentionUser = {
		id: string;
		name: string;
		email: string;
		initials: string;
		color: string;
		status: 'active' | 'invited' | 'disabled';
		// Mention-scoping fields supplied by the (app) layout users payload.
		internal?: boolean;
		projectIds?: string[];
	};

	interface Props {
		// Stored value in token form: `@[Name](id)`. The editor renders mentions
		// as chips (showing only `@Name`) so the raw token is never visible.
		value: string;
		placeholder?: string;
		disabled?: boolean;
		rows?: number;
		class?: string;
		// Host keydown (e.g. Composer's Cmd+Enter to send).
		onkeydown?: (e: KeyboardEvent) => void;
		// When set, only users who can access this project are offered:
		// internal org members plus explicit project members. Mirrors the
		// server's projectMentionRecipients filter so the dropdown never
		// suggests someone whose mention would be silently dropped.
		projectId?: string | null;
		// Opt-in `#` tagging. When `tags` is provided, typing `#` offers existing
		// tags (and a create row); choosing one removes the typed `#text` from the
		// body and calls `onTagAdd` — the tag lives as a chip elsewhere, never in
		// the message text. Omit both and the editor behaves exactly as before.
		tags?: ChatTag[];
		onTagAdd?: (id: string | null, label: string) => void;
	}
	let {
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		rows = 2,
		class: cls = '',
		onkeydown,
		projectId = null,
		tags,
		onTagAdd
	}: Props = $props();

	let root = $state<HTMLDivElement | null>(null);
	let open = $state(false);
	let query = $state('');
	let activeIndex = $state(0);
	let isEmpty = $state(true);
	// Which trigger char opened the dropdown: '@' (mentions) or '#' (tags).
	let mode = $state<'@' | '#'>('@');
	// The value we last pushed up — lets the sync effect tell an external change
	// (clear-on-send, reset) apart from our own edits, so we never re-render the
	// DOM mid-edit and blow away the caret.
	let lastEmitted: string | null = null;
	// Text node + offsets of the active `@`/`#` query being typed.
	let trigger: { node: Text; start: number; end: number } | null = null;

	// Tag suggestions for the `#` trigger (existing tags matching the query).
	const tagMatches = $derived.by<ChatTag[]>(() => {
		if (!tags) return [];
		const needle = query.toLowerCase();
		return tags.filter((t) => t.label.toLowerCase().includes(needle)).slice(0, 6);
	});
	const showCreateTag = $derived(
		mode === '#' &&
			!!onTagAdd &&
			query.trim().length > 0 &&
			!(tags ?? []).some((t) => t.label.toLowerCase() === query.trim().toLowerCase())
	);

	const candidates = $derived.by<MentionUser[]>(() => {
		const all = ((page.data as { users?: MentionUser[] }).users ?? []).filter(
			(u) =>
				u.status !== 'disabled' &&
				(!projectId || u.internal || (u.projectIds ?? []).includes(projectId))
		);
		if (!query) return all.slice(0, 6);
		const needle = query.toLowerCase();
		return all
			.filter(
				(u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
			)
			.slice(0, 6);
	});

	// Total selectable rows currently shown (drives keyboard nav).
	const optionCount = $derived(
		mode === '@' ? candidates.length : tagMatches.length + (showCreateTag ? 1 : 0)
	);

	function makeChip(id: string, name: string): HTMLSpanElement {
		const span = document.createElement('span');
		span.contentEditable = 'false';
		span.dataset.mentionId = id;
		span.dataset.mentionName = name;
		span.className =
			'inline-flex items-center rounded px-1 font-medium text-accent bg-accent/10 align-baseline';
		span.textContent = '@' + (resolveUser(id)?.name ?? name);
		return span;
	}

	// DOM -> token string. Mentions become `@[name](id)`; <br> and block
	// elements become newlines.
	function serialize(): string {
		if (!root) return '';
		let out = '';
		const walk = (nodes: ChildNode[]) => {
			for (const n of nodes) {
				if (n.nodeType === Node.TEXT_NODE) {
					out += n.textContent ?? '';
				} else if (n instanceof HTMLElement) {
					if (n.dataset.mentionId) {
						out += buildMentionToken(n.dataset.mentionName ?? '', n.dataset.mentionId);
					} else if (n.tagName === 'BR') {
						out += '\n';
					} else {
						if (out && !out.endsWith('\n')) out += '\n';
						walk(Array.from(n.childNodes));
					}
				}
			}
		};
		walk(Array.from(root.childNodes));
		return out;
	}

	// token string -> DOM (used only for external value changes).
	function render(val: string) {
		if (!root) return;
		root.replaceChildren();
		for (const seg of segmentMentions(val)) {
			if (seg.type === 'mention') {
				root.appendChild(makeChip(seg.id, seg.name));
			} else {
				const parts = seg.value.split('\n');
				parts.forEach((p, i) => {
					if (i > 0) root!.appendChild(document.createElement('br'));
					if (p) root!.appendChild(document.createTextNode(p));
				});
			}
		}
		isEmpty = (root.textContent ?? '').length === 0;
	}

	function emit() {
		const v = serialize();
		lastEmitted = v;
		value = v;
		isEmpty = (root?.textContent ?? '').length === 0;
	}

	function detectTrigger() {
		open = false;
		trigger = null;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
		const node = sel.anchorNode;
		if (!node || node.nodeType !== Node.TEXT_NODE || !root?.contains(node)) return;
		const offset = sel.anchorOffset;
		const before = (node.textContent ?? '').slice(0, offset);
		const at = before.match(/(?:^|\s)@([\p{L}\d_.-]*)$/u);
		// `#` tagging is only active when the host opted in via `tags`.
		const hash = tags ? before.match(/(?:^|\s)#([\p{L}\d_.-]*)$/u) : null;
		const match = at ?? hash;
		if (!match) return;
		mode = at ? '@' : '#';
		query = match[1] ?? '';
		trigger = { node: node as Text, start: offset - query.length - 1, end: offset };
		activeIndex = 0;
		open = true;
	}

	function onInput() {
		// After deleting everything, browsers leave a stray <br>, so the field is
		// no longer truly `:empty` — that pushes the caret past the inline
		// placeholder. Reset to genuinely empty and park the caret at the start.
		if (root && root.childNodes.length && (root.textContent ?? '') === '') {
			root.replaceChildren();
			const sel = window.getSelection();
			const range = document.createRange();
			range.setStart(root, 0);
			range.collapse(true);
			sel?.removeAllRanges();
			sel?.addRange(range);
		}
		emit();
		detectTrigger();
	}

	async function choose(u: MentionUser) {
		if (!trigger || !root) return;
		const { node, start, end } = trigger;
		const parent = node.parentNode;
		if (!parent) return;
		const full = node.textContent ?? '';
		node.textContent = full.slice(0, start);
		const chip = makeChip(u.id, u.name);
		const after = document.createTextNode(' ' + full.slice(end));
		parent.insertBefore(chip, node.nextSibling);
		parent.insertBefore(after, chip.nextSibling);
		open = false;
		trigger = null;
		await tick();
		// Caret just after the inserted space.
		const sel = window.getSelection();
		const range = document.createRange();
		range.setStart(after, 1);
		range.collapse(true);
		sel?.removeAllRanges();
		sel?.addRange(range);
		root.focus();
		emit();
	}

	// `#` tagging: strip the typed `#query` from the body and hand the tag up to
	// the host (id for an existing tag, null to create `label`). Nothing is left
	// in the message text — the tag becomes a chip outside the editor.
	async function chooseTag(id: string | null, label: string) {
		if (!trigger || !root) return;
		const { node, start, end } = trigger;
		const full = node.textContent ?? '';
		node.textContent = full.slice(0, start) + full.slice(end);
		open = false;
		trigger = null;
		await tick();
		const sel = window.getSelection();
		const range = document.createRange();
		range.setStart(node, Math.min(start, (node.textContent ?? '').length));
		range.collapse(true);
		sel?.removeAllRanges();
		sel?.addRange(range);
		root.focus();
		emit();
		onTagAdd?.(id, label);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (open && optionCount && !e.metaKey && !e.ctrlKey) {
			if (e.key === 'ArrowDown') {
				activeIndex = (activeIndex + 1) % optionCount;
				e.preventDefault();
				return;
			}
			if (e.key === 'ArrowUp') {
				activeIndex = (activeIndex - 1 + optionCount) % optionCount;
				e.preventDefault();
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				if (mode === '@') void choose(candidates[activeIndex]);
				else if (activeIndex < tagMatches.length)
					void chooseTag(tagMatches[activeIndex].id, tagMatches[activeIndex].label);
				else if (showCreateTag) void chooseTag(null, query.trim());
				return;
			}
			if (e.key === 'Escape') {
				open = false;
				e.preventDefault();
				return;
			}
		}
		onkeydown?.(e);
	}

	function handleBlur() {
		// Delay so a click on a menu item registers before we close.
		setTimeout(() => (open = false), 120);
	}

	// Re-render only when the value changed from outside (initial, clear-on-send).
	$effect(() => {
		if (value !== lastEmitted) {
			render(value);
			lastEmitted = value;
		}
	});
</script>

<div class="relative">
	<div
		bind:this={root}
		role="textbox"
		tabindex="0"
		aria-multiline="true"
		contenteditable={!disabled}
		data-placeholder={placeholder}
		oninput={onInput}
		onkeydown={handleKeydown}
		onblur={handleBlur}
		style:min-height="{rows * 1.45}em"
		class="mention-input {cls} {isEmpty ? 'is-empty' : ''}"
	></div>

	{#if open && optionCount}
		<div
			use:autoPlace
			class="absolute top-full left-0 z-50 mt-1 max-w-[280px] min-w-[220px] rounded-[10px] border border-border bg-bg-elev p-1 shadow-lg"
		>
			{#if mode === '@'}
				{#each candidates as u, i (u.id)}
					<button
						type="button"
						onmousedown={(e) => {
							e.preventDefault();
							void choose(u);
						}}
						onmouseenter={() => (activeIndex = i)}
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left {i ===
						activeIndex
							? 'bg-surface-2 text-text'
							: 'text-text-2'}"
					>
						<Avatar user={u} size={20} />
						<span class="truncate text-[13px]">{u.name}</span>
					</button>
				{/each}
			{:else}
				{#each tagMatches as t, i (t.id)}
					<button
						type="button"
						onmousedown={(e) => {
							e.preventDefault();
							void chooseTag(t.id, t.label);
						}}
						onmouseenter={() => (activeIndex = i)}
						class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] {i ===
						activeIndex
							? 'bg-surface-2 text-text'
							: 'text-text-2'}"
					>
						<span class="h-2 w-2 rounded-full" style:background={t.color ?? '#7c7c84'}></span>
						<span class="truncate">{t.label}</span>
					</button>
				{/each}
				{#if showCreateTag}
					<button
						type="button"
						onmousedown={(e) => {
							e.preventDefault();
							void chooseTag(null, query.trim());
						}}
						onmouseenter={() => (activeIndex = tagMatches.length)}
						class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] {activeIndex ===
						tagMatches.length
							? 'bg-surface-2 text-text'
							: 'text-text-2'}"
					>
						<Icon name="plus" size={12} class="text-text-3" />
						<span class="truncate">{m.chat_tag_create({ label: query.trim() })}</span>
					</button>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.mention-input {
		white-space: pre-wrap;
		word-break: break-word;
	}
	/* Placeholder shown only while truly empty. */
	.mention-input.is-empty::before {
		content: attr(data-placeholder);
		color: var(--text-3);
		pointer-events: none;
	}
</style>
