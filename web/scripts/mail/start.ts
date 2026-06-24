#!/usr/bin/env bun
/**
 * Starts the shared local Mailpit container (`dev-mailpit`) — a dev inbox that
 * catches every email the app sends and shows it in a web UI. Idempotent —
 * safe to run any time.
 *
 * Mirrors the shared dev-postgres / dev-minio pattern (`scripts/db/start.ts`,
 * `scripts/storage/start.ts`): one Mailpit container is shared across every
 * project on this machine, so projects don't fight over the SMTP port (1025)
 * or the web-UI port (8025). Unlike Postgres/MinIO there is no per-project
 * namespace — Mailpit is a single flat inbox, so every project's dev mail
 * lands together; filter the inbox by sender (each project has its own
 * EMAIL_FROM) when you need to tell them apart.
 *
 * Point the SMTP transport at it in the root `.env`:
 *   SMTP_HOST="localhost"
 *   SMTP_PORT="1025"
 * then read the mail at http://localhost:8025.
 */
import { $ } from 'bun';

const CONTAINER = 'dev-mailpit';

// Start the shared container; create it on first run if it doesn't exist yet.
// MP_DATABASE + a named volume persist the inbox across restarts, matching the
// dev-pgdata / dev-minio-data volumes of the other shared containers.
const started = await $`docker start ${CONTAINER}`.nothrow().quiet();
if (started.exitCode !== 0) {
	console.log('Creating shared dev-mailpit container…');
	// Pass the args as an array, not a `\`-continued multi-line string: Bun's $
	// keeps the leading indentation of a continued line and globs that tab onto
	// the next token (here, the image ref), which Docker rejects with "invalid
	// reference format". Array elements each become their own escaped argument.
	const runArgs = [
		'run',
		'-d',
		'--name',
		CONTAINER,
		'-e',
		'MP_DATABASE=/data/mailpit.db',
		'-p',
		'127.0.0.1:8025:8025',
		'-p',
		'127.0.0.1:1025:1025',
		'-v',
		'dev-mailpit-data:/data',
		'axllent/mailpit:latest'
	];
	await $`docker ${runArgs}`;
}

console.log('✓ dev-mailpit running — inbox at http://localhost:8025 (SMTP: localhost:1025)');
