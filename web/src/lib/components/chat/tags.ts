// Shared client helpers for chat tags (used by the inline `#` composer path and
// the standalone TagSelect dropdown).

const PALETTE = ['#7a9cf0', '#7fc8a9', '#ef7a6d', '#c08bd6', '#e9c46a', '#8fb6c4', '#9aa4b2'];

// Stable color for a label so a tag looks the same everywhere it's created.
export function tagColorFor(label: string): string {
	let h = 0;
	for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
	return PALETTE[h % PALETTE.length];
}

// Persist a new tag via the chat route's createTag action. Caller should
// invalidate afterwards and resolve the new tag by label from the refreshed
// list (the action response is devalue-encoded).
export async function createOrgTag(orgId: string, label: string): Promise<void> {
	const fd = new FormData();
	fd.set('org', orgId);
	fd.set('label', label);
	fd.set('color', tagColorFor(label));
	const res = await fetch('/chat?/createTag', { method: 'POST', body: fd });
	if (!res.ok) throw new Error('createTag failed');
}
