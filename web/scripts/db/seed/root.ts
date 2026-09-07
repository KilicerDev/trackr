import { and, eq, ne } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import * as schema from '../../../src/lib/server/db/schema';
import { ok, info, warn, die, type Db } from './client';

// Ensure the root user is also a superadmin member of the internal Trackr org.
// Both are needed: better-auth uses user.role for impersonation, while the app's
// permission engine uses the Trackr-org membership.
async function ensureTrackrOrgMembership(db: Db, userId: string) {
	const [internal] = await db
		.select({ id: schema.organization.id })
		.from(schema.organization)
		.where(eq(schema.organization.isInternal, true))
		.limit(1);
	if (!internal) {
		warn('No internal Trackr organization found. Run the latest migrations first.');
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
			ok('Promoted Trackr-org membership to org.superadmin.');
		}
		return;
	}
	await db.insert(schema.organizationMember).values({
		orgId: internal.id,
		userId,
		role: 'org.superadmin'
	});
	ok('Added Trackr-org membership as org.superadmin.');
}

/**
 * Seed (or promote) the root superadmin. Idempotent:
 *   - missing email     → create user + credential account, role=superadmin
 *   - exists, role ≠ sa → promote to superadmin
 *   - exists, role = sa → no-op
 * Reads ROOT_EMAIL / ROOT_PASSWORD / ROOT_NAME from the environment.
 */
export async function seedRoot(db: Db): Promise<void> {
	const email = (process.env.ROOT_EMAIL ?? 'root@example.com').toLowerCase();
	const password = process.env.ROOT_PASSWORD;
	const name = process.env.ROOT_NAME ?? 'Root';

	const [existing] = await db
		.select()
		.from(schema.user)
		.where(eq(schema.user.email, email))
		.limit(1);

	if (!existing && !password) {
		die(
			'ROOT_PASSWORD is required to create a new root user.\n  Example: ROOT_PASSWORD=changeme123 bun run db:seed --root'
		);
	}
	if (!existing && password && password.length < 8) {
		die('ROOT_PASSWORD must be at least 8 characters.');
	}

	if (existing) {
		await ensureSingleRoot(db, existing.id, email);
		if (existing.role !== 'superadmin') {
			await db
				.update(schema.user)
				.set({ role: 'superadmin', updatedAt: new Date() })
				.where(eq(schema.user.id, existing.id));
			ok(`Promoted ${email} from role=${existing.role ?? 'user'} to role=superadmin.`);
		} else {
			info(`${email} already has role=superadmin.`);
		}
		await ensureTrackrOrgMembership(db, existing.id);
		return;
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

	await ensureTrackrOrgMembership(db, userId);
	await ensureSingleRoot(db, userId, email);
	ok(`Seeded root superadmin: ${email}`);
}

/**
 * Exactly one row carries `is_root`: the ROOT_EMAIL account. The flag is what
 * makes root untouchable at runtime ($lib/server/user-policy), so a stale
 * flag on a previous root (ROOT_EMAIL changed) is cleared here too.
 */
async function ensureSingleRoot(db: Db, userId: string, email: string) {
	const cleared = await db
		.update(schema.user)
		.set({ isRoot: false, updatedAt: new Date() })
		.where(and(eq(schema.user.isRoot, true), ne(schema.user.id, userId)))
		.returning({ email: schema.user.email });
	for (const row of cleared) warn(`Removed root flag from ${row.email} (ROOT_EMAIL is ${email}).`);

	const [current] = await db
		.select({ isRoot: schema.user.isRoot })
		.from(schema.user)
		.where(eq(schema.user.id, userId))
		.limit(1);
	if (!current?.isRoot) {
		await db
			.update(schema.user)
			.set({ isRoot: true, updatedAt: new Date() })
			.where(eq(schema.user.id, userId));
		ok(`Flagged ${email} as the root account.`);
	}

	const roots = await db
		.select({ email: schema.user.email })
		.from(schema.user)
		.where(eq(schema.user.isRoot, true));
	if (roots.length !== 1) {
		die(
			`Expected exactly one root account, found ${roots.length}: ${roots.map((r) => r.email).join(', ')}`
		);
	}
}
