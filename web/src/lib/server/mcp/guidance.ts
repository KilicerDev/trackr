/**
 * Admin-authored guidance for MCP clients (Settings → MCP).
 *
 * Two things live here:
 *  - `instructions`: free text appended to the built-in server instructions
 *    the client receives on `initialize` (claude.ai puts it in the system
 *    prompt verbatim). Keep it short — it costs context in every conversation.
 *  - guides: longer markdown documents (how-tos, hardware install tutorials)
 *    the assistant reads on demand via the `get_guide` tool or the
 *    trackr://guide/{slug} resource. A guide can be typed in, uploaded, or
 *    snapshotted from a public URL (fetched server-side, HTML → markdown).
 *
 * Both are readable by anyone with MCP access; management needs
 * admin.settings.manage (enforced by the route, not here). `loadGuidance` is
 * called once per MCP request, so the result is memoised briefly and the
 * cache is dropped on every write.
 */

import { asc, eq, max } from 'drizzle-orm';
import { JSDOM } from 'jsdom';
import { db } from '$lib/server/db';
import { mcpGuide, mcpSettings, type McpGuide } from '$lib/server/db/app.schema';
import { fetchRemoteFile } from '$lib/server/attachments-fetch';
import { docHtmlToMarkdown } from '$lib/server/content/markdown';

export const INSTRUCTIONS_MAX_CHARS = 8_000;
export const GUIDE_BODY_MAX_CHARS = 64 * 1024;
export const GUIDE_TITLE_MAX_CHARS = 120;
export const GUIDE_SUMMARY_MAX_CHARS = 200;
const SETTINGS_ID = 'default';
const CACHE_TTL_MS = 10_000;

export type GuideRow = McpGuide;
export type GuideIndexEntry = { slug: string; title: string; summary: string };
export type Guidance = { instructions: string; guides: GuideIndexEntry[] };

export class GuidanceError extends Error {
	constructor(
		public readonly code:
			| 'too_long'
			| 'invalid_slug'
			| 'slug_taken'
			| 'title_required'
			| 'invalid_url'
			| 'fetch_failed'
			| 'not_found',
		message: string
	) {
		super(message);
		this.name = 'GuidanceError';
	}
}

// ─── Instructions ───────────────────────────────────────────────────────────

export async function getInstructions(): Promise<{
	instructions: string;
	updatedAt: Date | null;
	updatedById: string | null;
}> {
	const [row] = await db.select().from(mcpSettings).where(eq(mcpSettings.id, SETTINGS_ID)).limit(1);
	return row
		? { instructions: row.instructions, updatedAt: row.updatedAt, updatedById: row.updatedById }
		: { instructions: '', updatedAt: null, updatedById: null };
}

export async function setInstructions(text: string, actorId: string): Promise<void> {
	const instructions = text.replace(/\r\n/g, '\n').trim();
	if (instructions.length > INSTRUCTIONS_MAX_CHARS) {
		throw new GuidanceError(
			'too_long',
			`Instructions are limited to ${INSTRUCTIONS_MAX_CHARS} characters.`
		);
	}
	await db
		.insert(mcpSettings)
		.values({ id: SETTINGS_ID, instructions, updatedById: actorId, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: mcpSettings.id,
			set: { instructions, updatedById: actorId, updatedAt: new Date() }
		});
	invalidate();
}

// ─── Guides ─────────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** "Proxmox host install (v8)" → "proxmox-host-install-v8". */
export function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64)
		.replace(/-+$/, '');
}

export function isValidSlug(slug: string): boolean {
	return SLUG_RE.test(slug);
}

export async function listGuides(): Promise<GuideRow[]> {
	return db.select().from(mcpGuide).orderBy(asc(mcpGuide.position), asc(mcpGuide.createdAt));
}

export async function getGuide(id: string): Promise<GuideRow | null> {
	const [row] = await db.select().from(mcpGuide).where(eq(mcpGuide.id, id)).limit(1);
	return row ?? null;
}

/** Enabled guide by slug — what the MCP tool and resource read. */
export async function getEnabledGuideBySlug(slug: string): Promise<GuideRow | null> {
	const [row] = await db
		.select()
		.from(mcpGuide)
		.where(eq(mcpGuide.slug, slug.trim().toLowerCase()))
		.limit(1);
	return row && row.enabled ? row : null;
}

export type GuideInput = {
	title: string;
	slug?: string;
	summary?: string;
	body?: string;
	sourceUrl?: string | null;
	enabled?: boolean;
	/** Set when `body` was just imported from `sourceUrl`; undefined leaves it unchanged. */
	fetchedAt?: Date | null;
};

type CleanGuide = {
	title: string;
	slug: string;
	summary: string;
	body: string;
	sourceUrl: string | null;
	enabled: boolean;
};

