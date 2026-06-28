// @-mention encoding shared by client (insert/render) and server (parse).
//
// Storage format embeds the user id so the server resolves recipients
// unambiguously and the display can re-resolve the current name (so renames
// stay correct): `@[Display Name](userId)`.
//
// The display part captures anything except `]`; the id part anything except
// `)`. The regex is module-level with the `g` flag — callers must use
// `matchAll`/fresh iteration (never `.test()`/`.exec()` against it) to avoid a
// shared-`lastIndex` bug. All helpers below follow that rule.

export const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** Unique user ids referenced by mentions in `text`, in first-seen order. */
export function parseMentionIds(text: string | null | undefined): string[] {
	if (!text) return [];
	const ids = new Set<string>();
	for (const match of text.matchAll(MENTION_RE)) ids.add(match[2]);
	return [...ids];
}

export type MentionSegment =
	| { type: 'text'; value: string }
	| { type: 'mention'; id: string; name: string };

/** Split `text` into ordered text/mention segments for chip rendering. */
export function segmentMentions(text: string): MentionSegment[] {
	const segments: MentionSegment[] = [];
	let last = 0;
	for (const match of text.matchAll(MENTION_RE)) {
		const start = match.index ?? 0;
		if (start > last) segments.push({ type: 'text', value: text.slice(last, start) });
		segments.push({ type: 'mention', name: match[1], id: match[2] });
		last = start + match[0].length;
	}
	if (last < text.length) segments.push({ type: 'text', value: text.slice(last) });
	return segments;
}

/** The token to insert into a textarea when the user picks someone. */
export function buildMentionToken(name: string, id: string): string {
	return `@[${name}](${id})`;
}

/**
 * Flatten mention tokens to their plain `@Name` form for non-rich contexts —
 * notification bodies, emails, previews — where chips can't render. Other text
 * is left untouched; safe to call on bodies that contain no mentions.
 */
export function plainifyMentions(text: string | null | undefined): string {
	if (!text) return '';
	return text.replace(MENTION_RE, (_full, name) => `@${name}`);
}
