/**
 * Per-user MCP enablement + connection management.
 *
 * `mcp_access` is a plain allow-list: a row means the user may talk to
 * /api/mcp (with an OAuth token or a `trk_` API key). It says nothing about
 * what they may do there — that is the user's normal roles/permissions.
 *
 * "Connections" are the opaque OAuth access tokens the better-auth `mcp`
 * plugin issues (one row per authorization or refresh). Deleting a row
 * revokes both the access and the refresh token it carries.
 */

import { asc, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db';
import { mcpAccess } from '$lib/server/db/app.schema';
import { oauthAccessToken, oauthApplication, user } from '$lib/server/db/auth.schema';
import { assertCanManageMcpFor, type PolicySubject } from '$lib/server/user-policy';

export async function isMcpEnabled(userId: string): Promise<boolean> {
	const [row] = await db
		.select({ userId: mcpAccess.userId })
		.from(mcpAccess)
		.where(eq(mcpAccess.userId, userId))
		.limit(1);
	return !!row;
}

export type McpAccessRow = {
	userId: string;
	enabledById: string | null;
	enabledByName: string | null;
	createdAt: Date;
};

export async function listMcpAccess(): Promise<McpAccessRow[]> {
	const enabler = alias(user, 'enabler');
	return db
		.select({
			userId: mcpAccess.userId,
			enabledById: mcpAccess.enabledById,
			enabledByName: enabler.name,
			createdAt: mcpAccess.createdAt
		})
		.from(mcpAccess)
		.leftJoin(enabler, eq(enabler.id, mcpAccess.enabledById))
		.orderBy(asc(mcpAccess.createdAt));
}

/**
 * Enable or disable MCP for a user. Idempotent; returns true when the row
 * state actually changed. Disabling does NOT delete issued tokens — callers
 * that want a hard cut-off call `revokeAllForUser` as well (the request
 * guard denies disabled users regardless).
 */
export async function setMcpAccess(
	userId: string,
	enabled: boolean,
	actor: PolicySubject
): Promise<boolean> {
	// Policy backstop: peers-and-below (self needs an admin-like role), never root.
	const target = await loadSubject(userId);
	if (!target) return false;
	assertCanManageMcpFor(actor, target);
	if (enabled) {
		const inserted = await db
			.insert(mcpAccess)
			.values({ userId, enabledById: actor.id })
			.onConflictDoNothing()
			.returning({ userId: mcpAccess.userId });
		return inserted.length > 0;
	}
	const deleted = await db
		.delete(mcpAccess)
		.where(eq(mcpAccess.userId, userId))
		.returning({ userId: mcpAccess.userId });
	return deleted.length > 0;
}

async function loadSubject(userId: string): Promise<PolicySubject | null> {
	const [row] = await db
		.select({ id: user.id, role: user.role, isRoot: user.isRoot })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return row ?? null;
}

export type McpConnection = {
	id: string;
	userId: string | null;
	userName: string | null;
	userEmail: string | null;
	userRole: string | null;
	clientId: string | null;
	clientName: string | null;
	createdAt: Date | null;
	accessTokenExpiresAt: Date | null;
	refreshTokenExpiresAt: Date | null;
};

const connectionColumns = {
	id: oauthAccessToken.id,
	userId: oauthAccessToken.userId,
	userName: user.name,
	userEmail: user.email,
	userRole: user.role,
	clientId: oauthAccessToken.clientId,
	clientName: oauthApplication.name,
	createdAt: oauthAccessToken.createdAt,
	accessTokenExpiresAt: oauthAccessToken.accessTokenExpiresAt,
	refreshTokenExpiresAt: oauthAccessToken.refreshTokenExpiresAt
};

/** Every issued OAuth token (access + refresh pair), newest first. */
export async function listMcpConnections(): Promise<McpConnection[]> {
	return db
		.select(connectionColumns)
		.from(oauthAccessToken)
		.leftJoin(oauthApplication, eq(oauthApplication.clientId, oauthAccessToken.clientId))
		.leftJoin(user, eq(user.id, oauthAccessToken.userId))
		.orderBy(desc(oauthAccessToken.createdAt));
}

export async function getMcpConnection(tokenRowId: string): Promise<McpConnection | null> {
	const [row] = await db
		.select(connectionColumns)
		.from(oauthAccessToken)
		.leftJoin(oauthApplication, eq(oauthApplication.clientId, oauthAccessToken.clientId))
		.leftJoin(user, eq(user.id, oauthAccessToken.userId))
		.where(eq(oauthAccessToken.id, tokenRowId))
		.limit(1);
	return row ?? null;
}

/** Delete one token row (revokes its access AND refresh token). */
export async function revokeMcpConnection(
	tokenRowId: string,
	actor: PolicySubject
): Promise<boolean> {
	const existing = await getMcpConnection(tokenRowId);
	if (!existing) return false;
	if (existing.userId) {
		const target = await loadSubject(existing.userId);
		if (target) assertCanManageMcpFor(actor, target);
	}
	const deleted = await db
		.delete(oauthAccessToken)
		.where(eq(oauthAccessToken.id, tokenRowId))
		.returning({ id: oauthAccessToken.id });
	return deleted.length > 0;
}

/** Delete every token issued to a user. Returns how many were removed. */
export async function revokeAllForUser(userId: string, actor: PolicySubject): Promise<number> {
	const target = await loadSubject(userId);
	if (!target) return 0;
	assertCanManageMcpFor(actor, target);
	const deleted = await db
		.delete(oauthAccessToken)
		.where(eq(oauthAccessToken.userId, userId))
		.returning({ id: oauthAccessToken.id });
	return deleted.length;
}
