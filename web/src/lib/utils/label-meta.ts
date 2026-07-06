// Palette for tags. Tags are free-form (org-defined) — there are no predefined
// labels — so every tag gets a deterministic color hashed from its string, so
// the same tag always renders the same hue.
const PALETTE = ['#7fc8a9', '#7a9cf0', '#ef7a6d', '#c08bd6', '#e9c46a', '#8fb6c4'];

// Resolve a tag id to a display label + color.
export function labelMeta(id: string): { label: string; color: string } {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
	return { label: id, color: PALETTE[h % PALETTE.length] };
}

// Normalize raw tag input: trim, collapse whitespace, lowercase, cap length.
// Returns '' for empty input (callers should drop those).
export function normalizeTag(raw: string): string {
	return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 24);
}