function clean(input: GuideInput, fallbackSlugFrom?: string): CleanGuide {
	const title = input.title.trim().slice(0, GUIDE_TITLE_MAX_CHARS);
	if (!title) throw new GuidanceError('title_required', 'A title is required.');
	const slug = (input.slug?.trim() || slugify(fallbackSlugFrom ?? title)).toLowerCase();
	if (!isValidSlug(slug)) {
		throw new GuidanceError(
			'invalid_slug',
			'Slug may contain lowercase letters, digits and dashes (max 64 characters).'
		);
	}
	const body = (input.body ?? '').replace(/\r\n/g, '\n').trim();
	if (body.length > GUIDE_BODY_MAX_CHARS) {
		throw new GuidanceError(
			'too_long',
			`Guide body is limited to ${GUIDE_BODY_MAX_CHARS.toLocaleString('en')} characters.`
		);
	}
	const sourceUrl = input.sourceUrl?.trim() || null;
	if (sourceUrl) assertHttpsUrl(sourceUrl);
	return {
		title,
		slug,
		summary: (input.summary ?? '').trim().slice(0, GUIDE_SUMMARY_MAX_CHARS),
		body,
		sourceUrl,
		enabled: input.enabled ?? true
	};
}

function assertHttpsUrl(url: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new GuidanceError('invalid_url', 'Source must be a valid https URL.');
	}
	if (parsed.protocol !== 'https:') {
		throw new GuidanceError('invalid_url', 'Source must be an https URL.');
	}
	return parsed;
}

function isUniqueViolation(err: unknown): boolean {
	// postgres-js raises `code` on the error; newer drizzle wraps it in a
	// DrizzleQueryError whose `cause` carries the original.
	for (let e = err, hops = 0; e && typeof e === 'object' && hops < 3; hops++) {
		if ((e as { code?: string }).code === '23505') return true;
		e = (e as { cause?: unknown }).cause;
	}
	return false;
}

export async function createGuide(input: GuideInput, actorId: string): Promise<GuideRow> {
	const values = clean(input);
	const [{ top }] = await db.select({ top: max(mcpGuide.position) }).from(mcpGuide);
	const position = (top ?? -1) + 1;
	try {
		const [row] = await db
			.insert(mcpGuide)
			.values({
				id: crypto.randomUUID(),
				...values,
				fetchedAt: values.sourceUrl ? (input.fetchedAt ?? null) : null,
				position,
				createdById: actorId,
				updatedById: actorId
			})
			.returning();
		invalidate();
		return row;
	} catch (err) {
		if (isUniqueViolation(err)) {
			throw new GuidanceError('slug_taken', `A guide with slug "${values.slug}" already exists.`);
		}
		throw err;
	}
}

export async function updateGuide(
	id: string,
	input: GuideInput,
	actorId: string
): Promise<GuideRow> {
	const existing = await getGuide(id);
	if (!existing) throw new GuidanceError('not_found', 'Guide not found.');
	const values = clean(input, existing.slug);
	try {
		const [row] = await db
			.update(mcpGuide)
			.set({
				...values,
				...(input.fetchedAt !== undefined || !values.sourceUrl
					? { fetchedAt: values.sourceUrl ? input.fetchedAt : null }
					: {}),
				updatedById: actorId,
				updatedAt: new Date()
			})
			.where(eq(mcpGuide.id, id))
			.returning();
		invalidate();
		return row;
	} catch (err) {
		if (isUniqueViolation(err)) {
			throw new GuidanceError('slug_taken', `A guide with slug "${values.slug}" already exists.`);
		}
		throw err;
	}
}

export async function setGuideEnabled(id: string, enabled: boolean, actorId: string) {
	const [row] = await db
		.update(mcpGuide)
		.set({ enabled, updatedById: actorId, updatedAt: new Date() })
		.where(eq(mcpGuide.id, id))
		.returning({ id: mcpGuide.id, title: mcpGuide.title });
	invalidate();
	return row ?? null;
}

export async function deleteGuide(id: string): Promise<GuideRow | null> {
	const [row] = await db.delete(mcpGuide).where(eq(mcpGuide.id, id)).returning();
	invalidate();
	return row ?? null;
}

// ─── URL import ─────────────────────────────────────────────────────────────

const STRIP_SELECTORS = [
	'script',
	'style',
	'noscript',
	'template',
	'iframe',
	'svg',
	'canvas',
	'nav',
	'header',
	'footer',
	'aside',
	'form',
	'[role="navigation"]',
	'[role="banner"]',
	'[role="contentinfo"]',
	'[role="complementary"]',
	'[aria-hidden="true"]',
	'.sidebar',
	'.toc',
	'.table-of-contents',
	'.breadcrumb',
	'.breadcrumbs',
	'.cookie',
	'.advert',
	'.ad',
	// MediaWiki chrome (Proxmox, Arch wiki, …)
	'.mw-jump-link',
	'.mw-editsection',
	'#toc',
	'.printfooter',
	'.catlinks',
	'.noprint',
	// Inline images blow the size budget and mean nothing to the model.
	'img[src^="data:"]'
];

/**
 * Reduce a fetched page to the article body as markdown: prefer `<main>` /
 * `<article>` / the role=main region, drop chrome (nav, header, footer,
 * sidebars, scripts), make relative links absolute, then run the same
 * turndown pipeline the wiki uses.
 */
