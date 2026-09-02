#!/usr/bin/env bun
/**
 * Reset the local database: drop everything, re-apply migrations, re-seed.
 *
 *   bun run db:reset            Drop → migrate → seed --all (root + demo data)
 *   bun run db:reset --root     Drop → migrate → seed --root (root user only)
 *   bun run db:reset --yes      Skip the confirmation prompt
 *   bun run db:reset --keep-files
 *                               Keep locally stored attachment bytes
 *                               (default: the local storage dir is wiped too)
 *
 * What "drop" means: the `public` and `drizzle` schemas are dropped and
 * recreated inside the *same* database. That needs no CREATEDB privilege, and
 * works while the dev server holds open connections (they simply see the new
 * tables after the migration). Every table, row, and the migration journal go
 * away; the database itself stays.
 *
 * Refuses to run against anything that isn't a local host unless --force is
 * given. Needs ROOT_PASSWORD (the root user has to be recreated).
 */

import '../load-root-env';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { resolveDatabaseUrl } from '../../src/lib/server/db/resolve-url';

const args = new Set(process.argv.slice(2));
const rootOnly = args.has('--root');
const yes = args.has('--yes') || args.has('-y');
const force = args.has('--force');
const keepFiles = args.has('--keep-files');

const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const info = (m: string) => console.log(`\x1b[2m·\x1b[0m ${m}`);
const die = (m: string): never => {
	console.error(`\x1b[31m✗\x1b[0m ${m}`);
	process.exit(1);
};

// ── Preconditions (fail before touching anything) ───────────────────────────
let url: string;
try {
	url = resolveDatabaseUrl(process.env);
} catch (err) {
	die(err instanceof Error ? err.message : String(err));
}
const parsed = new URL(url!);
const host = parsed.hostname;
const dbName = parsed.pathname.replace(/^\//, '');
const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal'].includes(host);
if (!isLocal && !force) {
	die(
		`Refusing to reset a non-local database (${host}/${dbName}). Pass --force if you really mean it.`
	);
}
if (!process.env.ROOT_PASSWORD || process.env.ROOT_PASSWORD.length < 8) {
	die('ROOT_PASSWORD (min 8 chars) must be set — the root user is recreated after the reset.');
}

// Local attachment storage — only relevant for the local driver.
const storageDriver = process.env.STORAGE_DRIVER || 'local';
const storageDir = resolve(process.env.STORAGE_LOCAL_DIR || 'data/attachments');
const wipeStorage = !keepFiles && storageDriver === 'local' && existsSync(storageDir);

// ── Confirm ─────────────────────────────────────────────────────────────────
console.log('');
console.log(`  Database : ${host}:${parsed.port || '5432'}/${dbName}`);
console.log(
	`  Action   : drop schemas public + drizzle → migrate → seed ${rootOnly ? '--root' : '--all'}`
);
if (wipeStorage) console.log(`  Files    : wipe ${storageDir}`);
console.log('');
if (!yes) {
	const answer = prompt(`Type the database name (${dbName}) to confirm:`);
	if (answer?.trim() !== dbName) die('Aborted.');
}

// ── Drop ────────────────────────────────────────────────────────────────────
const sql = postgres(url!, { max: 1, onnotice: () => {} });
try {
	await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
	await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
	await sql.unsafe('CREATE SCHEMA public');
	ok(`dropped all tables in ${dbName}`);
} catch (err) {
	die(`drop failed: ${err instanceof Error ? err.message : String(err)}`);
} finally {
	await sql.end();
}

if (wipeStorage) {
	await rm(storageDir, { recursive: true, force: true });
	ok(`wiped ${storageDir}`);
}

// ── Migrate + seed (same scripts as db:migrate / db:seed) ───────────────────
async function run(label: string, script: string, ...extra: string[]) {
	info(`${label}…`);
	const proc = Bun.spawn(['bun', 'run', script, ...extra], {
		cwd: resolve(import.meta.dir, '../..'),
		stdio: ['inherit', 'inherit', 'inherit'],
		env: process.env
	});
	const code = await proc.exited;
	if (code !== 0) die(`${label} failed (exit ${code})`);
}

await run('migrate', 'scripts/db/migrate.ts');
await run('seed', 'scripts/db/seed/index.ts', rootOnly ? '--root' : '--all');
ok('reset complete');
