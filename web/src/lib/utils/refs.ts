// Entity-reference encoding (the `!` picker) shared by client and server —
// the sibling of mentions.ts for tickets/tasks/projects instead of users.
//
// Storage format embeds the human display id and the type-qualified entity id:
// `~[SIWEB-15](task:<uuid>)`. The sigil is `~`, not the `!` the picker is
// triggered with, because `![x](y)` is markdown *image* syntax; the required
// `type:` prefix keeps the regex from swallowing ordinary `~[…](…)` text.
// Same module-level-`g`-flag rule as MENTION_RE: `matchAll`/`replace` only,
// never `.test()`/`.exec()`.

export const REF_TYPES = ['ticket', 'task', 'project'] as const;
export type RefType = (typeof REF_TYPES)[number];

export const REF_RE = /~\[([^\]]+)\]\((ticket|task|project):([^)]+)\)/g;

/** The token written into the markdown body when the user picks an entity. */
export function buildRefToken(display: string, type: RefType, id: string): string {
	return `~[${display}](${type}:${id})`;
}

/**
 * Flatten ref tokens to their display id (`SIWEB-15`) for non-rich contexts —
 * notification bodies, emails, previews. Safe on bodies without refs.
 */
export function plainifyRefs(text: string | null | undefined): string {
	if (!text) return '';
	return text.replace(REF_RE, (_full, display) => display);
}

/** In-app route for a referenced entity (web client). */
export function refUrl(type: RefType, id: string, display: string): string {
	switch (type) {
		case 'ticket':
			return `/tickets/${id}`;
		case 'task':
			return `/tasks?task=${encodeURIComponent(display)}`;
		case 'project':
			return `/projects/${id}`;
	}
}

/** A `!` picker suggestion — the ref-typed subset of the search API result. */
export type RefCandidate = {
	type: RefType;
	id: string;
	title: string;
	subtitle: string | null;
	displayId: string;
};
