#!/usr/bin/env bun
/**
 * Seed (or promote) the root superadmin user.
 *
 * Usage:
 *   ROOT_EMAIL=root@example.com ROOT_PASSWORD=secret bun run seed:root
 *
 * Idempotent:
 *   - If the email does not exist → creates a user + credential account, role=superadmin.
 *   - If it exists with role ≠ 'superadmin' → promotes to superadmin.
 *   - If it exists with role = 'superadmin' → no-op.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import * as schema from '../src/lib/server/db/schema';
import { resolveDatabaseUrl } from '../src/lib/server/db/resolve-url';

const email = (process.env.ROOT_EMAIL ?? 'root@example.com').toLowerCase();
const password = process.env.ROOT_PASSWORD;
const name = process.env.ROOT_NAME ?? 'Root';

function die(msg: string): never {
	console.error(`\x1b[31m✗\x1b[0m ${msg}`);
	process.exit(1);
}

let databaseUrl: string;
try {
	databaseUrl = resolveDatabaseUrl(process.env);
} catch (err) {
	die((err instanceof Error ? err.message : String(err)) + ' Check your .env file.');
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client, { schema });

// Ensure the root user is also a superadmin member of the internal Trackr
// org. Both checks are needed: better-auth uses user.role for impersonation,
// while the app's permission engine uses the Trackr-org membership.
async function ensureTrackrOrgMembership(userId: string) {
	const [internal] = await db
		.select({ id: schema.organization.id })
		.from(schema.organization)
		.where(eq(schema.organization.isInternal, true))
		.limit(1);
	if (!internal) {
		console.warn(
			'\x1b[33m!\x1b[0m No internal Trackr organization found. Run the latest migrations first.'
		);
		return;
	}
	const [existing] = await db
		.select()
		.from(schema.organizationMember)
		.where(
			and(
				eq(schema.organizationMember.orgId, internal.id),
				eq(schema.organizationMember.userId, userId)
			)
		)
		.limit(1);
	if (existing) {
		if (existing.role !== 'org.superadmin') {
			await db
				.update(schema.organizationMember)
				.set({ role: 'org.superadmin' })
				.where(
					and(
						eq(schema.organizationMember.orgId, internal.id),
						eq(schema.organizationMember.userId, userId)
					)
				);
			console.log(`\x1b[32m✓\x1b[0m Promoted Trackr-org membership to org.superadmin.`);
		}
		return;
	}
	await db.insert(schema.organizationMember).values({
		orgId: internal.id,
		userId,
		role: 'org.superadmin'
	});
	console.log(`\x1b[32m✓\x1b[0m Added Trackr-org membership as org.superadmin.`);
}

try {
	const [existing] = await db
		.select()
		.from(schema.user)
		.where(eq(schema.user.email, email))
		.limit(1);

	if (!existing && !password) {
		die(
			'ROOT_PASSWORD is required to create a new root user.\n  Example: ROOT_PASSWORD=changeme123 bun run seed:root'
		);
	}
	if (!existing && password && password.length < 8) {
		die('ROOT_PASSWORD must be at least 8 characters.');
	}

	if (existing) {
		if (existing.role !== 'superadmin') {
			await db
				.update(schema.user)
				.set({ role: 'superadmin', updatedAt: new Date() })
				.where(eq(schema.user.id, existing.id));
			console.log(
				`\x1b[32m✓\x1b[0m Promoted ${email} from role=${existing.role ?? 'user'} to role=superadmin.`
			);
		} else {
			console.log(`\x1b[32m✓\x1b[0m ${email} already has role=superadmin.`);
		}
		await ensureTrackrOrgMembership(existing.id);
		process.exit(0);
	}

	const userId = crypto.randomUUID();
	const now = new Date();
	const passwordHash = await hashPassword(password!);

	await db.transaction(async (tx) => {
		await tx.insert(schema.user).values({
			id: userId,
			email,
			name,
			role: 'superadmin',
			emailVerified: true,
			createdAt: now,
			updatedAt: now
		});
		await tx.insert(schema.account).values({
			id: crypto.randomUUID(),
			userId,
			accountId: userId,
			providerId: 'credential',
			password: passwordHash,
			createdAt: now,
			updatedAt: now
		});
	});

	await ensureTrackrOrgMembership(userId);
	console.log(`\x1b[32m✓\x1b[0m Seeded root superadmin: ${email}`);
} catch (err) {
	const msg = err instanceof Error ? err.message : String(err);
	if (/column .* does not exist|relation .* does not exist/i.test(msg)) {
		console.error(`\x1b[31m✗\x1b[0m Database schema is out of date.`);
		console.error(
			`  Run: \x1b[1mbun run db:push\x1b[0m (or migrate) and try again.`
		);
		console.error(`  (underlying error: ${msg})`);
	} else {
		console.error(`\x1b[31m✗\x1b[0m Failed to seed:`, err);
	}
	process.exitCode = 1;
} finally {
	await client.end();
}
