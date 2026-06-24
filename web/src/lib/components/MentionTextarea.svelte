<script lang="ts">
	/* eslint-disable svelte/no-dom-manipulating --
	   This is a contenteditable mention editor. Its children (text + chip nodes)
	   are managed imperatively here, not declaratively by Svelte — the template
	   `root` div is intentionally empty, so there's no Svelte-rendered DOM for the
	   runtime to get out of sync with. */
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { buildMentionToken, segmentMentions } from '$lib/mentions';
	import { resolveUser } from '$lib/lookup.svelte';
	import Avatar from './Avatar.svelte';

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
	}
	let {
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		rows = 2,
		class: cls = '',
		onkeydown,
		projectId = null
	}: Props = $props();

	let root = $state<HTMLDivElement | null>(null);
	let open = $state(false);
	let query = $state('');
	let activeIndex = $state(0);
	let isEmpty = $state(true);
	// The value we last pushed up — lets the sync effect tell an external change
	// (clear-on-send, reset) apart from our own edits, so we never re-render the
	// DOM mid-edit and blow away the caret.
	let lastEmitted: string | null = null;
	// Text node + offsets of the active `@query` being typed.
	let trigger: { node: Text; start: number; end: number } | null = null;

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
		const match = before.match(/(?:^|\s)@([\p{L}\d_.-]*)$/u);
		if (!match) return;
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

	function handleKeydown(e: KeyboardEvent) {
		if (open && candidates.length && !e.metaKey && !e.ctrlKey) {
			if (e.key === 'ArrowDown') {
				activeIndex = (activeIndex + 1) % candidates.length;
				e.preventDefault();
				return;
			}
			if (e.key === 'ArrowUp') {
				activeIndex = (activeIndex - 1 + candidates.length) % candidates.length;
				e.preventDefault();
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				void choose(candidates[activeIndex]);
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

	{#if open && candidates.length}
		<div
			use:autoPlace
			class="absolute top-full left-0 z-50 mt-1 max-w-[280px] min-w-[220px] rounded-[10px] border border-border bg-bg-elev p-1"
			style:box-shadow="var(--shadow-lg)"
		>
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
