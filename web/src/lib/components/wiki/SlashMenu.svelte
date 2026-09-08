<script lang="ts">
	// The "/" command menu. Items arrive already flat + filtered from
	// slash-command.svelte.ts; `activeIndex` indexes that flat list (keyboard
	// nav lives there). Here we only render: group the flat list into its
	// sections, keep the running flat index for hit-testing, and show each
	// block's markdown shortcut on the right — like Notion's menu.
	import { m } from '$lib/paraglide/messages';

	export type SlashItem = {
		id: string;
		label: string;
		hint: string;
		icon: string;
		section: 'basic' | 'media';
		shortcut?: string;
	};
	type State = {
		items: SlashItem[];
		activeIndex: number;
		rect: { left: number; bottom: number };
		onSelect: (index: number) => void;
	};

	let { state }: { state: State } = $props();

	const SECTION_LABEL: Record<SlashItem['section'], () => string> = {
		basic: m.wiki_slash_section_basic,
		media: m.wiki_slash_section_media
	};

	// Flat list → [header, item, item, header, item…] carrying each item's flat
	// index so selection/active state still line up with keyboard nav.
	type Row = { kind: 'header'; label: string } | { kind: 'item'; item: SlashItem; index: number };
	const rows = $derived.by<Row[]>(() => {
		const out: Row[] = [];
		let section: string | null = null;
		state.items.forEach((item, index) => {
			if (item.section !== section) {
				section = item.section;
				out.push({ kind: 'header', label: SECTION_LABEL[item.section]?.() ?? '' });
			}
			out.push({ kind: 'item', item, index });
		});
		return out;
	});

	const styleStr = $derived(
		`position: fixed; left: ${state.rect.left}px; top: ${state.rect.bottom + 6}px;`
	);

	// Keep the highlighted row in view as the arrows move it.
	// Plain binding: the effect below re-runs on activeIndex (a reactive prop),
	// and listEl is set on mount before any arrow key moves the selection.
	let listEl: HTMLDivElement | undefined;
	$effect(() => {
		const i = state.activeIndex;
		listEl?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });
	});
</script>

<div class="slash" style={styleStr} role="listbox">
	{#if state.items.length === 0}
		<div class="slash-empty">{m.wiki_slash_no_matches()}</div>
	{:else}
		<div bind:this={listEl} class="slash-list">
			{#each rows as row (row.kind === 'header' ? `h:${row.label}` : row.item.id)}
				{#if row.kind === 'header'}
					<div class="slash-section">{row.label}</div>
				{:else}
					{@const active = row.index === state.activeIndex}
					<button
						type="button"
						role="option"
						aria-selected={active}
						data-i={row.index}
						class="slash-item {active ? 'is-active' : ''}"
						onmousedown={(e) => {
							e.preventDefault();
							state.onSelect(row.index);
						}}
						onmouseenter={() => (state.activeIndex = row.index)}
					>
						<span class="slash-icon">{row.item.icon}</span>
						<span class="slash-text">
							<span class="slash-label">{row.item.label}</span>
							<span class="slash-hint">{row.item.hint}</span>
						</span>
						{#if row.item.shortcut}
							<span class="slash-shortcut">{row.item.shortcut}</span>
						{/if}
					</button>
				{/if}
			{/each}
		</div>
		<div class="slash-footer">
			<span>{m.wiki_slash_close()}</span>
			<kbd class="slash-kbd">esc</kbd>
		</div>
	{/if}
</div>

<style>
	.slash {
		z-index: 60;
		width: 300px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--bg-elev);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.02) inset,
			0 12px 34px rgba(0, 0, 0, 0.36);
		overflow: hidden;
	}
	.slash-empty {
		padding: 14px 14px;
		font-size: 13px;
		color: var(--text-4);
	}
	.slash-list {
		max-height: 344px;
		overflow-y: auto;
		padding: 6px;
		scrollbar-width: thin;
		scrollbar-color: var(--border-strong) transparent;
	}
	.slash-list::-webkit-scrollbar {
		width: 10px;
	}
	.slash-list::-webkit-scrollbar-thumb {
		background: var(--border-strong);
		border: 3px solid var(--bg-elev);
		border-radius: 999px;
	}
	.slash-section {
		padding: 10px 8px 4px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-4);
	}
	.slash-section:first-child {
		padding-top: 4px;
	}
	.slash-item {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 10px;
		border-radius: 8px;
		padding: 6px 8px;
		text-align: left;
		color: var(--text-2);
		transition:
			background-color 0.1s,
			color 0.1s;
	}
	.slash-item.is-active {
		background: var(--surface-2);
		color: var(--text);
	}
	.slash-icon {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		flex-shrink: 0;
		border-radius: 7px;
		border: 1px solid var(--border);
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: 12px;
		line-height: 1;
		color: var(--text-2);
	}
	.slash-item.is-active .slash-icon {
		border-color: var(--border-strong);
		color: var(--text);
	}
	.slash-text {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
		gap: 1px;
	}
	.slash-label {
		font-size: 14px;
		line-height: 1.3;
		color: var(--text);
	}
	.slash-hint {
		font-size: 12px;
		line-height: 1.2;
		color: var(--text-4);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.slash-shortcut {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--text-4);
		padding-left: 8px;
	}
	.slash-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		border-top: 1px solid var(--border);
		padding: 8px 12px;
		font-size: 12px;
		color: var(--text-4);
	}
	.slash-kbd {
		font-family: var(--font-mono);
		font-size: 10.5px;
		line-height: 1;
		padding: 3px 6px;
		border-radius: 5px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-3);
	}
</style>
