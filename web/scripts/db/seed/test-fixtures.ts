#!/usr/bin/env bun
/**
 * Test fixtures for the smoke suites (tests/smoke/*): a deterministic `trk_`
 * API key for the demo user Max Muster, plus his MCP allow-list row, so
 * `bun run test` works on a freshly seeded dev database with no env plumbing.
 *
 *   bun run scripts/db/seed/test-fixtures.ts   (also runs as part of
 *                                               `db:seed --all` and `bun run test`)
 *
 * The plaintext is public by design — it only ever exists in a local demo
 * database next to the equally public demo password. Idempotent: the key row
 * is keyed by its hash, so re-runs are no-ops.
 */

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../../../src/lib/server/db/schema';
import { ok, info, warn, type Db } from './client';

/** Email of the demo user the smoke tests act as (see fixtures.ts, `u0`). */
export const TEST_USER_EMAIL = 'max.muster@trackr.dev';
/** Shared demo-user password (seed `DEMO_PASSWORD` default). */
export const TEST_USER_PASSWORD = 'demo12345';
/** `trk_` key the smoke tests present. Must satisfy `looksLikeApiKey`. */
export const TEST_API_KEY = 'trk_smoke-local-dev-only-max-muster-0000000000000';

const KEY_NAME = 'Smoke tests (local dev)';

// Same hashing as $lib/server/api-keys — duplicated here because that module
// pulls in the app's db/env wiring, which standalone scripts don't have.
function hashApiKey(plaintext: string): string {
	return createHash('sha256').update(plaintext).digest('hex');
}

/** Ensure the fixtures exist. Returns false when the demo user is missing. */
export async function seedTestFixtures(db: Db): Promise<boolean> {
	const [user] = await db
		.select({ id: schema.user.id })
		.from(schema.user)
		.where(eq(schema.user.email, TEST_USER_EMAIL))
		.limit(1);
	if (!user) {
		warn(`test fixtures: ${TEST_USER_EMAIL} not found — run \`bun run db:seed --all\` first.`);
		return false;
	}

	const keyHash = hashApiKey(TEST_API_KEY);
	const [existingKey] = await db
		.select({ id: schema.apiKey.id, revokedAt: schema.apiKey.revokedAt })
		.from(schema.apiKey)
		.where(eq(schema.apiKey.keyHash, keyHash))
		.limit(1);
	if (!existingKey) {
		await db.insert(schema.apiKey).values({
			id: crypto.randomUUID(),
			userId: user.id,
			createdBy: user.id,
			name: KEY_NAME,
			keyPrefix: TEST_API_KEY.slice(0, 12),
			keyHash,
			expiresAt: null
		});
		ok(`test api key for ${TEST_USER_EMAIL}`);
	} else if (existingKey.revokedAt) {
		await db
			.update(schema.apiKey)
			.set({ revokedAt: null })
			.where(eq(schema.apiKey.id, existingKey.id));
		ok(`test api key for ${TEST_USER_EMAIL} (un-revoked)`);
	} else {
		info(`test api key for ${TEST_USER_EMAIL} (existed)`);
	}

	const [access] = await db
		.select({ userId: schema.mcpAccess.userId })
		.from(schema.mcpAccess)
		.where(eq(schema.mcpAccess.userId, user.id))
		.limit(1);
	if (!access) {
		await db.insert(schema.mcpAccess).values({ userId: user.id, enabledById: user.id });
		ok(`mcp access for ${TEST_USER_EMAIL}`);
	} else {
		info(`mcp access for ${TEST_USER_EMAIL} (existed)`);
	}
	return true;
}

if (import.meta.main) {
	await import('../../load-root-env');
	const { openDb } = await import('./client');
	const conn = openDb();
	try {
		const done = await seedTestFixtures(conn.db);
		if (!done) process.exitCode = 1;
	} catch (err) {
		console.error(
			'\x1b[31m✗\x1b[0m test fixtures failed:',
			err instanceof Error ? err.message : err
		);
		process.exitCode = 1;
	} finally {
		await conn.close();
	}
}
