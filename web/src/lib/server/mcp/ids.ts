// Identifier helpers for the MCP surface.
//
// The model sees human identifiers, never raw uuids where a key exists:
// tickets `ORGKEY-<n>` (TRACK-108), tasks `PROJECTKEY-<n>` (WEB-12), projects
// and orgs by key, users by id or email. Wiki pages, notes and attachments are
// uuids. Everything here is pure; database resolution lives in the W2 helpers
// (`resolveTicketByDisplayId`, `resolveTaskByDisplayId`, `resolveProjectByKey`).

export type ParsedDisplayId = { key: string; number: number };

/** `TRACK-108` → `{ key: 'TRACK', number: 108 }`; null when malformed. */
export function parseDisplayId(raw: string): ParsedDisplayId | null {
	const s = raw.trim().toUpperCase();
	const m = /^([A-Z][A-Z0-9]{0,11})-(\d{1,9})$/.exec(s);
	if (!m) return null;
	return { key: m[1], number: Number(m[2]) };
}

/** Canonical form of a display id (trimmed, upper-cased) for error messages. */
export function normalizeDisplayId(raw: string): string {
	return raw.trim().toUpperCase();
}

/** Org / project keys are stored upper-case; accept any case from the model. */
export function normalizeKey(raw: string): string {
	return raw.trim().toUpperCase();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
	return UUID_RE.test(v.trim());
}

// ─── User references ────────────────────────────────────────────────────────
// Tools accept assignees as user ids or email addresses (and, as a convenience,
// an exact display name when it is unambiguous). Resolution always runs against
// the same candidate directory the web pickers use, so the model can never
// smuggle in an id the permission engine would have rejected.

export type UserRefCandidate = { id: string; name: string; email: string };

export type ResolvedUserRefs = {
	ids: string[];
	unknown: string[];
};

export function resolveUserRefs(
	refs: readonly string[],
	candidates: readonly UserRefCandidate[]
): ResolvedUserRefs {
	const byId = new Map(candidates.map((c) => [c.id, c]));
	const byEmail = new Map(candidates.map((c) => [c.email.toLowerCase(), c]));
	const byName = new Map<string, UserRefCandidate[]>();
	for (const c of candidates) {
		const k = c.name.trim().toLowerCase();
		if (!k) continue;
		const list = byName.get(k) ?? [];
		list.push(c);
		byName.set(k, list);
	}

	const ids: string[] = [];
	const unknown: string[] = [];
	for (const rawRef of refs) {
		const ref = rawRef.trim();
		if (!ref) continue;
		const lower = ref.toLowerCase();
		const hit =
			byId.get(ref) ??
			byEmail.get(lower) ??
			(byName.get(lower)?.length === 1 ? byName.get(lower)![0] : undefined);
		if (hit) {
			if (!ids.includes(hit.id)) ids.push(hit.id);
		} else {
			unknown.push(ref);
		}
	}
	return { ids, unknown };
}

/** One line per candidate — used in "unknown assignee" errors. */
export function describeCandidates(candidates: readonly UserRefCandidate[], max = 40): string {
	const rows = candidates.slice(0, max).map((c) => `- ${c.name} <${c.email}> (id ${c.id})`);
	if (candidates.length > max) rows.push(`- … ${candidates.length - max} more`);
	return rows.join('\n');
}
