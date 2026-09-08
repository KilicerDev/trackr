/**
 * Instance branding service (white-label): the display name and logo an admin
 * sets under Settings → General. Read on every page render (root layout +
 * hooks) and in every outgoing email, so the row is memoised briefly; the
 * cache is dropped on every write. No row = stock "Trackr" branding.
 */

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '$lib/server/db';
import { instanceBranding } from '$lib/server/db/app.schema';
import {
	DEFAULT_BRAND_NAME,
	LOGO_ACCEPTED_MIMES,
	LOGO_MAX_BYTES,
	LOGO_MAX_EDGE,
	LOGO_SVG_MIME,
	logoUrlFor,
	normalizeBrandName,
	svgLooksSafe,
	type PublicBranding
} from './branding-rules';

export type { PublicBranding } from './branding-rules';
export * from './branding-rules';

const ROW_ID = 'default';
const CACHE_TTL_MS = 10_000;

export type Branding = PublicBranding & {
	logoVersion: string | null;
	updatedAt: Date | null;
	updatedById: string | null;
};

export class BrandingError extends Error {
	constructor(
		public readonly code: 'name_too_long' | 'logo_type' | 'logo_too_large' | 'logo_invalid',
		message: string
	) {
		super(message);
		this.name = 'BrandingError';
	}
}

const STOCK: Branding = {
	name: DEFAULT_BRAND_NAME,
	logoUrl: null,
	logoVersion: null,
	updatedAt: null,
	updatedById: null
};

let cache: { at: number; value: Branding } | null = null;

function invalidate() {
	cache = null;
}

/** Current branding (name + logo URL). Cached for a few seconds. */
export async function getBranding(): Promise<Branding> {
	if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
	const [row] = await db
		.select({
			name: instanceBranding.name,
			logoVersion: instanceBranding.logoVersion,
			updatedAt: instanceBranding.updatedAt,
			updatedById: instanceBranding.updatedById
		})
		.from(instanceBranding)
		.where(eq(instanceBranding.id, ROW_ID))
		.limit(1);
	const value: Branding = row
		? {
				name: row.name || DEFAULT_BRAND_NAME,
				logoUrl: logoUrlFor(row.logoVersion),
				logoVersion: row.logoVersion,
				updatedAt: row.updatedAt,
				updatedById: row.updatedById
			}
		: STOCK;
	cache = { at: Date.now(), value };
	return value;
}

/** The shape handed to pages and templates. */
export function publicBranding(b: Branding): PublicBranding {
	return { name: b.name, logoUrl: b.logoUrl };
}

/** Stored logo bytes for the /brand/logo route; null when unset. */
export async function getBrandLogo(): Promise<{
	mime: string;
	data: Uint8Array;
	version: string;
} | null> {
	const [row] = await db
		.select({
			mime: instanceBranding.logoMime,
			data: instanceBranding.logoData,
			version: instanceBranding.logoVersion
		})
		.from(instanceBranding)
		.where(eq(instanceBranding.id, ROW_ID))
		.limit(1);
	if (!row?.mime || !row.data || !row.version) return null;
	return { mime: row.mime, data: row.data, version: row.version };
}

async function upsert(set: Partial<typeof instanceBranding.$inferInsert>, actorId: string) {
	const patch = { ...set, updatedById: actorId, updatedAt: new Date() };
	await db
		.insert(instanceBranding)
		.values({ id: ROW_ID, ...patch })
		.onConflictDoUpdate({ target: instanceBranding.id, set: patch });
	invalidate();
}

export async function setBrandName(input: string, actorId: string): Promise<string> {
	const check = normalizeBrandName(input);
	if (!check.ok) throw new BrandingError('name_too_long', 'Name is too long.');
	await upsert({ name: check.name }, actorId);
	return check.name;
}

/**
 * Store a new logo. Rasters are decoded with sharp and re-encoded as PNG no
 * larger than LOGO_MAX_EDGE (strips metadata, normalizes orientation, bounds
 * the payload). SVGs are kept verbatim after the safety gate.
 */
export async function setBrandLogo(
	bytes: Uint8Array,
	declaredMime: string,
	actorId: string
): Promise<string> {
	if (bytes.byteLength > LOGO_MAX_BYTES) {
		throw new BrandingError('logo_too_large', 'The logo is too large.');
	}
	const mime = declaredMime.split(';', 1)[0].trim().toLowerCase();
	if (!(LOGO_ACCEPTED_MIMES as readonly string[]).includes(mime)) {
		throw new BrandingError('logo_type', 'Unsupported image type.');
	}

	let stored: Uint8Array;
	let storedMime: string;
	if (mime === LOGO_SVG_MIME) {
		const source = Buffer.from(bytes).toString('utf8');
		if (!svgLooksSafe(source)) {
			throw new BrandingError('logo_invalid', 'The SVG could not be accepted.');
		}
		stored = bytes;
		storedMime = LOGO_SVG_MIME;
	} else {
		try {
			stored = await sharp(Buffer.from(bytes), { animated: false })
				.rotate()
				.resize(LOGO_MAX_EDGE, LOGO_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
				.png({ compressionLevel: 9 })
				.toBuffer();
		} catch {
			throw new BrandingError('logo_invalid', 'The file could not be read as an image.');
		}
		storedMime = 'image/png';
	}

	const version = createHash('sha256').update(stored).digest('base64url').slice(0, 16);
	await upsert({ logoMime: storedMime, logoData: stored, logoVersion: version }, actorId);
	return version;
}

export async function clearBrandLogo(actorId: string): Promise<void> {
	await upsert({ logoMime: null, logoData: null, logoVersion: null }, actorId);
}
