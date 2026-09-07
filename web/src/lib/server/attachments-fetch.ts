// Attaching a file to a ticket/task on behalf of an MCP caller — either by
// downloading a remote https URL server-side or from bytes the caller sent
// inline (base64; `decodeInlineUpload`). Both end in `attachToEntity`, which
// proves the parent exists, checks write access, then stores the file.
//
// The URL path is SSRF-guarded:
//   - https only, no credentials in the URL
//   - the host is resolved with dns.lookup and every address must be public
//     (loopback, private, link-local, CGNAT, unspecified and their IPv6
//     counterparts / IPv4-mapped forms are rejected)
//   - redirects are followed manually, at most 3 hops, re-checking each hop
//   - 20 s overall timeout, body capped at MAX_UPLOAD_BYTES (25 MiB)
// Failures throw SvelteKit `error()` with 400/403/404/413 so tools and API
// handlers answer alike.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { error } from '@sveltejs/kit';
import {
	MAX_INLINE_UPLOAD_BYTES,
	MAX_UPLOAD_BYTES,
	type AttachmentEntityType
} from '$lib/config/attachments';
import {
	authorizeAttachmentAccess,
	createAttachment,
	resolveEntityContext,
	type AttachmentPublic
} from './attachments';

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;

export type RemoteFile = { bytes: Buffer; filename: string; mimeType: string };

function ipv4ToInt(ip: string): number | null {
	const parts = ip.split('.').map((p) => Number(p));
	if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
		return null;
	}
	return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr4(ip: number, base: string, bits: number): boolean {
	const b = ipv4ToInt(base);
	if (b === null) return false;
	const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
	return (ip & mask) === (b & mask);
}

