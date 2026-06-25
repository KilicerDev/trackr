#!/usr/bin/env bun
/**
 * Database seeder.
 *
 *   bun run db:seed --root   Clean setup: just the root superadmin so you can
 *                            log in. No demo data. Equivalent to a fresh install.
 *   bun run db:seed --all    Root + the full demo dataset (users, projects,
 *                            tasks, wiki) for a populated local/dev workspace.
 *
 * Both modes are idempotent — safe to re-run. Env:
 *   ROOT_EMAIL / ROOT_PASSWORD / ROOT_NAME  → root user (password required on
 *                                             first create, min 8 chars).
 *   DEMO_PASSWORD                           → shared demo-user password
 *                                             (default 'demo12345').
 */

import '../../load-root-env';
import { openDb, die } from './client';
import { seedRoot } from './root';
import { seedDemo } from './demo';

const args = new Set(process.argv.slice(2));
const wantRoot = args.has('--root');
const wantAll = args.has('--all');

if (!wantRoot && !wantAll) {
	die('Choose what to seed:\n  bun run db:seed --root   (clean: root user only)\n  bun run db:seed --all    (root + demo data)');
}

let close: (() => Promise<void>) | undefined;
try {
	const conn = openDb();
	close = conn.close;

	// --all implies --root: demo data needs the internal org + a logged-in admin.
	await seedRoot(conn.db);
	if (wantAll) await seedDemo(conn.db);
} catch (err) {
	const msg = err instanceof Error ? err.message : String(err);
	if (/column .* does not exist|relation .* does not exist/i.test(msg)) {
		console.error('\x1b[31m✗\x1b[0m Database schema is out of date.');
		console.error('  Run: \x1b[1mbun run db:push\x1b[0m (or migrate) and try again.');
		console.error(`  (underlying error: ${msg})`);
	} else {
		console.error('\x1b[31m✗\x1b[0m seed failed:', err);
	}
	process.exitCode = 1;
} finally {
	await close?.();
}
