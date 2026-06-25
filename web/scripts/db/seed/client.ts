import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../../src/lib/server/db/schema';
import { resolveDatabaseUrl } from '../../../src/lib/server/db/resolve-url';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

/** Open a single-connection drizzle client against the resolved database URL. */
export function openDb(): { db: Db; close: () => Promise<void> } {
	const client = postgres(resolveDatabaseUrl(process.env), { max: 1 });
	const db = drizzle(client, { schema });
	return { db, close: () => client.end() };
}

export function ok(msg: string) {
	console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}
export function info(msg: string) {
	console.log(`\x1b[2m·\x1b[0m ${msg}`);
}
export function warn(msg: string) {
	console.warn(`\x1b[33m!\x1b[0m ${msg}`);
}
export function die(msg: string): never {
	console.error(`\x1b[31m✗\x1b[0m ${msg}`);
	process.exit(1);
}
