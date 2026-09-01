<script lang="ts">
	// WYSIWYG input for messages, comments, and descriptions (Tiptap). The
	// bound `value` is a markdown string with `@[Name](id)` mention tokens and
	// `~[SIWEB-15](task:id)` entity-ref tokens — the exact wire format the old
	// plain composers produced — so hosts, server actions, and notifications
	// are untouched. Typing markdown (`**bold**`, `- `, `> `, backticks)
	// formats live via StarterKit's input rules; `@` mentions, `#` tags and
	// `!` entity refs share one dropdown UX.
	import { onDestroy, onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import Placeholder from '@tiptap/extension-placeholder';
	import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
	import { PluginKey } from '@tiptap/pm/state';
	import { page } from '$app/state';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { m } from '$lib/paraglide/messages';
	import {
		messageSchemaExtensions,
		docToMarkdown,
		markdownToEditorHtml
	} from '$lib/editor/message';
	import type { ChatTag } from '$lib/server/chat';
	import { REF_TYPES, type RefCandidate, type RefType } from '$lib/utils/refs';

	type MentionUser = {
		id: string;
		name: string;
		email: string;
		initials: string;
		color: string;
		status: 'active' | 'invited' | 'disabled';
		internal?: boolean;
		projectIds?: string[];
	};

	interface Props {
		/** Markdown with `@[Name](id)` mention tokens. */
		value: string;
		placeholder?: string;
		disabled?: boolean;
		rows?: number;
		/** Growth cap: grows with content from `rows` up to this, then scrolls. */
		maxRows?: number;
		/** Classes applied to the editable surface (padding, text size, …). */
		class?: string;
		/** Host keydown (e.g. Composer's Cmd+Enter to send). */
		onkeydown?: (e: KeyboardEvent) => void;
		/** Called with the serialized markdown on every edit (besides `bind:value`). */
		onchange?: (markdown: string) => void;
		/** Editor lost focus — hosts use this for save-on-blur (Inspector). */
		onblur?: () => void;
		/** Scope @-mention candidates to people with access to this project. */
		projectId?: string | null;
		/** Override the @-mention directory (defaults to layout `users`). */
		users?: MentionUser[];
		/** Opt-in `#` tagging (chat) — see MentionTextarea's old contract. */
		tags?: ChatTag[];
		onTagAdd?: (id: string | null, label: string) => void;
		/** `document` adds headings — for description fields. */
		flavor?: 'chat' | 'document';
		/** Disable @-mentions entirely (descriptions — the server doesn't parse them there). */
		mentions?: boolean;
		/**
		 * Entity types the `!` reference picker offers; omit to disable it.
		 * Customer-visible surfaces (ticket threads, org chat) pass ['ticket']
		 * only — a task/project pill in shared content would leak internal
		 * structure to portal users, regardless of who typed it.
		 */
		refTypes?: RefType[];
		/** Scope `!` ticket suggestions to one org (customer-visible surfaces). */
		refOrgId?: string | null;
	}
	let {
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		rows = 2,
		maxRows = 7,
		class: cls = '',
		onkeydown,
		onchange,
		onblur,
		projectId = null,
		users,
		tags,
		onTagAdd,
		flavor = 'chat',
		mentions = true,
		refTypes,
		refOrgId = null
	}: Props = $props();

	let host: HTMLDivElement | undefined = $state();
	let editor: Editor | undefined;
	let ready = $state(false);
	// The value we last pushed up — lets the sync effect tell an external
	// change (clear-on-send, ticket switch) apart from our own edits.
	let lastEmitted: string | null = null;

	// ── Suggestion dropdown (one menu, '@', '#' or '!' mode) ─────────────────
	let menu = $state<{
		kind: '@' | '#' | '!';
		query: string;
		command: (props: unknown) => void;
	} | null>(null);
	let menuEl = $state<HTMLDivElement | null>(null);
	// The Suggestion plugin has no blur handling — it stays active while the
	// caret sits in the @query, so the menu would linger after focus leaves.
	// Gate visibility on focus instead: blur hides it, and re-focusing with
	// the caret still inside the query shows it again (option clicks use
	// mousedown+preventDefault, so they never blur the editor).
	let focused = $state(false);
	let activeIndex = $state(0);

	const candidates = $derived.by<MentionUser[]>(() => {
		if (menu?.kind !== '@') return [];
		const directory = users ?? (page.data as { users?: MentionUser[] }).users ?? [];
		const all = directory.filter(
			(u) =>
				u.status !== 'disabled' &&
				(!projectId || u.internal || (u.projectIds ?? []).includes(projectId))
		);
		const needle = menu.query.toLowerCase();
		const matches = needle
			? all.filter(
					(u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
				)
			: all;
		return matches.sort(
			(a, b) =>
				a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
				a.email.localeCompare(b.email, undefined, { sensitivity: 'base' }) ||
				a.id.localeCompare(b.id)
		);
	});

	const tagMatches = $derived.by<ChatTag[]>(() => {
		if (menu?.kind !== '#' || !tags) return [];
		const needle = menu.query.toLowerCase();
		return tags.filter((t) => t.label.toLowerCase().includes(needle)).slice(0, 6);
	});
	const showCreateTag = $derived(
		menu?.kind === '#' &&
			!!onTagAdd &&
			menu.query.trim().length > 0 &&
			!(tags ?? []).some((t) => t.label.toLowerCase() === menu!.query.trim().toLowerCase())
	);
	// ── `!` entity refs: debounced remote search (the entity lists are too big
	// to preload, unlike the user directory). Empty query → recent items.
	let refItems = $state<RefCandidate[]>([]);
	let refTimer: ReturnType<typeof setTimeout> | undefined;
	let refAbort: AbortController | undefined;

	async function fetchRefs(query: string) {
		refAbort?.abort();
		const ctrl = new AbortController();
		refAbort = ctrl;
		let params = `q=${encodeURIComponent(query)}&types=${encodeURIComponent((refTypes ?? []).join(','))}`;
		if (refOrgId) params += `&orgId=${encodeURIComponent(refOrgId)}`;
		try {
			const res = await fetch(`/api/v1/search?${params}`, { signal: ctrl.signal });
			if (!res.ok || ctrl !== refAbort) return;
			const data = (await res.json()) as { results: RefCandidate[] };
			if (ctrl !== refAbort) return;
			// The refTypes prop order doubles as display priority — task surfaces
			// list tasks first, ticket surfaces tickets (stable within a type).
			const order = refTypes ?? [];
			refItems = data.results
				.filter((r) => (REF_TYPES as readonly string[]).includes(r.type) && r.displayId)
				.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
		} catch {
			// Aborted or offline — keep whatever the menu currently shows.
		}
	}

	$effect(() => {
		if (menu?.kind !== '!') return;
		const q = menu.query;
		clearTimeout(refTimer);
		// Recents (empty query) fetch immediately so the menu never opens blank.
		refTimer = setTimeout(() => fetchRefs(q), q ? 180 : 0);
	});

	// Group ref candidates by type for section headers (mixed menus are hard to
	// scan as one flat list). Items keep their flat refItems index so keyboard
	// navigation and pick() stay untouched.
	const refGroupLabels: Record<RefType, () => string> = {
		ticket: m.shell_nav_tickets,
		task: m.shell_nav_tasks,
		project: m.shell_nav_projects
	};
	const refGroups = $derived.by(() => {
		if (menu?.kind !== '!') return [];
		const groups: { type: RefType; items: { r: RefCandidate; idx: number }[] }[] = [];
		refItems.forEach((r, idx) => {
			let g = groups.find((x) => x.type === r.type);
			if (!g) groups.push((g = { type: r.type, items: [] }));
			g.items.push({ r, idx });
		});
		return groups;
	});

	const optionCount = $derived(
		menu?.kind === '@'
			? candidates.length
			: menu?.kind === '!'
				? refItems.length
				: tagMatches.length + (showCreateTag ? 1 : 0)
	);

	function pick(index: number) {
		if (!menu) return;
		if (menu.kind === '@') {
			const u = candidates[index];
			if (u) menu.command(u);
		} else if (menu.kind === '!') {
			const r = refItems[index];
			if (r) menu.command({ id: r.id, type: r.type, display: r.displayId });
		} else if (index < tagMatches.length) {
			menu.command({ id: tagMatches[index].id, label: tagMatches[index].label });
		} else if (showCreateTag) {
			menu.command({ id: null, label: menu.query.trim() });
		}
		menu = null;
	}

	// The menu owns a key it handles: mark the event consumed so outer layers
	// (the Drawer's window-level Escape, host shortcuts) don't also act on it —
	// Escape must close just the menu first, and only a second press the drawer.
	function consume(e: KeyboardEvent): true {
		e.preventDefault();
		e.stopPropagation();
		return true;
	}

	function menuKey(e: KeyboardEvent): boolean {
		if (!menu || !optionCount || e.metaKey || e.ctrlKey) return false;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			activeIndex = (activeIndex + (e.key === 'ArrowDown' ? 1 : -1) + optionCount) % optionCount;
			menuEl
				?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
				?.scrollIntoView({ block: 'nearest' });
			return consume(e);
		}
		if (e.key === 'Enter' || e.key === 'Tab') {
			pick(activeIndex);
			return consume(e);
		}
		if (e.key === 'Escape') {
			menu = null;
			return consume(e);
		}
		return false;
	}

	function suggestionRender(kind: '@' | '#' | '!') {
		return () => ({
			onStart: (p: SuggestionProps) => {
				menu = { kind, query: p.query, command: p.command as (props: unknown) => void };
				activeIndex = 0;
			},
			onUpdate: (p: SuggestionProps) => {
				menu = { kind, query: p.query, command: p.command as (props: unknown) => void };
				activeIndex = 0;
			},
			onKeyDown: (p: { event: KeyboardEvent }) => menuKey(p.event),
			onExit: () => {
				if (menu?.kind === kind) menu = null;
			}
		});
	}

	onMount(() => {
		if (!host) return;
		editor = new Editor({
			element: host,
			editable: !disabled,
			editorProps: {
				attributes: { class: `rt-content ${cls}`, role: 'textbox', 'aria-multiline': 'true' },
				// Direct props run before plugins. The suggestion menu gets
				// first claim: registerPlugin appends the Suggestion plugin
				// AFTER the base keymap, so without this Enter hits splitBlock
				// (newline) before the menu's own onKeyDown ever runs. Then the
				// host handler (Cmd+Enter send) — stop if it consumed the
				// event, so the base keymap's Mod-Enter can't also fire into a
				// cleared doc.
				handleKeyDown: (_view, e) => {
					if (menuKey(e)) return true;
					onkeydown?.(e);
					return e.defaultPrevented;
				}
			},
			extensions: [
				...messageSchemaExtensions({ flavor, mentions }),
				Placeholder.configure({ placeholder })
			],
			onUpdate: ({ editor }) => {
				const md = docToMarkdown(editor.state.doc);
				lastEmitted = md;
				value = md;
				onchange?.(md);
			},
			onFocus: () => (focused = true),
			onBlur: () => {
				focused = false;
				onblur?.();
			}
		});
		if (value) {
			editor.commands.setContent(markdownToEditorHtml(value), { emitUpdate: false });
		}
		lastEmitted = value;

		if (mentions) {
			editor.registerPlugin(
				Suggestion<unknown, MentionUser>({
					editor,
					char: '@',
					pluginKey: new PluginKey('rtMention'),
					items: () => [],
					command: ({ editor, range, props }) => {
						editor
							.chain()
							.focus()
							.insertContentAt(range, [
								{ type: 'mention', attrs: { id: props.id, name: props.name } },
								{ type: 'text', text: ' ' }
							])
							.run();
					},
					render: suggestionRender('@')
				})
			);
		}
		if (tags && onTagAdd) {
			editor.registerPlugin(
				Suggestion<unknown, { id: string | null; label: string }>({
					editor,
					char: '#',
					pluginKey: new PluginKey('rtTag'),
					items: () => [],
					// The typed `#query` is removed and the tag handed to the host
					// as a chip — nothing stays in the message text.
					command: ({ editor, range, props }) => {
						editor.chain().focus().deleteRange(range).run();
						onTagAdd?.(props.id, props.label);
					},
					render: suggestionRender('#')
				})
			);
		}
		// `!` entity refs need the entityRef node, which rides the mentions gate.
		if (mentions && refTypes?.length) {
			editor.registerPlugin(
				Suggestion<unknown, { id: string; type: RefType; display: string }>({
					editor,
					char: '!',
					pluginKey: new PluginKey('rtRef'),
					items: () => [],
					command: ({ editor, range, props }) => {
						editor
							.chain()
							.focus()
							.insertContentAt(range, [
								{
									type: 'entityRef',
									attrs: { id: props.id, type: props.type, display: props.display }
								},
								{ type: 'text', text: ' ' }
							])
							.run();
					},
					render: suggestionRender('!')
				})
			);
		}
		ready = true;
	});

	// External value change (clear-on-send, entity switch) → re-hydrate.
	$effect(() => {
		const v = value;
		if (ready && editor && v !== lastEmitted) {
			lastEmitted = v;
			editor.commands.setContent(v ? markdownToEditorHtml(v) : '', { emitUpdate: false });
		}
	});

	$effect(() => {
		if (ready && editor && editor.isEditable === disabled) editor.setEditable(!disabled);
	});

	onDestroy(() => {
		clearTimeout(refTimer);
		refAbort?.abort();
		editor?.destroy();
		editor = undefined;
	});
</script>

<div class="relative">
	<div
		bind:this={host}
		class="rt"
		style:--rt-min="{rows * 1.45}em"
		style:--rt-max="{maxRows * 1.45}em"
	></div>

	{#if menu && optionCount && focused}
		<div
			bind:this={menuEl}
			use:autoPlace
			class="absolute top-full left-0 z-50 mt-1 max-h-64 max-w-[308px] min-w-[242px] overflow-y-auto overscroll-contain rounded-[10px] border border-border bg-bg-elev p-1 shadow-lg"
		>
			{#if menu.kind === '@'}
				{#each candidates as u, i (u.id)}
					<button
						type="button"
						data-option-index={i}
						onmousedown={(e) => {
							e.preventDefault();
							pick(i);
						}}
						onmouseenter={() => (activeIndex = i)}
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left {i ===
						activeIndex
							? 'bg-surface-2 text-text'
							: 'text-text-2'}"
					>
						<Avatar user={u} size={22} />
						<span class="truncate text-[14px]">{u.name}</span>
					</button>
				{/each}
			{:else if menu.kind === '!'}
				{#each refGroups as g (g.type)}
					{#if refGroups.length > 1}
						<div
							class="px-2 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider text-text-3 uppercase first:pt-1"
						>
							{refGroupLabels[g.type]()}
						</div>
					{/if}
					{#each g.items as it (it.r.type + it.r.id)}
						<button
							type="button"
							data-option-index={it.idx}
							onmousedown={(e) => {
								e.preventDefault();
								pick(it.idx);
							}}
							onmouseenter={() => (activeIndex = it.idx)}
							class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] {it.idx ===
							activeIndex
								? 'bg-surface-2 text-text'
								: 'text-text-2'}"
						>
							<span
								class="shrink-0 rounded bg-accent/10 px-1 font-mono text-[11px] font-medium text-accent"
								>{it.r.displayId}</span
							>
							<span class="truncate">{it.r.title}</span>
						</button>
					{/each}
				{/each}
			{:else}
				{#each tagMatches as t, i (t.id)}
					<button
						type="button"
						data-option-index={i}
						onmousedown={(e) => {
							e.preventDefault();
							pick(i);
						}}
						onmouseenter={() => (activeIndex = i)}
						class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] {i ===
						activeIndex
							? 'bg-surface-2 text-text'
							: 'text-text-2'}"
					>
						<span class="h-2 w-2 rounded-full" style:background={t.color ?? '#7c7c84'}></span>
						<span class="truncate">{t.label}</span>
					</button>
				{/each}
				{#if showCreateTag && menu}
					<button
						type="button"
						data-option-index={tagMatches.length}
						onmousedown={(e) => {
							e.preventDefault();
							pick(tagMatches.length);
						}}
						onmouseenter={() => (activeIndex = tagMatches.length)}
						class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] {activeIndex ===
						tagMatches.length
							? 'bg-surface-2 text-text'
							: 'text-text-2'}"
					>
						<Icon name="plus" size={13} class="text-text-3" />
						<span class="truncate">{m.chat_tag_create({ label: menu.query.trim() })}</span>
					</button>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	/* The editable surface. Host-passed classes (padding, text size) land on
	   .rt-content via editorProps; sizing and markdown chrome live here. */
	.rt :global(.rt-content) {
		min-height: var(--rt-min);
		max-height: var(--rt-max);
		overflow-y: auto;
		overscroll-behavior: contain;
		outline: none;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.rt :global(.rt-content p) {
		margin: 0.15em 0;
	}
	.rt :global(.rt-content h1),
	.rt :global(.rt-content h2),
	.rt :global(.rt-content h3) {
		margin: 0.5em 0 0.25em;
		font-weight: 600;
		line-height: 1.3;
	}
	.rt :global(.rt-content h1) {
		font-size: 1.25em;
	}
	.rt :global(.rt-content h2) {
		font-size: 1.15em;
	}
	.rt :global(.rt-content h3) {
		font-size: 1.05em;
	}
	.rt :global(.rt-content ul),
	.rt :global(.rt-content ol) {
		margin: 0.25em 0;
		padding-left: 1.4em;
	}
	.rt :global(.rt-content ul) {
		list-style: disc;
	}
	.rt :global(.rt-content ol) {
		list-style: decimal;
	}
	.rt :global(.rt-content blockquote) {
		margin: 0.35em 0;
		padding-left: 0.8em;
		border-left: 3px solid var(--color-border-strong, var(--color-border));
		color: var(--color-text-3);
	}
	.rt :global(.rt-content code) {
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
		font-size: 0.9em;
		background: var(--color-surface-2, rgba(127, 127, 127, 0.15));
		border: 1px solid var(--color-border);
		border-radius: 5px;
		padding: 0.08em 0.35em;
	}
	.rt :global(.rt-content pre) {
		margin: 0.35em 0;
		padding: 0.6em 0.8em;
		background: var(--color-surface-2, rgba(127, 127, 127, 0.12));
		border: 1px solid var(--color-border);
		border-radius: 10px;
		overflow-x: auto;
	}
	.rt :global(.rt-content pre code) {
		background: none;
		border: none;
		padding: 0;
		white-space: pre;
	}
	.rt :global(.rt-content a) {
		color: var(--color-accent);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.rt :global(.rt-content hr) {
		border: none;
		border-top: 1px solid var(--color-border);
		margin: 0.7em 0;
	}
	/* Tiptap Placeholder: shown on the empty first paragraph. */
	.rt :global(p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		color: var(--color-text-3);
		float: left;
		height: 0;
		pointer-events: none;
	}
</style>
