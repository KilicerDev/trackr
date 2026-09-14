import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';
import { lazy } from '$lib/server/lazy';
import { resolveDatabaseUrl } from './resolve-url';

// Connected on first use, not at import time — see lazy.ts for why the
// build must not need DATABASE_URL.
export const db = lazy(() => drizzle(postgres(resolveDatabaseUrl(env)), { schema }));
