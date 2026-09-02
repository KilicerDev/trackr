import { and, desc, eq, isNull } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { emitWebhookEvent } from '$lib/server/webhooks';
import { account, user } from '$lib/server/db/auth.schema';
import {
	invitation,
	organization,
	organizationMember,
	type Invitation
} from '$lib/server/db/app.schema';
import type { Role } from '$lib/roles';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TOKEN_BYTES = 32;

export type InvitationRole = Role;

function generateToken(): string {
	const bytes = new Uint8Array(TOKEN_BYTES);
	crypto.getRandomValues(bytes);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Builds the absolute accept-invite link. Prefer the caller-supplied request
// origin (event.url.origin) — under host-based routing `env.ORIGIN` is unset, so
// relying on it alone yields a relative link with no domain. Falls back to
// env.ORIGIN for single-host deploys, then to a relative path as a last resort.
function acceptUrl(token: string, origin?: string | null): string {
	const base = (origin ?? env.ORIGIN ?? '').replace(/\/$/, '');
	return `${base}/accept-invite?token=${encodeURIComponent(token)}`;
}

export type CreatedInvitation = {
	invitation: Invitation;
	acceptUrl: string;
};

export async function createOrRefreshInvitation(opts: {
	email: string;
	name: string;
	role: InvitationRole;
	orgId: string | null;
	orgRole: string | null;
	invitedBy?: string | null;
	// Request origin (event.url.origin) used to build an absolute accept link.
	origin?: string | null;
}): Promise<CreatedInvitation> {
	const email = opts.email.trim().toLowerCase();
	const name = opts.name.trim();
	const token = generateToken();
	const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

	const [existing] = await db.select().from(invitation).where(eq(invitation.email, email)).limit(1);

	if (existing) {
		const [updated] = await db
			.update(invitation)
			.set({
				name,
				role: opts.role,
				orgId: opts.orgId,
				orgRole: opts.orgRole,
				token,
				expiresAt,
				acceptedAt: null,
				invitedBy: opts.invitedBy ?? existing.invitedBy ?? null
			})
			.where(eq(invitation.id, existing.id))
			.returning();
		return { invitation: updated, acceptUrl: acceptUrl(token, opts.origin) };
	}

	const [created] = await db
		.insert(invitation)
		.values({
			id: crypto.randomUUID(),
			email,
			name,
			role: opts.role,
			orgId: opts.orgId,
			orgRole: opts.orgRole,
			token,
			expiresAt,
			invitedBy: opts.invitedBy ?? null
		})
		.returning();
	return { invitation: created, acceptUrl: acceptUrl(created.token, opts.origin) };
}

export async function findInvitationByToken(token: string): Promise<Invitation | null> {
	if (!token) return null;
	const [row] = await db
		.select()
		.from(invitation)
		.where(and(eq(invitation.token, token), isNull(invitation.acceptedAt)))
		.limit(1);
	if (!row) return null;
	if (row.expiresAt.getTime() < Date.now()) return null;
	return row;
}

export async function markInvitationAccepted(id: string): Promise<void> {
	await db.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, id));
}

export async function revokeInvitation(id: string): Promise<void> {
	await db.delete(invitation).where(eq(invitation.id, id));
}

export async function listPendingInvitations(): Promise<Invitation[]> {
	return db
		.select()
		.from(invitation)
		.where(isNull(invitation.acceptedAt))
		.orderBy(desc(invitation.createdAt));
}

export async function getInvitationById(id: string): Promise<Invitation | null> {
	const [row] = await db.select().from(invitation).where(eq(invitation.id, id)).limit(1);
	return row ?? null;
}

export type AcceptInvitationError = 'invalid_token' | 'email_taken';

export type AcceptInvitationResult =
	| { ok: true; email: string; invitationId: string; userId: string; role: string }
	| { ok: false; reason: AcceptInvitationError };

export async function acceptInvitation(opts: {
	token: string;
	password: string;
}): Promise<AcceptInvitationResult> {
	const inv = await findInvitationByToken(opts.token);
	if (!inv) return { ok: false, reason: 'invalid_token' };

	const [existingUser] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, inv.email))
		.limit(1);
	if (existingUser) return { ok: false, reason: 'email_taken' };

	const passwordHash = await hashPassword(opts.password);
	const userId = crypto.randomUUID();
	const now = new Date();

	await db.transaction(async (tx) => {
		await tx.insert(user).values({
			id: userId,
			name: inv.name,
			email: inv.email,
			role: inv.role,
			emailVerified: true,
			createdAt: now,
			updatedAt: now
		});
		await tx.insert(account).values({
			id: crypto.randomUUID(),
			userId,
			accountId: userId,
			providerId: 'credential',
			password: passwordHash,
			createdAt: now,
			updatedAt: now
		});
		// Grant the org membership the invite was issued for — this is what
		// actually gives the new user permissions. Older invites with no org
		// fields fall through with no membership (legacy behaviour).
		if (inv.orgId && inv.orgRole) {
			await tx
				.insert(organizationMember)
				.values({ orgId: inv.orgId, userId, role: inv.orgRole })
				.onConflictDoNothing();
		}
		await tx.update(invitation).set({ acceptedAt: now }).where(eq(invitation.id, inv.id));
	});

	{
		let orgKey: string | null = null;
		let internal = false;
		if (inv.orgId) {
			const [org] = await db
				.select({ key: organization.key, isInternal: organization.isInternal })
				.from(organization)
				.where(eq(organization.id, inv.orgId))
				.limit(1);
			orgKey = org?.key ?? null;
			internal = org?.isInternal ?? false;
		}
		emitWebhookEvent({
			type: 'invitation.accepted',
			orgId: internal ? null : inv.orgId,
			actor: { id: userId, name: inv.name },
			assigneeIds: [userId],
			data: {
				invitation: { id: inv.id, invitedBy: inv.invitedBy ?? null },
				user: { id: userId, name: inv.name },
				organization: inv.orgId ? { id: inv.orgId, key: orgKey, internal } : null,
				role: inv.orgRole ?? null
			}
		});
	}

	return { ok: true, email: inv.email, invitationId: inv.id, userId, role: inv.role };
}
