/**
 * Rules for the multi-instance switcher (TRACK-140), shared by the browser
 * (add form, handoff parsing) and the server (`/api/instances` validation).
 * No runtime imports so it stays isomorphic. The iOS app mirrors
 * `normalizeInstanceUrl` in ServerConfig.swift — keep them in step.
 */

export const INSTANCES_MAX = 20;
export const INSTANCE_NAME_MAX_CHARS = 40;

/** Name of the fragment key a switch link carries: `https://b.example/#from=<origin>`. */
export const HANDOFF_PARAM = 'from';
/** sessionStorage slot the root layout parks a pending handoff in. */
export const HANDOFF_STORAGE_KEY = 'trackr.instanceHandoff';

/**
 * A user-typed server address → canonical instance URL, or null when it is
 * not a usable http(s) address. Bare hosts get https://, trailing slashes go,
 * a base path is kept, query/fragment/credentials are refused.
 */
export function normalizeInstanceUrl(raw: string | null | undefined): string | null {
	let text = (raw ?? '').trim();
	if (!text) return null;
	if (!text.includes('://')) text = `https://${text}`;
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	if (!url.hostname) return null;
	if (url.username || url.password) return null;
	if (url.search || url.hash) return null;
	const path = url.pathname.replace(/\/+$/, '');
	if (/[^A-Za-z0-9._~\-/%]/.test(path)) return null;
	return `${url.origin}${path}`;
}

/** Host (+ port, + base path) for display next to the friendly name. */
export function instanceHost(url: string): string {
	try {
		const u = new URL(url);
		const path = u.pathname.replace(/\/+$/, '');
		return `${u.host}${path}`;
	} catch {
		return url;
	}
}

export function sameInstance(a: string, b: string): boolean {
	const na = normalizeInstanceUrl(a);
	const nb = normalizeInstanceUrl(b);
	return na !== null && na === nb;
}

/** Display name from a probe: trimmed, collapsed, capped; the host when empty. */
export function sanitizeInstanceName(raw: unknown, fallbackUrl: string): string {
	const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
	if (!name) return instanceHost(fallbackUrl);
	return name.length > INSTANCE_NAME_MAX_CHARS ? name.slice(0, INSTANCE_NAME_MAX_CHARS) : name;
}

/**
 * A logo URL is only kept when it is an absolute http(s) URL on the instance's
 * own origin — the sidebar renders it in an <img>, so nothing else may sneak
 * in (javascript:, data:, or a third-party tracker).
 */
export function sanitizeLogoUrl(raw: unknown, instanceUrl: string): string | null {
	if (typeof raw !== 'string' || !raw) return null;
	try {
		const logo = new URL(raw);
		const origin = new URL(instanceUrl).origin;
		if (logo.protocol !== 'http:' && logo.protocol !== 'https:') return null;
		if (logo.origin !== origin) return null;
		return logo.href;
	} catch {
		return null;
	}
}

export type ProbeResult = { name: string; logoUrl: string | null };

/**
 * Read `/api/v1/instance`'s body. Null unless it identifies as trackr; the
 * branding block is optional (older instances answer without it).
 */
export function parseInstanceProbe(body: unknown, instanceUrl: string): ProbeResult | null {
	if (typeof body !== 'object' || body === null) return null;
	const b = body as { name?: unknown; branding?: unknown };
	if (b.name !== 'trackr') return null;
	const branding =
		typeof b.branding === 'object' && b.branding !== null
			? (b.branding as { name?: unknown; logoUrl?: unknown })
			: {};
	return {
		name: sanitizeInstanceName(branding.name, instanceUrl),
		logoUrl: sanitizeLogoUrl(branding.logoUrl, instanceUrl)
	};
}

/** The link the switcher navigates to: the target plus the source in the fragment. */
export function switchUrl(target: string, source: string): string {
	return `${target}/#${HANDOFF_PARAM}=${encodeURIComponent(source)}`;
}

/** `#from=<origin>` → normalized source URL, or null for anything else. */
export function parseHandoffHash(hash: string): string | null {
	const raw = hash.startsWith('#') ? hash.slice(1) : hash;
	if (!raw) return null;
	let params: URLSearchParams;
	try {
		params = new URLSearchParams(raw);
	} catch {
		return null;
	}
	return normalizeInstanceUrl(params.get(HANDOFF_PARAM));
}
