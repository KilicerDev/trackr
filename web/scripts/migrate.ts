#!/usr/bin/env bun
/**
 * Apply Drizzle migrations against DATABASE_URL.
 *
 * Reads SQL files from ./drizzle and applies any that haven't been recorded in
 * the drizzle.__drizzle_migrations bookkeeping table. Idempotent: safe to run
 * on every container start.
 *
 * Usage:
 *   DATABASE_URL=postgres://... bun scripts/migrate.ts
 */

import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { resolveDatabaseUrl } from '../src/lib/server/db/resolve-url';

let url: string;
try {
	url = resolveDatabaseUrl(process.env);
} catch (err) {
	console.error('\x1b[31m✗\x1b[0m', err instanceof Error ? err.message : err);
	process.exit(1);
}

const MIGRATIONS_FOLDER = './drizzle';
const JOURNAL_PATH = `${MIGRATIONS_FOLDER}/meta/_journal.json`;

if (!existsSync(JOURNAL_PATH)) {
	console.log(`\x1b[33m!\x1b[0m No migrations found at ${JOURNAL_PATH} — skipping.`);
	process.exit(0);
}

const MAX_ATTEMPTS = 30;
const DELAY_MS = 1000;

const client = postgres(url, { max: 1, onnotice: () => {} });

async function run() {
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
			return;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			const transient =
				/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|terminating connection|the database system is starting up/i.test(
					msg
				);
			if (!transient || attempt === MAX_ATTEMPTS) throw err;
			console.log(
				`Database not ready (attempt ${attempt}/${MAX_ATTEMPTS}); retrying in ${DELAY_MS}ms...`
			);
			await new Promise((r) => setTimeout(r, DELAY_MS));
		}
	}
}

try {
	await run();
	console.log('\x1b[32m✓\x1b[0m Migrations applied');
} catch (err) {
	console.error('\x1b[31m✗\x1b[0m Migration failed:', err);
	process.exitCode = 1;
} finally {
	await client.end();
}
