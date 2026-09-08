/**
 * Pure rules for instance branding (no DB, no sharp) — the validation and URL
 * building shared by the branding service, the admin form and the email
 * renderer. Kept import-free so it can be unit-tested and reused anywhere.
 */

export const DEFAULT_BRAND_NAME = 'Trackr';
export const BRAND_NAME_MAX_CHARS = 40;
/** Upload cap. Rasters are re-encoded to ≤256px PNG afterwards, so this only
 *  bounds what we are willing to decode. */
export const LOGO_MAX_BYTES = 512 * 1024;
/** Longest edge of the stored raster logo. Enough for a 2× 64px sidebar mark,
 *  the favicon and the 24px email header. */
export const LOGO_MAX_EDGE = 256;
export const LOGO_PATH = '/brand/logo';

export const LOGO_RASTER_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const LOGO_SVG_MIME = 'image/svg+xml';
export const LOGO_ACCEPTED_MIMES = [...LOGO_RASTER_MIMES, LOGO_SVG_MIME] as const;

/** The branding shape exposed to pages (via root layout data) and templates. */
export type PublicBranding = {
	name: string;
	/** Site-relative logo URL with cache-busting version, or null for the
	 *  built-in three-bar mark. */
	logoUrl: string | null;
};

export type BrandNameCheck = { ok: true; name: string } | { ok: false; code: 'too_long' };

/**
 * Normalize a typed brand name: collapse whitespace, trim, cap length. An
 * empty value means "use the default".
 */
export function normalizeBrandName(input: string | null | undefined): BrandNameCheck {
	const name = (input ?? '').replace(/\s+/g, ' ').trim();
	if (name.length > BRAND_NAME_MAX_CHARS) return { ok: false, code: 'too_long' };
	return { ok: true, name: name || DEFAULT_BRAND_NAME };
}

/** Public URL for the stored logo, or null when no logo is set. */
export function logoUrlFor(version: string | null | undefined): string | null {
	return version ? `${LOGO_PATH}?v=${encodeURIComponent(version)}` : null;
}

/**
 * Absolute logo URL for contexts without a document base (emails). `reference`
 * is any absolute URL of the deployment the mail links to — the logo lives on
 * the same origin. Returns null when the logo is unset or no absolute origin
 * can be derived (a relative reference), in which case callers fall back to
 * the built-in mark.
 */
export function absoluteLogoUrl(
	brand: PublicBranding,
	reference: string | null | undefined
): string | null {
	if (!brand.logoUrl || !reference) return null;
	try {
		const origin = new URL(reference).origin;
		if (!/^https?:\/\//.test(origin)) return null;
		return origin + brand.logoUrl;
	} catch {
		return null;
	}
}

/**
 * Minimal SVG safety gate. The logo is only ever placed in <img> (where
 * scripts never run), but the file is also reachable directly at /brand/logo,
 * so refuse anything that could execute or load remote content when opened as
 * a document. Admin-only upload, so this is defense in depth, not a sandbox.
 */
export function svgLooksSafe(source: string): boolean {
	const head = source.slice(0, 4096);
	if (!/<svg[\s>]/i.test(head)) return false;
	const lowered = source.toLowerCase();
	if (/<\s*(script|foreignobject|iframe|embed|object|use)\b/.test(lowered)) return false;
	if (/\son[a-z]+\s*=/.test(lowered)) return false;
	if (/javascript:|data:text\/html|<!entity/.test(lowered)) return false;
	// Remote loads (images, fonts) would ping a third party from every viewer.
	if (/\b(href|src)\s*=\s*["']?\s*(https?:)?\/\//.test(lowered)) return false;
	return true;
}