export function htmlPageToMarkdown(html: string, baseUrl: string): string {
	const dom = new JSDOM(html, { url: baseUrl });
	const doc = dom.window.document;
	for (const el of doc.querySelectorAll(STRIP_SELECTORS.join(','))) el.remove();
	const root =
		doc.querySelector('main') ??
		doc.querySelector('article') ??
		doc.querySelector('[role="main"]') ??
		doc.querySelector('#content, #main, .content, .markdown-body, .post, .entry-content') ??
		doc.body;
	if (!root) return '';
	// Absolute hrefs/srcs so the assistant can follow links from the snapshot.
	for (const a of root.querySelectorAll('a[href]')) {
		try {
			a.setAttribute('href', new URL(a.getAttribute('href') ?? '', baseUrl).href);
		} catch {
			/* leave as is */
		}
	}
	for (const img of root.querySelectorAll('img[src]')) {
		try {
			img.setAttribute('src', new URL(img.getAttribute('src') ?? '', baseUrl).href);
		} catch {
			/* leave as is */
		}
	}
	return docHtmlToMarkdown(root.innerHTML);
}

export type FetchedGuide = { body: string; title: string | null; truncated: boolean };

/**
 * Download a public page and convert it to markdown for a guide body. Plain
 * markdown/text responses are used verbatim; HTML goes through
 * `htmlPageToMarkdown`. Result is capped at GUIDE_BODY_MAX_CHARS.
 */
export async function fetchGuideFromUrl(url: string): Promise<FetchedGuide> {
	assertHttpsUrl(url);
	let file;
	try {
		file = await fetchRemoteFile(url);
	} catch (err) {
		const message =
			err && typeof err === 'object' && 'body' in err
				? ((err as { body?: { message?: string } }).body?.message ?? 'Fetch failed.')
				: err instanceof Error
					? err.message
					: 'Fetch failed.';
		throw new GuidanceError('fetch_failed', message);
	}
	const mime = file.mimeType.split(';')[0].trim().toLowerCase();
	const textBody = file.bytes.toString('utf8');
	let body: string;
	let title: string | null;
	const looksHtml = mime === 'text/html' || mime === 'application/xhtml+xml';
	const looksMarkdown =
		mime === 'text/markdown' ||
		mime === 'text/x-markdown' ||
		/\.(md|markdown)$/i.test(new URL(url).pathname);
	if (looksHtml || (!looksMarkdown && /^\s*<(!doctype|html)/i.test(textBody))) {
		const m = /<title[^>]*>([^<]*)<\/title>/i.exec(textBody);
		title = m ? m[1].trim().replace(/\s+/g, ' ') : null;
		body = htmlPageToMarkdown(textBody, url);
	} else if (looksMarkdown || mime.startsWith('text/')) {
		body = textBody.replace(/\r\n/g, '\n').trim();
		const heading = /^#\s+(.+)$/m.exec(body);
		title = heading ? heading[1].trim() : null;
	} else {
		throw new GuidanceError(
			'fetch_failed',
			`Unsupported content type ${mime || 'unknown'} — only HTML, markdown or plain text pages can be imported.`
		);
	}
	const truncated = body.length > GUIDE_BODY_MAX_CHARS;
	if (truncated) body = body.slice(0, GUIDE_BODY_MAX_CHARS).trimEnd() + '\n\n…(truncated)';
	return { body, title, truncated };
}

/** Re-download a guide's source URL into its body. */
export async function refreshGuide(id: string, actorId: string): Promise<GuideRow> {
	const existing = await getGuide(id);
	if (!existing) throw new GuidanceError('not_found', 'Guide not found.');
	if (!existing.sourceUrl) {
		throw new GuidanceError('invalid_url', 'This guide has no source URL to refresh from.');
	}
	const fetched = await fetchGuideFromUrl(existing.sourceUrl);
	const [row] = await db
		.update(mcpGuide)
		.set({
			body: fetched.body,
			fetchedAt: new Date(),
			updatedById: actorId,
			updatedAt: new Date()
		})
		.where(eq(mcpGuide.id, id))
		.returning();
	invalidate();
	return row;
}

// ─── Per-request loader ─────────────────────────────────────────────────────

let cached: { at: number; value: Guidance } | null = null;

function invalidate(): void {
	cached = null;
}

/**
 * Instructions + the index of enabled guides, for `buildServer`. Memoised for
 * a few seconds so a chatty client does not hit the database on every
 * tools/list; writes above drop the cache immediately.
 */
export async function loadGuidance(): Promise<Guidance> {
	const now = Date.now();
	if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;
	const [settings, guides] = await Promise.all([
		getInstructions(),
		db
			.select({ slug: mcpGuide.slug, title: mcpGuide.title, summary: mcpGuide.summary })
			.from(mcpGuide)
			.where(eq(mcpGuide.enabled, true))
			.orderBy(asc(mcpGuide.position), asc(mcpGuide.createdAt))
	]);
	const value: Guidance = { instructions: settings.instructions, guides };
	cached = { at: now, value };
	return value;
}
