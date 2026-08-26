// Organization key: the short uppercase prefix in ticket ids ("SGP-22").
// Shared by the admin forms (live derivation) and the server actions
// (normalisation + validation) so both agree on what a valid key is.

export const ORG_KEY_MAX = 6;
export const ORG_KEY_RE = /^[A-Z][A-Z0-9]{1,5}$/;

/** Uppercase, strip everything but A–Z/0–9, cap the length. */
export function normalizeOrgKey(raw: string): string {
	return raw
		.toUpperCase()
		.normalize('NFKD')
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, ORG_KEY_MAX);
}

export function isValidOrgKey(key: string): boolean {
	return ORG_KEY_RE.test(key);
}

/** Best-effort default from the org name: initials for multi-word names
 *  ("Schneider Group" → "SG"), a prefix for single words ("Siweb" → "SIWEB"). */
export function deriveOrgKey(name: string): string {
	const cleaned = name
		.toUpperCase()
		.normalize('NFKD')
		.replace(/[^A-Z0-9 ]/g, '')
		.trim();
	if (!cleaned) return '';
	const parts = cleaned.split(/\s+/);
	const raw =
		parts.length === 1
			? parts[0].slice(0, 5)
			: parts
					.map((p) => p[0])
					.join('')
					.slice(0, 5);
	// Keys must start with a letter; drop leading digits ("3M Co" → "MC").
	return raw.replace(/^[0-9]+/, '');
}
