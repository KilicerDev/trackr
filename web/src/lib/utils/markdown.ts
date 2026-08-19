// Shared markdown model for user-authored text: chat messages, comments,
// task/ticket descriptions. The client renders lexer tokens with Svelte
// (never `@html` — raw HTML in a message renders as literal text, so there is
// no XSS surface and no sanitizer); the server builds fully-escaped HTML for
// notification emails from the same token walk.
//
// Mention tokens (`@[Name](id)`) are valid markdown *link* syntax, so they are
// extracted into private-use-codepoint sentinels before lexing and resolved
// again by the consumer — the lexer never sees them.

import { Marked, type Token, type Tokens } from 'marked';
import { MENTION_RE, plainifyMentions } from './mentions';

/**
 * `chat`: message bubbles — no headings/tables (they render as plain text so a
 * stray `#` can't blow up a chat line), newlines are hard breaks.
 * `document`: descriptions — full block set including headings and tables.
 */
export type MarkdownFlavor = 'chat' | 'document';

export type MentionRef = { id: string; name: string };

// `breaks: true` — chat and descriptions both treat a single newline as a line
// break, matching how the text was authored in a plain composer for years.
const parser = new Marked({ gfm: true, breaks: true });

const M_OPEN = '\uE000';
const M_CLOSE = '\uE001';
export const MENTION_SENTINEL_RE = /\uE000(\d+)\uE001/g;
const SENTINEL_RE = MENTION_SENTINEL_RE;

/**
 * Replace mention tokens with numeric sentinels so markdown parsing can't
 * mistake them for links. Consumers resolve sentinels via the returned refs.
 */
export function guardMentions(text: string): { guarded: string; mentions: MentionRef[] } {
	const mentions: MentionRef[] = [];
	const guarded = text.replace(MENTION_RE, (_full, name: string, id: string) => {
		mentions.push({ id, name });
		return `${M_OPEN}${mentions.length - 1}${M_CLOSE}`;
	});
	return { guarded, mentions };
}

export interface ParsedMarkdown {
	tokens: Token[];
	mentions: MentionRef[];
}

/** Lex `text`, with mention tokens protected as sentinels (see module docs). */
export function lexMarkdown(text: string): ParsedMarkdown {
	const { guarded, mentions } = guardMentions(text);
	return { tokens: parser.lexer(guarded), mentions };
}

export type TextPart =
	| { type: 'text'; value: string }
	| { type: 'mention'; id: string; name: string };

/** Split a token's text on mention sentinels back into text/mention parts. */
export function splitMentionParts(value: string, mentions: MentionRef[]): TextPart[] {
	const parts: TextPart[] = [];
	let last = 0;
	for (const match of value.matchAll(SENTINEL_RE)) {
		const start = match.index ?? 0;
		if (start > last) parts.push({ type: 'text', value: value.slice(last, start) });
		const ref = mentions[Number(match[1])];
		if (ref) parts.push({ type: 'mention', id: ref.id, name: ref.name });
		last = start + match[0].length;
	}
	if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
	return parts;
}

/** Only http(s) links are rendered as anchors; anything else stays text. */
export function safeHref(href: string | undefined | null): string | null {
	if (!href) return null;
	return /^https?:\/\//i.test(href) ? href : null;
}

// ─── Email rendering (server) ────────────────────────────────────────────────
// Fully-escaped HTML built by walking the same tokens. Inline styles only —
// email clients ignore stylesheets. Mentions arrive pre-flattened by the
// notify pipeline (plainifyMentions), but sentinels are resolved defensively
// anyway.

