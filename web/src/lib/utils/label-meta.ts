import { TRACKR_LABELS } from '$lib/data';

// Palette reused for free-form tags that aren't one of the predefined labels.
// Mirrors the predefined label colors so custom tags feel native.
const PALETTE = ['#7fc8a9', '#7a9cf0', '#ef7a6d', '#c08bd6', '#e9c46a', '#8fb6c4'];

// Resolve a tag id to a display label + color. Predefined labels keep their
// curated colors; custom tags get a deterministic color hashed from the string
// so the same tag always renders the same hue.
export function labelMeta(id: string): { label: string; color: string } {
	const known = TRACKR_LABELS[id];
	if (known) return known;
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
	return { label: id, color: PALETTE[h % PALETTE.length] };
}

// Normalize raw tag input: trim, collapse whitespace, lowercase, cap length.
// Returns '' for empty input (callers should drop those).
export function normalizeTag(raw: string): string {
	return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 24);
}
