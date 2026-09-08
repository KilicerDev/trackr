// Workspace audit trail writer. Every meaningful action (auth, membership,
// project/task/ticket lifecycle, settings) calls `recordAudit` so there is one
// insert path and one place to evolve the row shape. Calls are fire-and-forget:
// a failed audit write logs to the console but never rejects, so it can't undo
// the action it records.

import type { RequestEvent } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { db } from '../db';
import { auditLog } from '../db/app.schema';
import { LOG_EVENT_TYPES } from '$lib/config/taxonomy';

/**
 * Surface an action came through. Derived from the request when the writer
 * does not pass one: the MCP endpoint → 'mcp'; a `trk_` API key → 'api'; a
 * bearer session token (the native app's credential) → 'app'; a cookie
 * session → 'web'. Stored as its own column so the log can filter on it.
 */
export type AuditChannel = 'web' | 'app' | 'api' | 'mcp';
export const AUDIT_CHANNELS: readonly AuditChannel[] = ['web', 'app', 'api', 'mcp'];

export function channelFromEvent(event: RequestEvent): AuditChannel {
	if (event.url.pathname === '/api/mcp') return 'mcp';
	if (event.locals.authKind === 'api_key') return 'api';
	if (event.request.headers.get('authorization')?.startsWith('Bearer ')) return 'app';
	return 'web';
}

export type AuditInput = {
	// Event key from the shared catalog (LOG_EVENT_TYPES), e.g. 'user.invite'.
	type: string;
	// Category override; defaults to the catalog's kind for `type`. Used where
	// one event type spans categories (attachments on tasks vs tickets).
	kind?: string;
	// Surface override; defaults to what the current request implies.
	channel?: AuditChannel | null;
	// Who performed it. null = anonymous/unknown (e.g. a failed login).
	actorId?: string | null;
	// Name/email snapshot — survives user deletion and names anonymous actors.
	actorLabel?: string | null;
	targetType?: string | null;
	targetId?: string | null;
	targetLabel?: string | null;
	orgId?: string | null;
	meta?: Record<string, unknown> | null;
	// Explicit request context. When omitted, it's read from the current
	// SvelteKit request (or the passed `event`). Pass these directly from
	// contexts without a request event (e.g. better-auth hooks).
	ipAddress?: string | null;
	userAgent?: string | null;
};

function requestContext(event?: RequestEvent): {
	ip: string | null;
	ua: string | null;
	channel: AuditChannel | null;
} {
	try {
		const e = event ?? getRequestEvent();
		let ip: string | null = null;
		try {
			ip = e.getClientAddress();
		} catch {
			ip = null;
		}
		return { ip, ua: e.request.headers.get('user-agent'), channel: channelFromEvent(e) };
	} catch {
		return { ip: null, ua: null, channel: null };
	}
}

export async function recordAudit(input: AuditInput, event?: RequestEvent): Promise<void> {
	const kind = input.kind ?? LOG_EVENT_TYPES[input.type]?.kind ?? 'settings';
	const ctx = requestContext(event);
	try {
		await db.insert(auditLog).values({
			id: crypto.randomUUID(),
			type: input.type,
			kind,
			actorId: input.actorId ?? null,
			actorLabel: input.actorLabel ?? null,
			targetType: input.targetType ?? null,
			targetId: input.targetId ?? null,
			targetLabel: input.targetLabel ?? null,
			orgId: input.orgId ?? null,
			ipAddress: input.ipAddress ?? ctx.ip,
			userAgent: input.userAgent ?? ctx.ua,
			channel: input.channel === undefined ? ctx.channel : input.channel,
			meta: input.meta ?? null
		});
	} catch (err) {
		console.error('recordAudit failed', err);
	}
}

// Best-effort browser·OS summary from a user-agent string, for the log's
// "device" column. Dependency-free and intentionally coarse; the raw UA is kept
// in the row so the parser can improve later without a backfill.
export function parseDevice(ua: string | null | undefined): string {
	if (!ua) return 'Unknown';
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /OPR\/|Opera/.test(ua)
			? 'Opera'
			: /Firefox\//.test(ua)
				? 'Firefox'
				: /Chrome\//.test(ua)
					? 'Chrome'
					: /Safari\//.test(ua)
						? 'Safari'
						: /curl\//i.test(ua)
							? 'curl'
							: null;
	const os = /Windows/.test(ua)
		? 'Windows'
		: /Mac OS X|Macintosh/.test(ua)
			? 'macOS'
			: /Android/.test(ua)
				? 'Android'
				: /iPhone|iPad|iPod|iOS/.test(ua)
					? 'iOS'
					: /Linux/.test(ua)
						? 'Linux'
						: null;
	if (browser && os) return `${browser} · ${os}`;
	if (browser) return browser;
	if (os) return os;
	return ua.split(' ')[0] || 'Unknown';
}
