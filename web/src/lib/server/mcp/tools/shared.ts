// Plumbing shared by every MCP tool module: the per-request context, result
// builders, the error → `isError` mapping, and the zod fragments reused across
// tools. Keep this file free of feature imports so tool modules never form
// cycles through it.

import * as z from 'zod/v4';
import { isHttpError } from '@sveltejs/kit';
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { Memberships } from '$lib/permissions';
import type { McpPrincipal } from '$lib/server/mcp/auth';
import { AttachmentError } from '$lib/server/attachments';
import { loadTicketDisplayUsers } from '$lib/server/tickets';
import type { UserDirectory } from '../format';

/**
 * `App.Locals` with the fields every permission helper reads made required.
 * Built once per request from the authenticated principal; passed unchanged
 * to the same `$lib/server` functions the /api/v1 handlers call.
 */
export type McpLocals = App.Locals & {
	user: NonNullable<App.Locals['user']>;
	memberships: Memberships;
	isAdmin: boolean;
};

export type McpContext = {
	locals: McpLocals;
	/** `event.url.origin` — used for notification links and download URLs. */
	origin: string;
	principal: McpPrincipal;
};

export function localsFromPrincipal(principal: McpPrincipal): McpLocals {
	const p = principal.locals;
	return {
		user: p.user,
		memberships: p.memberships,
		isAdmin: p.isAdmin,
		// `App.Locals.authKind` only knows session|api_key; 'oauth' is an MCP-only
		// kind, and nothing downstream branches on it, so the cast is harmless.
		authKind: p.authKind as App.Locals['authKind'],
		apiKeyId: p.apiKeyId
	};
}

// ─── Results ────────────────────────────────────────────────────────────────

export type ToolResult = CallToolResult;

type Structured = NonNullable<CallToolResult['structuredContent']>;

/** Text (markdown) result, optionally with a JSON mirror. */
export function text(markdown: string, structured?: Record<string, unknown>): ToolResult {
	return {
		content: [{ type: 'text', text: markdown }],
		...(structured ? { structuredContent: structured as Structured } : {})
	};
}

export function imageResult(
	markdown: string,
	image: { data: string; mimeType: string },
	structured?: Record<string, unknown>
): ToolResult {
	return {
		content: [
			{ type: 'text', text: markdown },
			{ type: 'image', data: image.data, mimeType: image.mimeType }
		],
		...(structured ? { structuredContent: structured as Structured } : {})
	};
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/** A caller-fixable failure surfaced as an `isError` tool result. */
export class ToolError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ToolError';
	}
}

export function fail(status: number, message: string): never {
	throw new ToolError(status, message);
}

export function errorResult(status: number, message: string): ToolResult {
	return { isError: true, content: [{ type: 'text', text: `${status}: ${message}` }] };
}

/**
 * Map anything thrown inside a tool to a tool error. Kit `error()` (thrown by
 * `assertCan` and the W2 helpers), `ToolError`, and attachment errors keep
 * their status + message; everything else becomes an opaque 500 (logged
 * server-side, never leaked to the model).
 */
export function toToolError(err: unknown): ToolResult {
	if (err instanceof ToolError) return errorResult(err.status, err.message);
	if (isHttpError(err)) return errorResult(err.status, err.body?.message ?? 'Request failed.');
	if (err instanceof AttachmentError) {
		return errorResult(err.code === 'too_large' ? 413 : 400, err.message);
	}
	// SvelteKit `redirect()` inside a helper would be a programming error here.
	console.error('[mcp] tool failed', err);
	return errorResult(500, 'Internal error.');
}

export type Handler<A> = (args: A) => Promise<ToolResult>;

/** Wrap a tool body so every throw becomes an `isError` result. */
export function guarded<A>(fn: Handler<A>): Handler<A> {
	return async (args) => {
		try {
			return await fn(args);
		} catch (err) {
			return toToolError(err);
		}
	};
}

// ─── Annotations ────────────────────────────────────────────────────────────

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
export const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };
export const WRITE_IDEMPOTENT = {
	readOnlyHint: false,
	destructiveHint: false,
	idempotentHint: true
};
export const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true };

// ─── Zod fragments ──────────────────────────────────────────────────────────

export const limitSchema = z
	.number()
	.int()
	.min(1)
	.max(200)
	.default(50)
	.describe(
		'Maximum number of rows to return (1–200, default 50). The result also reports `total`.'
	);

export const checklistItemSchema = z.object({
	id: z
		.string()
		.optional()
		.describe('Existing item id to keep (from a previous read). Omit for a new item.'),
	text: z.string().min(1).max(500).describe('Item text (plain text, max 500 chars).'),
	done: z.boolean().optional().describe('Completion state (default false).')
});

export const checklistSchema = z
	.array(checklistItemSchema)
	.max(100)
	.describe(
		'Full checklist (whole-array REPLACE: items not listed are removed; reuse `id` to keep an existing item). Use `checklist_toggle` to flip a single item. Only include steps the user gave or asked you to work out — never pad with generic steps.'
	);

export const userRefsSchema = z
	.array(z.string())
	.describe(
		'Users as ids or email addresses (an exact display name also works when unambiguous). Resolve with `list_users`. Unknown values fail the call and list the valid users.'
	);

export const attachmentUrlsSchema = z
	.array(z.url())
	.max(20)
	.optional()
	.describe(
		'Public https URLs to fetch server-side and attach after creation (max 25 MiB each, 20 s timeout, no private hosts). Failures are reported but do not undo the create.'
	);

export const isoDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
	.describe('Calendar date as YYYY-MM-DD.');

/** Parse an ISO date or datetime, 400 on garbage. */
export function parseDateInput(v: string, field: string): Date {
	const d = new Date(v);
	if (Number.isNaN(d.getTime())) fail(400, `Invalid ${field}: ${v} (use YYYY-MM-DD or ISO 8601).`);
	return d;
}

export function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

export function clampLimit(limit: number | undefined): number {
	if (!limit || !Number.isFinite(limit)) return 50;
	return Math.min(200, Math.max(1, Math.round(limit)));
}

// ─── Directories ────────────────────────────────────────────────────────────

/** Display-name directory for the referenced users (emails stripped upstream). */
export async function userDirectory(ids: (string | null | undefined)[]): Promise<UserDirectory> {
	const rows = await loadTicketDisplayUsers(ids);
	return new Map(rows.map((u) => [u.id, u.name]));
}
