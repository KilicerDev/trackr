// Unauthenticated instance probe — the native app's handshake, and the
// multi-instance switcher's "is this a trackr?" check (TRACK-140). Before
// starting a sign-in against a user-entered (self-hosted) server URL, the app
// calls this and requires `name === 'trackr'` so typos land on a clear error
// instead of a confusing browser page. Keep the shape stable:
// { name, version, api, branding: { name, logoUrl } }.
//
// This is the one /api/v1 route with CORS, and it is read-only public
// metadata: the switcher in the browser on instance A probes instance B here
// (so the server never fetches user-supplied URLs), and picks up B's display
// name and logo for the menu. `logoUrl` is absolute so a foreign page can
// render it directly.
import { json } from '@sveltejs/kit';
import pkg from '../../../../../package.json' with { type: 'json' };
import { absoluteLogoUrl, getBranding, publicBranding } from '$lib/server/branding';
import type { RequestHandler } from './$types';

const CORS_HEADERS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, OPTIONS',
	'access-control-max-age': '86400'
};

export const GET: RequestHandler = async ({ url }) => {
	const brand = publicBranding(await getBranding());
	return json(
		{
			name: 'trackr',
			version: pkg.version,
			api: 1,
			branding: { name: brand.name, logoUrl: absoluteLogoUrl(brand, url.origin) }
		},
		{ headers: CORS_HEADERS }
	);
};

export const OPTIONS: RequestHandler = () =>
	new Response(null, { status: 204, headers: CORS_HEADERS });
