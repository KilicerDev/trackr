<script lang="ts">
	// Markdown + mention renderer for user-authored text (chat messages,
	// comments, descriptions). Renders marked's lexer tokens directly with
	// Svelte markup — never `@html` — so raw HTML in a message shows as literal
	// text and there is no XSS surface. Mentions render as accent pills; the
	// stored display name is the fallback when the id no longer resolves.
	import type { Token, Tokens } from 'marked';
	import {
		lexMarkdown,
		splitMentionParts,
		safeHref,
		type MarkdownFlavor
	} from '$lib/utils/markdown';
	import { resolveUser } from '$lib/stores/lookup.svelte';

	interface Props {
		text: string | null | undefined;
		class?: string;
		// `chat` (default): headings/tables render as plain text. `document`
		// (descriptions): full block set.
		flavor?: MarkdownFlavor;
	}
	let { text, class: cls = '', flavor = 'chat' }: Props = $props();

	const parsed = $derived(lexMarkdown(text ?? ''));

	// The marked Token union doesn't narrow inside Svelte template `{#if}`s —
	// tiny typed casts keep the template readable.
	const asLink = (t: Token) => t as Tokens.Link;
	const asList = (t: Token) => t as Tokens.List;
	const asTable = (t: Token) => t as Tokens.Table;
	const asHeading = (t: Token) => t as Tokens.Heading;
	const sub = (t: Token): Token[] => (t as { tokens?: Token[] }).tokens ?? [];
	const rawOf = (t: Token): string => (t as { raw?: string }).raw ?? '';
	const textOf = (t: Token): string => (t as { text?: string }).text ?? '';
</script>

