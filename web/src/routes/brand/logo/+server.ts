// Public: serves the uploaded instance logo (sidebar, sign-in page, favicon,
// email header). Unauthenticated on purpose — the sign-in page and mail
// clients need it. URLs carry the content hash as `?v=`, so a matching
// request is cacheable forever; a stale or missing `v` redirects to the
// current one (mail clients holding an old link still get an image).
import { error, redirect } from '@sveltejs/kit';
import { getBrandLogo, LOGO_SVG_MIME } from '$lib/server/branding';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const logo = await getBrandLogo();
	if (!logo) error(404, 'No logo set');
	const v = url.searchParams.get('v');
	if (v !== logo.version) redirect(302, `/brand/logo?v=${encodeURIComponent(logo.version)}`);

	setHeaders({
		'Content-Type': logo.mime,
		'Content-Length': String(logo.data.byteLength),
		'Cache-Control': 'public, max-age=31536000, immutable',
		'X-Content-Type-Options': 'nosniff',
		// SVG opened as a document must never run script or fetch anything.
		...(logo.mime === LOGO_SVG_MIME
			? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" }
			: {})
	});
	// Copy into a fresh ArrayBuffer: the driver's view type is not a BodyInit.
	return new Response(new Uint8Array(logo.data).buffer);
};
