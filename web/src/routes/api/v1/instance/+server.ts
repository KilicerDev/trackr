// Unauthenticated instance probe — the native app's handshake. Before starting
// a sign-in against a user-entered (self-hosted) server URL, the app calls this
// and requires `name === 'trackr'` so typos land on a clear error instead of a
// confusing browser page. Keep the shape stable: { name, version, api }.
import { json } from '@sveltejs/kit';
import pkg from '../../../../../package.json' with { type: 'json' };
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json({ name: 'trackr', version: pkg.version, api: 1 });