function esc(s: string): string {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

const CODE_STYLE =
	'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;background:#f2f2f4;border-radius:4px;padding:1px 4px;';
const PRE_STYLE =
	'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;background:#f2f2f4;border-radius:8px;padding:10px 12px;overflow-x:auto;margin:8px 0;white-space:pre-wrap;';
const QUOTE_STYLE = 'border-left:3px solid #d9d9de;margin:8px 0;padding:2px 0 2px 12px;color:#666;';

function inlineHtml(tokens: Token[] | undefined, mentions: MentionRef[]): string {
	if (!tokens) return '';
	let out = '';
	for (const tok of tokens) {
		switch (tok.type) {
			case 'text': {
				const t = tok as Tokens.Text;
				if (t.tokens?.length) out += inlineHtml(t.tokens, mentions);
				else out += textHtml(t.text, mentions);
				break;
			}
			case 'escape':
				out += esc((tok as Tokens.Escape).text);
				break;
			case 'strong':
				out += `<strong>${inlineHtml((tok as Tokens.Strong).tokens, mentions)}</strong>`;
				break;
			case 'em':
				out += `<em>${inlineHtml((tok as Tokens.Em).tokens, mentions)}</em>`;
				break;
			case 'del':
				out += `<del>${inlineHtml((tok as Tokens.Del).tokens, mentions)}</del>`;
				break;
			case 'codespan':
				out += `<code class="em-md-code" style="${CODE_STYLE}">${esc((tok as Tokens.Codespan).text)}</code>`;
				break;
			case 'br':
				out += '<br />';
				break;
			case 'link': {
				const l = tok as Tokens.Link;
				const href = safeHref(l.href);
				const inner = inlineHtml(l.tokens, mentions);
				out += href
					? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
					: inner;
				break;
			}
			// Raw HTML and images are neutralized to their literal source text.
			default:
				out += textHtml('raw' in tok ? (tok.raw ?? '') : '', mentions);
		}
	}
	return out;
}

function textHtml(value: string, mentions: MentionRef[]): string {
	return splitMentionParts(value, mentions)
		.map((p) => (p.type === 'mention' ? `<strong>@${esc(p.name)}</strong>` : esc(p.value)))
		.join('');
}

function blockHtml(tokens: Token[], mentions: MentionRef[]): string {
	let out = '';
	for (const tok of tokens) {
		switch (tok.type) {
			case 'space':
				break;
			case 'checkbox':
				out += (tok as { checked?: boolean }).checked ? '&#9745; ' : '&#9744; ';
				break;
			case 'paragraph':
				out += `<p style="margin:6px 0;">${inlineHtml((tok as Tokens.Paragraph).tokens, mentions)}</p>`;
				break;
			// Emails keep headings modest — chat-sized emphasis, not page titles.
			case 'heading':
				out += `<p style="margin:8px 0 4px;font-weight:600;">${inlineHtml((tok as Tokens.Heading).tokens, mentions)}</p>`;
				break;
			case 'blockquote':
				out += `<blockquote class="em-md-quote" style="${QUOTE_STYLE}">${blockHtml((tok as Tokens.Blockquote).tokens, mentions)}</blockquote>`;
				break;
			case 'code':
				out += `<pre class="em-md-code" style="${PRE_STYLE}">${esc((tok as Tokens.Code).text)}</pre>`;
				break;
			case 'list': {
				const l = tok as Tokens.List;
				const tag = l.ordered ? 'ol' : 'ul';
				const items = l.items
					.map((it) => `<li style="margin:2px 0;">${blockHtml(it.tokens, mentions)}</li>`)
					.join('');
				out += `<${tag} style="margin:6px 0;padding-left:22px;">${items}</${tag}>`;
				break;
			}
			case 'hr':
				out += '<hr class="em-md-hr" style="border:none;border-top:1px solid #e4e4e8;margin:10px 0;" />';
				break;
			// Block-level text (tight list items) renders inline without a <p>.
			case 'text': {
				const t = tok as Tokens.Text;
				out += t.tokens?.length ? inlineHtml(t.tokens, mentions) : textHtml(t.text, mentions);
				break;
			}
			// Tables/raw HTML in an email body: literal source text.
			default:
				out += `<p style="margin:6px 0;">${textHtml('raw' in tok ? (tok.raw ?? '') : '', mentions)}</p>`;
		}
	}
	return out;
}

/**
 * Render user-authored markdown to escaped, inline-styled HTML for emails.
 * Mention tokens are flattened to bold `@Name` (call sites usually plainify
 * first; this is the safety net).
 */
export function markdownToEmailHtml(text: string): string {
	const { tokens, mentions } = lexMarkdown(text);
	const html = blockHtml(tokens, mentions).trim();
	// A body with no markdown at all still comes back wrapped in <p> — fine.
	return html || `<p style="margin:6px 0;">${esc(plainifyMentions(text))}</p>`;
}
