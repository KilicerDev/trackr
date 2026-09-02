/**
 * Destination URL policy for outbound webhooks — the save-time half.
 *
 * Strict by default: https only, and the host must resolve to a public
 * address. The Go worker re-checks the address it actually connects to
 * (services/worker/internal/webhook), so this is the friendly early error, not
 * the security boundary. `WEBHOOK_ALLOW_PRIVATE_URLS=true` (dev only, read by
 * both sides) permits http and private/loopback destinations.
 */

import { env } from '$env/dynamic/private';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type UrlPolicyError =
	| 'invalid'
	| 'scheme'
	| 'host'
	| 'credentials'
	| 'private'
	| 'unresolvable';

export function allowPrivateUrls(): boolean {
	const v = env.WEBHOOK_ALLOW_PRIVATE_URLS;
	return v === 'true' || v === '1';
}

/** Mirrors IsPublicIP in the Go worker. */
export function isPublicIp(ip: string): boolean {
	const kind = isIP(ip);
	if (kind === 4) return isPublicV4(ip.split('.').map(Number));
	if (kind === 6) return isPublicV6(ip);
	return false;
}

function isPublicV4(o: number[]): boolean {
	const [a, b] = o;
	if (a === 0 || a === 10 || a === 127) return false;
	if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
	if (a === 169 && b === 254) return false;
	if (a === 172 && b >= 16 && b <= 31) return false;
	if (a === 192 && b === 168) return false;
	if (a === 192 && b === 0 && o[2] === 0) return false;
	if (a >= 224) return false; // multicast + reserved + broadcast
	return true;
}

function isPublicV6(ip: string): boolean {
	const lower = ip.toLowerCase();
	// IPv4-mapped (::ffff:a.b.c.d) — judge the embedded v4.
	const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped) return isPublicV4(mapped[1].split('.').map(Number));
	if (lower === '::' || lower === '::1') return false;
	const first = parseInt(lower.split(':')[0] || '0', 16);
	if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
	if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
	if ((first & 0xff00) === 0xff00) return false; // multicast
	return true;
}

export type UrlCheck = { ok: true; url: string } | { ok: false; error: UrlPolicyError };

/**
 * Normalise + validate a destination. Resolves the hostname (all records) and
 * rejects it if any answer is private — a mixed record set is not trustworthy.
 */
export async function validateWebhookUrl(raw: string): Promise<UrlCheck> {
	const allowPrivate = allowPrivateUrls();
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		return { ok: false, error: 'invalid' };
	}
	if (u.protocol !== 'https:' && !(allowPrivate && u.protocol === 'http:')) {
		return { ok: false, error: 'scheme' };
	}
	if (!u.hostname) return { ok: false, error: 'host' };
	if (u.username || u.password) return { ok: false, error: 'credentials' };
	u.hash = '';

	if (allowPrivate) return { ok: true, url: u.toString() };

	const host = u.hostname.replace(/^\[|\]$/g, '');
	if (host === 'localhost' || host.endsWith('.localhost')) return { ok: false, error: 'private' };
	if (isIP(host)) {
		return isPublicIp(host) ? { ok: true, url: u.toString() } : { ok: false, error: 'private' };
	}
	let answers: { address: string }[];
	try {
		answers = await lookup(host, { all: true });
	} catch {
		return { ok: false, error: 'unresolvable' };
	}
	if (answers.length === 0) return { ok: false, error: 'unresolvable' };
	if (answers.some((a) => !isPublicIp(a.address))) return { ok: false, error: 'private' };
	return { ok: true, url: u.toString() };
}
