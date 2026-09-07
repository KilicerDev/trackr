#!/usr/bin/env bun
/**
 * Database seeder.
 *
 *   bun run db:seed --root   Clean setup: just the root superadmin so you can
 *                            log in. No demo data. Equivalent to a fresh install.
 *   bun run db:seed --all    Root + the full demo dataset: client orgs, team +
 *                            client users, projects, tasks (comments, time
 *                            logs, checklists, this week's plan), tickets with
 *                            conversations, chat threads, notes, wiki pages,
 *                            image/file attachments and an inbox for the demo
 *                            user "Max Muster" (max.muster@trackr.dev), plus
 *                            the smoke-test API key (scripts/db/seed/test-fixtures.ts).
 *
 * Both modes are idempotent — safe to re-run. Demo dates are relative to today,
 * so re-running refreshes the workspace to "this week". Env:
 *   ROOT_EMAIL / ROOT_PASSWORD / ROOT_NAME  → root user (password required on
 *                                             first create, min 8 chars).
 *   DEMO_PASSWORD                           → shared demo-user password
 *                                             (default 'demo12345').
 *   STORAGE_DRIVER / STORAGE_LOCAL_DIR / S3_* → where attachment bytes go
 *                                             (same settings as the app).
 */

import '../../load-root-env';
import { openDb, die } from './client';
import { seedRoot } from './root';

const args = new Set(process.argv.slice(2));
const wantRoot = args.has('--root');
const wantAll = args.has('--all');

if (!wantRoot && !wantAll) {
	die(
		'Choose what to seed:\n  bun run db:seed --root   (clean: root user only)\n  bun run db:seed --all    (root + demo data)'
	);
}

let close: (() => Promise<void>) | undefined;
try {
	const conn = openDb();
	close = conn.close;

	// --all implies --root: demo data needs the internal org + a logged-in admin.
	await seedRoot(conn.db);
	if (wantAll) {
		// Loaded on demand: the demo seeder pulls in sharp, the storage drivers
		// and fixtures the root-only boot path (container CMD) must not need.
		const { seedDemo } = await import('./demo');
		await seedDemo(conn.db);
		// Smoke-test credentials for Max Muster (tests/smoke/*).
		const { seedTestFixtures } = await import('./test-fixtures');
		await seedTestFixtures(conn.db);
	}
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
