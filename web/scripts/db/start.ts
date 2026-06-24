#!/usr/bin/env bun
/**
 * Starts the shared local Postgres container (`dev-postgres`) and ensures this
 * project's database exists inside it. Idempotent — safe to run any time.
 *
 * One container is shared across every project on this machine; each project
 * gets its own database inside it (named after the project), so projects don't
 * fight over port 5432 or stomp each other's data.
 *
 * The database name is this project's `package.json` name (`$npm_package_name`,
 * set by the package manager when run via `bun run` / `npm run`). `DATABASE_URL`
 * in `.env` must point at a database of that same name.
 */
import { $ } from 'bun';

const CONTAINER = 'dev-postgres';
const dbName = process.env.npm_package_name;

if (!dbName) {
	console.error('npm_package_name is not set — run this via `bun run db:start`.');
	process.exit(1);
}

// Start the shared container; create it on first run if it doesn't exist yet.
const started = await $`docker start ${CONTAINER}`.nothrow().quiet();
if (started.exitCode !== 0) {
	console.log('Creating shared dev-postgres container…');
	await $`docker run -d --name ${CONTAINER} -e POSTGRES_USER=dev -e POSTGRES_PASSWORD=dev -p 5432:5432 -v dev-pgdata:/var/lib/postgresql/data postgres:17`;
}

// Wait for Postgres to accept connections, then ensure the database exists.
await $`docker exec ${CONTAINER} sh -c ${'until pg_isready -U dev -q; do sleep 0.5; done'}`;
await $`docker exec ${CONTAINER} createdb -U dev ${dbName}`.nothrow().quiet();

console.log(`✓ dev-postgres running — database "${dbName}" ready`);