/** True for addresses that must never be fetched from the server. */
export function isBlockedAddress(addr: string): boolean {
	const kind = isIP(addr);
	if (kind === 4) {
		const ip = ipv4ToInt(addr);
		if (ip === null) return true;
		return (
			inCidr4(ip, '0.0.0.0', 8) ||
			inCidr4(ip, '10.0.0.0', 8) ||
			inCidr4(ip, '100.64.0.0', 10) ||
			inCidr4(ip, '127.0.0.0', 8) ||
			inCidr4(ip, '169.254.0.0', 16) ||
			inCidr4(ip, '172.16.0.0', 12) ||
			inCidr4(ip, '192.168.0.0', 16) ||
			inCidr4(ip, '224.0.0.0', 4) ||
			inCidr4(ip, '240.0.0.0', 4)
		);
	}
	if (kind === 6) {
		const v6 = addr
			.toLowerCase()
			.replace(/^\[|\]$/g, '')
			.split('%')[0];
		// IPv4-mapped / compatible forms carry an embedded dotted quad.
		const mapped = v6.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped) return isBlockedAddress(mapped[1]);
		if (v6 === '::' || v6 === '::1') return true;
		// Expand enough to read the first hextet.
		const first = v6.split(':')[0];
		const hex = first === '' ? 0 : parseInt(first, 16);
		if (Number.isNaN(hex)) return true;
		if ((hex & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
		if ((hex & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
		if ((hex & 0xff00) === 0xff00) return true; // ff00::/8 multicast
		if (v6.startsWith('64:ff9b:')) return true; // NAT64 well-known prefix
		return false;
	}
	return true;
}

async function assertPublicHost(url: URL): Promise<void> {
	if (url.protocol !== 'https:') error(400, 'Only https URLs can be attached.');
	if (url.username || url.password) error(400, 'URLs with credentials are not allowed.');
	const host = url.hostname.replace(/^\[|\]$/g, '');
	if (!host || host === 'localhost' || host.endsWith('.localhost')) {
		error(403, 'That host is not allowed.');
	}
	let addresses: string[];
	if (isIP(host)) {
		addresses = [host];
	} else {
		try {
			addresses = (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
		} catch {
			error(404, `Could not resolve ${host}.`);
		}
	}
	if (addresses.length === 0) error(404, `Could not resolve ${host}.`);
	if (addresses.some(isBlockedAddress)) error(403, 'That host is not allowed.');
}

function filenameFromDisposition(header: string | null): string | null {
	if (!header) return null;
	const star = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/);
	if (star) {
		try {
			return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
		} catch {
			/* fall through */
		}
	}
	const plain = header.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/);
	const v = plain?.[1] ?? plain?.[2];
	return v ? v.trim() : null;
}

export function sanitizeFilename(raw: string | null | undefined): string {
	const base = (raw ?? '')
		.split(/[\\/]/)
		.pop()!
		.split('')
		.filter((ch) => {
			const c = ch.charCodeAt(0);
			return c > 0x1f && c !== 0x7f;
		})
		.join('')
		.trim()
		.slice(0, 200);
	return base || 'file';
}

async function readCapped(res: Response, signal: AbortSignal): Promise<Buffer> {
	const declared = Number(res.headers.get('content-length') ?? 0);
	if (declared > MAX_UPLOAD_BYTES) error(413, 'File exceeds the maximum upload size.');
	if (!res.body) return Buffer.alloc(0);
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		if (signal.aborted) error(400, 'Download timed out.');
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_UPLOAD_BYTES) {
			await reader.cancel().catch(() => {});
			error(413, 'File exceeds the maximum upload size.');
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}

/**
 * Download a public https resource with the SSRF rules above. Filename comes
 * from `Content-Disposition`, else the last URL path segment, else `file`.
 */
export async function fetchRemoteFile(url: string): Promise<RemoteFile> {
	let current: URL;
	try {
		current = new URL(url);
	} catch {
		error(400, 'Invalid URL.');
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		let res: Response | null = null;
		for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
			await assertPublicHost(current);
			let attempt: Response;
			try {
				attempt = await fetch(current, {
					redirect: 'manual',
					signal: controller.signal,
					headers: { accept: '*/*', 'user-agent': 'trackr-attach/1.0' }
				});
			} catch (e) {
				if (controller.signal.aborted) error(400, 'Download timed out.');
				error(404, `Could not fetch ${current.hostname}: ${(e as Error).message}`);
			}
			if (attempt.status >= 300 && attempt.status < 400) {
				const loc = attempt.headers.get('location');
				await attempt.body?.cancel().catch(() => {});
				if (!loc) error(404, 'Redirect without a location.');
				if (hop === MAX_REDIRECTS) error(400, 'Too many redirects.');
				try {
					current = new URL(loc, current);
				} catch {
					error(400, 'Invalid redirect location.');
				}
				continue;
			}
			res = attempt;
			break;
		}
		if (!res) error(400, 'Too many redirects.');
		if (!res.ok) {
			await res.body?.cancel().catch(() => {});
			error(res.status === 404 ? 404 : 400, `Remote server answered ${res.status}.`);
		}
		const bytes = await readCapped(res, controller.signal);
		if (bytes.length === 0) error(400, 'The remote file is empty.');
		const lastSegment = decodeURIComponent(current.pathname.split('/').filter(Boolean).pop() ?? '');
		const filename = sanitizeFilename(
			filenameFromDisposition(res.headers.get('content-disposition')) ?? lastSegment
		);
		const mimeType =
			res.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ||
			'application/octet-stream';
		return { bytes, filename, mimeType };
	} finally {
		clearTimeout(timer);
	}
}

// ─── Inline (base64) uploads ────────────────────────────────────────────────

/** MIME by extension for inline uploads that don't declare one. Images are
 *  re-sniffed by `createAttachment` anyway; this mostly matters for previews
 *  and downloads of documents. */
const MIME_BY_EXTENSION: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	heic: 'image/heic',
	heif: 'image/heif',
	svg: 'image/svg+xml',
	pdf: 'application/pdf',
	txt: 'text/plain',
	md: 'text/markdown',
	csv: 'text/csv',
	json: 'application/json',
	xml: 'application/xml',
	html: 'text/html',
	zip: 'application/zip',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

export function mimeFromFilename(filename: string): string {
	const ext = filename.toLowerCase().split('.').pop() ?? '';
	return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Decode a base64 payload sent inline through MCP. Accepts a bare base64
 * string or a `data:*;base64,` URL, ignores whitespace, and rejects anything
 * that would decode to more than MAX_INLINE_UPLOAD_BYTES *before* decoding
 * (the encoded length bounds the decoded size), so an oversized payload
 * never gets buffered twice.
 */
export function decodeInlineUpload(content: string): Buffer {
	let b64 = content.trim();
	const dataUrl = /^data:[^;,]*;base64,/i.exec(b64);
	if (dataUrl) b64 = b64.slice(dataUrl[0].length);
	b64 = b64.replace(/\s+/g, '');
	if (!b64) error(400, 'The file content is empty.');
	// Every 4 base64 chars encode 3 bytes; padding only makes it smaller.
	if ((b64.length * 3) / 4 - 2 > MAX_INLINE_UPLOAD_BYTES) {
		error(413, `Inline files are limited to ${MAX_INLINE_UPLOAD_BYTES / 1024 / 1024} MiB.`);
	}
	if (!BASE64_RE.test(b64)) error(400, 'The file content is not valid base64.');
	const bytes = Buffer.from(b64, 'base64');
	if (bytes.length === 0) error(400, 'The file content is empty.');
	if (bytes.length > MAX_INLINE_UPLOAD_BYTES) {
		error(413, `Inline files are limited to ${MAX_INLINE_UPLOAD_BYTES / 1024 / 1024} MiB.`);
	}
	return bytes;
}

// ─── Attaching ──────────────────────────────────────────────────────────────

type AttachTarget = {
	entityType: Extract<AttachmentEntityType, 'ticket' | 'task'>;
	entityId: string;
};

export type AttachFromUrlInput = AttachTarget & {
	url: string;
	/** Overrides the detected filename. */
	filename?: string | null;
};

export type AttachBytesInput = AttachTarget & {
	bytes: Buffer;
	filename: string;
	/** Declared MIME; derived from the filename when omitted. */
	mimeType?: string | null;
};

/**
 * Prove the parent exists (404) and the caller may write to it (403), then
 * store the file via `createAttachment` (400/413 on empty / too large).
 */
async function attachToEntity(
	locals: App.Locals,
	target: AttachTarget,
	file: RemoteFile
): Promise<AttachmentPublic> {
	if (!locals.user) error(401, 'Not authenticated.');
	if (target.entityType !== 'ticket' && target.entityType !== 'task') {
		error(400, 'Attachments can be added to tickets and tasks only.');
	}
	const ctx = await resolveEntityContext(target.entityType, target.entityId);
	if (!ctx) error(404, 'Not found.');
	if (!(await authorizeAttachmentAccess(locals, target.entityType, ctx, 'write'))) {
		error(403, 'You do not have permission to attach files here.');
	}
	try {
		return await createAttachment({
			entityType: target.entityType,
			entityId: target.entityId,
			orgId: ctx.orgId,
			projectId: ctx.projectId,
			bytes: file.bytes,
			filename: file.filename,
			mimeType: file.mimeType,
			uploadedBy: locals.user.id
		});
	} catch (e) {
		const code = (e as { code?: string }).code;
		if (code === 'too_large') error(413, 'File exceeds the maximum upload size.');
		if (code === 'empty') error(400, 'The file is empty.');
		throw e;
	}
}

/**
 * Attach a remote https file to a ticket or task as the calling user
 * (download errors: 400/403/404/413).
 */
export async function attachFromUrl(
	locals: App.Locals,
	input: AttachFromUrlInput
): Promise<AttachmentPublic> {
	// Access is checked before the download so a stranger can't use us as a
	// fetch proxy; attachToEntity re-checks it, which is cheap.
	if (!locals.user) error(401, 'Not authenticated.');
	const ctx = await resolveEntityContext(input.entityType, input.entityId);
	if (!ctx) error(404, 'Not found.');
	if (!(await authorizeAttachmentAccess(locals, input.entityType, ctx, 'write'))) {
		error(403, 'You do not have permission to attach files here.');
	}
	const remote = await fetchRemoteFile(input.url);
	return attachToEntity(locals, input, {
		...remote,
		filename: input.filename?.trim() ? sanitizeFilename(input.filename) : remote.filename
	});
}

/** Attach bytes the caller sent inline (already decoded and size-checked). */
export async function attachBytes(
	locals: App.Locals,
	input: AttachBytesInput
): Promise<AttachmentPublic> {
	const filename = sanitizeFilename(input.filename);
	const mimeType = input.mimeType?.split(';')[0].trim().toLowerCase() || mimeFromFilename(filename);
	return attachToEntity(locals, input, { bytes: input.bytes, filename, mimeType });
}