{#snippet mtext(
	value: string
)}{#each splitMentionParts(value, parsed.mentions) as part, i (i)}{#if part.type === 'mention'}<span
				class="-mx-0.5 inline-flex items-center rounded bg-accent/10 px-1 align-baseline font-medium text-accent"
				>@{resolveUser(part.id)?.name ?? part.name}</span
			>{:else}{part.value}{/if}{/each}{/snippet}

{#snippet inline(
	toks: Token[]
)}{#each toks as tok, i (i)}{#if tok.type === 'text'}{#if sub(tok).length}{@render inline(
					sub(tok)
				)}{:else}{@render mtext(textOf(tok))}{/if}{:else if tok.type === 'escape'}{textOf(
				tok
			)}{:else if tok.type === 'strong'}<strong>{@render inline(sub(tok))}</strong
			>{:else if tok.type === 'em'}<em>{@render inline(sub(tok))}</em
			>{:else if tok.type === 'del'}<del>{@render inline(sub(tok))}</del
			>{:else if tok.type === 'codespan'}<code>{textOf(tok)}</code>{:else if tok.type === 'br'}<br
			/>{:else if tok.type === 'link'}{#if safeHref(asLink(tok).href)}<a
					href={safeHref(asLink(tok).href)}
					target="_blank"
					rel="noopener noreferrer">{@render inline(sub(tok))}</a
				>{:else}{@render inline(sub(tok))}{/if}{:else}{@render mtext(
				rawOf(tok)
			)}{/if}{/each}{/snippet}

{#snippet blocks(toks: Token[])}
	{#each toks as tok, i (i)}
		{#if tok.type === 'paragraph'}
			<p>{@render inline(sub(tok))}</p>
		{:else if tok.type === 'heading'}
			{#if flavor === 'document'}
				<svelte:element this={`h${Math.min(asHeading(tok).depth, 4)}`}
					>{@render inline(sub(tok))}</svelte:element
				>
			{:else}
				<!-- Chat: a heading is just an emphasized line, never a page title. -->
				<p class="font-semibold">{@render inline(sub(tok))}</p>
			{/if}
		{:else if tok.type === 'blockquote'}
			<blockquote>{@render blocks(sub(tok))}</blockquote>
		{:else if tok.type === 'code'}
			<pre><code>{textOf(tok)}</code></pre>
		{:else if tok.type === 'list'}
			{@const list = asList(tok)}
			<svelte:element
				this={list.ordered ? 'ol' : 'ul'}
				start={list.ordered ? list.start || 1 : undefined}
			>
				{#each list.items as item, j (j)}
					<li class={item.task ? 'task' : ''}>
						{#if item.task}<input
								type="checkbox"
								checked={item.checked}
								disabled
							/>{/if}{@render blocks(item.tokens)}
					</li>
				{/each}
			</svelte:element>
		{:else if tok.type === 'hr'}
			<hr />
		{:else if tok.type === 'table' && flavor === 'document'}
			{@const table = asTable(tok)}
			<div class="table-scroll">
				<table>
					<thead>
						<tr>
							{#each table.header as cell, j (j)}
								<th>{@render inline(cell.tokens)}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each table.rows as row, j (j)}
							<tr>
								{#each row as cell, k (k)}
									<td>{@render inline(cell.tokens)}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if tok.type === 'text'}
			<!-- Block-level text (tight list items): inline, no paragraph box. -->
			{#if sub(tok).length}{@render inline(sub(tok))}{:else}{@render mtext(textOf(tok))}{/if}
		{:else if tok.type === 'space' || tok.type === 'checkbox'}
			<!-- checkbox tokens are redundant: the li renders its own input from item.task -->
		{:else}
			<!-- Tables in chat, raw HTML blocks, anything unknown: literal text. -->
			<p class="whitespace-pre-wrap">{@render mtext(rawOf(tok))}</p>
		{/if}
	{/each}
{/snippet}

<div class="mdtext [overflow-wrap:anywhere] whitespace-normal {cls}">
	{@render blocks(parsed.tokens)}
</div>

<style>
	/* Rhythm + chrome for rendered markdown. Sizes are relative so the text
	   inherits each surface's font-size/color. */
	.mdtext > :global(:first-child) {
		margin-top: 0;
	}
	.mdtext > :global(:last-child) {
		margin-bottom: 0;
	}
	.mdtext p {
		margin: 0.45em 0;
	}
	.mdtext h1,
	.mdtext h2,
	.mdtext h3,
	.mdtext h4 {
		margin: 0.8em 0 0.35em;
		font-weight: 600;
		line-height: 1.3;
	}
	.mdtext h1 {
		font-size: 1.25em;
	}
	.mdtext h2 {
		font-size: 1.15em;
	}
	.mdtext h3,
	.mdtext h4 {
		font-size: 1.05em;
	}
	.mdtext ul,
	.mdtext ol {
		margin: 0.45em 0;
		padding-left: 1.4em;
	}
	.mdtext ul {
		list-style: disc;
	}
	.mdtext ol {
		list-style: decimal;
	}
	.mdtext li {
		margin: 0.15em 0;
	}
	.mdtext li.task {
		list-style: none;
		margin-left: -1.4em;
	}
	.mdtext li.task input {
		margin-right: 0.45em;
		vertical-align: -0.1em;
		accent-color: var(--color-accent);
	}
	.mdtext code {
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
		font-size: 0.9em;
		background: var(--color-surface-2, rgba(127, 127, 127, 0.15));
		border: 1px solid var(--color-border);
		border-radius: 5px;
		padding: 0.08em 0.35em;
	}
	.mdtext pre {
		margin: 0.55em 0;
		padding: 0.7em 0.85em;
		background: var(--color-surface-2, rgba(127, 127, 127, 0.12));
		border: 1px solid var(--color-border);
		border-radius: 10px;
		overflow-x: auto;
	}
	.mdtext pre code {
		background: none;
		border: none;
		padding: 0;
		font-size: 0.88em;
		white-space: pre;
	}
	.mdtext blockquote {
		margin: 0.55em 0;
		padding: 0.1em 0 0.1em 0.8em;
		border-left: 3px solid var(--color-border-strong, var(--color-border));
		color: var(--color-text-3);
	}
	.mdtext hr {
		border: none;
		border-top: 1px solid var(--color-border);
		margin: 0.9em 0;
	}
	.mdtext a {
		color: var(--color-accent);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.mdtext a:hover {
		color: var(--color-accent-strong, var(--color-accent));
	}
	.mdtext .table-scroll {
		overflow-x: auto;
		margin: 0.55em 0;
	}
	.mdtext table {
		border-collapse: collapse;
		font-size: 0.95em;
	}
	.mdtext th,
	.mdtext td {
		border: 1px solid var(--color-border);
		padding: 0.3em 0.6em;
		text-align: left;
	}
	.mdtext th {
		background: var(--color-surface-2, rgba(127, 127, 127, 0.1));
		font-weight: 600;
	}
</style>
