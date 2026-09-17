import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';
import { lazy } from '$lib/server/lazy';
import { resolveDatabaseUrl } from './resolve-url';

// Connected on first use, not at import time — see lazy.ts for why the
// build must not need DATABASE_URL.
//
// Pool sizing: the app layout load alone fans out about ten queries in
// parallel per request (see (app)/+layout.server.ts), so the pool must be at
// least that wide for a single navigation not to queue on itself. The rest of
// the options make the client's behaviour explicit instead of relying on the
// library defaults: idle connections are recycled after five minutes rather
// than kept forever, and a database that does not answer fails the request in
// ten seconds instead of hanging it.
export const db = lazy(() =>
	drizzle(
		postgres(resolveDatabaseUrl(env), {
			max: Number(env.DATABASE_POOL_MAX) || 10,
			idle_timeout: 300,
			connect_timeout: 10
		}),
		{ schema }
	)
);
