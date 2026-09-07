/**
 * Personal API keys for the /api/v1 surface.
 *
 * A key is a bearer credential bound to ONE user: whoever presents it acts as
 * that user, with that user's roles and memberships, nothing more. There is no
 * separate scope model on purpose — the existing role/permission engine is the
 * single source of truth, and the key just picks whose row it applies to.
 *
 * Storage: only `sha256(plaintext)` plus a short display prefix. The plaintext
 * (`trk_<43 base64url chars>`) is returned exactly once from `createApiKey`.
 *
 * Resolution happens in hooks.server.ts, restricted to `/api/v1/*` plus
 * read-only `/api/attachments/*` fetches: a key must never drive the HTML app,
 * form actions, or better-auth's own endpoints.
 */

import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { apiKey, type ApiKey } from '$lib/server/db/app.schema';
import { user } from '$lib/server/db/auth.schema';
import { assertCanManageApiKeyFor, type PolicySubject } from '$lib/server/user-policy';
import { error } from '@sveltejs/kit';

export const API_KEY_PREFIX = 'trk_';

/** Length of the plaintext shown in lists ("trk_ab12cd34"). */
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

/** Don't bump `last_used_at` more often than this per key. */
const LAST_USED_THROTTLE_MS = 60_000;

export function looksLikeApiKey(token: string | null | undefined): token is string {
	return !!token && token.startsWith(API_KEY_PREFIX) && token.length > DISPLAY_PREFIX_LENGTH;
}

export function hashApiKey(plaintext: string): string {
	return createHash('sha256').update(plaintext).digest('hex');
}

function generatePlaintext(): string {
	return API_KEY_PREFIX + randomBytes(32).toString('base64url');
}

// ─── Admin CRUD ────────────────────────────────────────────────────────────

export type ApiKeyView = Omit<ApiKey, 'keyHash'> & {
	status: 'active' | 'expired' | 'revoked';
	user: { id: string; name: string; email: string; role: string | null; banned: boolean };
	createdByName: string | null;
};

export type CreateApiKeyInput = {
	userId: string;
	name: string;
	expiresAt: Date | null;
};

export function statusOf(row: Pick<ApiKey, 'revokedAt' | 'expiresAt'>): ApiKeyView['status'] {
	if (row.revokedAt) return 'revoked';
	if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return 'expired';
	return 'active';
}

async function loadOwner(userId: string) {
	const [row] = await db
		.select({
			id: user.id,
			email: user.email,
			role: user.role,
			isRoot: user.isRoot,
			banned: user.banned
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return row ?? null;
}

/**
 * Create a key for `input.userId` on behalf of `actor`. A key acts as its
 * owner, so this is impersonation-grade: the policy allows own keys for
 * everyone, otherwise only peers-and-below and never root. The returned
 * `plaintext` is the only time it is ever visible.
 */
export async function createApiKey(
	input: CreateApiKeyInput,
	actor: PolicySubject
): Promise<{ key: ApiKey; plaintext: string }> {
	const owner = await loadOwner(input.userId);
	if (!owner || owner.banned) error(404, 'User not found.');
	assertCanManageApiKeyFor(actor, owner);
	const createdBy = actor.id;
	const plaintext = generatePlaintext();
	const [key] = await db
		.insert(apiKey)
		.values({
			id: crypto.randomUUID(),
			userId: input.userId,
			createdBy,
			name: input.name,
			keyPrefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH),
			keyHash: hashApiKey(plaintext),
			expiresAt: input.expiresAt
		})
		.returning();
	return { key, plaintext };
}

const creator = { id: user.id, name: user.name };

export async function listApiKeys(): Promise<ApiKeyView[]> {
	const rows = await db
		.select({
			key: apiKey,
			owner: {
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				banned: user.banned
			}
		})
		.from(apiKey)
		.innerJoin(user, eq(user.id, apiKey.userId))
		.orderBy(asc(user.name), desc(apiKey.createdAt));

	const creatorIds = [...new Set(rows.map((r) => r.key.createdBy).filter((v): v is string => !!v))];
	const creators = creatorIds.length
		? await db.select(creator).from(user).where(inArray(user.id, creatorIds))
		: [];
	const creatorName = new Map(creators.map((c) => [c.id, c.name]));

	return rows.map(({ key, owner }) => ({
		id: key.id,
		userId: key.userId,
		createdBy: key.createdBy,
		name: key.name,
		keyPrefix: key.keyPrefix,
		expiresAt: key.expiresAt,
		lastUsedAt: key.lastUsedAt,
		revokedAt: key.revokedAt,
		createdAt: key.createdAt,
		status: statusOf(key),
		user: { ...owner, banned: owner.banned ?? false },
		createdByName: key.createdBy ? (creatorName.get(key.createdBy) ?? null) : null
	}));
}

export async function getApiKey(id: string): Promise<ApiKeyView | null> {
	const all = await listApiKeys();
	return all.find((k) => k.id === id) ?? null;
}

/** The policy subject a key row belongs to, or null when the key is unknown. */
async function ownerOfKey(id: string) {
	const [row] = await db
		.select({ userId: apiKey.userId })
		.from(apiKey)
		.where(eq(apiKey.id, id))
		.limit(1);
	return row ? loadOwner(row.userId) : null;
}

/** Soft-revoke: the row stays for the audit trail, the key stops working now. */
export async function revokeApiKey(id: string, actor: PolicySubject): Promise<boolean> {
	const owner = await ownerOfKey(id);
	if (!owner) return false;
	assertCanManageApiKeyFor(actor, owner);
	const rows = await db
		.update(apiKey)
		.set({ revokedAt: new Date() })
		.where(and(eq(apiKey.id, id), isNull(apiKey.revokedAt)))
		.returning({ id: apiKey.id });
	return rows.length > 0;
}

export async function deleteApiKey(id: string, actor: PolicySubject): Promise<boolean> {
	const owner = await ownerOfKey(id);
	if (!owner) return false;
	assertCanManageApiKeyFor(actor, owner);
	const rows = await db.delete(apiKey).where(eq(apiKey.id, id)).returning({ id: apiKey.id });
	return rows.length > 0;
}

// ─── Resolution (hooks.server.ts) ──────────────────────────────────────────

export type ResolvedApiKey = {
	keyId: string;
	user: typeof user.$inferSelect;
};

/**
 * Turn a presented plaintext into the user it acts as. Null when the key is
 * unknown, revoked, expired, or its user is banned. Successful use bumps
 * `last_used_at` (throttled, fire-and-forget).
 */
export async function resolveApiKey(plaintext: string): Promise<ResolvedApiKey | null> {
	const [row] = await db
		.select({ key: apiKey, owner: user })
		.from(apiKey)
		.innerJoin(user, eq(user.id, apiKey.userId))
		.where(eq(apiKey.keyHash, hashApiKey(plaintext)))
		.limit(1);
	if (!row) return null;
	if (statusOf(row.key) !== 'active') return null;
	if (row.owner.banned) {
		// A temporary ban that already lapsed does not block the key.
		if (!row.owner.banExpires || row.owner.banExpires.getTime() > Date.now()) return null;
	}

	const last = row.key.lastUsedAt?.getTime() ?? 0;
	if (Date.now() - last > LAST_USED_THROTTLE_MS) {
		void db
			.update(apiKey)
			.set({ lastUsedAt: new Date() })
			.where(eq(apiKey.id, row.key.id))
			.catch((err) => console.error('[api-keys] last_used_at update failed', err));
	}

	return { keyId: row.key.id, user: row.owner };
}
