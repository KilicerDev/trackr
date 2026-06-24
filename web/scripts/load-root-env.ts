/**
 * Load the repository-root `.env` into `process.env`.
 *
 * The canonical .env lives at the repo root (shared by docker compose, the
 * SvelteKit dev server via vite's `envDir`, and the Go worker). Bun and Node
 * only auto-load `.env` from the current working directory, so standalone
 * scripts (migrate, seed, drizzle.config) import this module first.
 *
 * Existing process.env keys win — values already set in the environment are
 * never overwritten. Missing file is fine (e.g. inside the Docker image,
 * where env comes from compose).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');

if (existsSync(rootEnvPath)) {
	for (const line of readFileSync(rootEnvPath, 'utf8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (process.env[key] === undefined) process.env[key] = value;
	}
}
