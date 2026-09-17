#!/usr/bin/env bun
/**
 * Page-load benchmark for a running trackr server: signs in as the demo user,
 * then reports server TTFB, response size (raw and gzip) and the number of
 * SQL statements executed per request for the pages that matter.
 *
 *   bun run scripts/perf/measure.ts [--url http://127.0.0.1:3000] [--runs 3]
 *
 * Statement counting reads the shared `dev-postgres` container's log, which
 * only contains statements while per-statement logging is on:
 *
 *   docker exec dev-postgres psql -U dev -d postgres \
 *     -c "ALTER DATABASE trackr SET log_min_duration_statement = 0;"
 *   … run this script …
 *   docker exec dev-postgres psql -U dev -d postgres \
 *     -c "ALTER DATABASE trackr RESET log_min_duration_statement;"
 *
 * Postgres logs parse, bind and execute separately for the extended protocol,
 * so only `execute` lines are counted — each one is one round trip from the
 * app. Without logging the column shows `-`.
 *
 * Meant to be run against the production build (`bun run build`, then
 * `bun build/server-entry.js` with DATABASE_URL/ORIGIN/BETTER_AUTH_SECRET set)
 * so SSR and serialization costs are the real ones. To check how sensitive a
 * page is to database latency, run scripts/perf/lagproxy.ts and point
 * DATABASE_URL at it.
 */

import { $ } from 'bun';

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = flag('url', 'http://127.0.0.1:3000').replace(/\/$/, '');
const RUNS = Number(flag('runs', '3'));
const EMAIL = process.env.PERF_EMAIL ?? 'max.muster@trackr.dev';
const PASSWORD = process.env.PERF_PASSWORD ?? 'demo12345';
const CONTAINER = process.env.PERF_PG_CONTAINER ?? 'dev-postgres';

async function signIn(): Promise<string> {
	const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: BASE },
		body: JSON.stringify({ email: EMAIL, password: PASSWORD })
	});
	if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
	const cookies = res.headers.getSetCookie().map((c) => c.split(';', 1)[0]);
	if (cookies.length === 0) throw new Error('sign-in returned no cookies');
	return cookies.join('; ');
}

async function pgLogLines(): Promise<number | null> {
	const out = await $`docker logs ${CONTAINER}`.nothrow().quiet();
	if (out.exitCode !== 0) return null;
	return out.stdout.toString().split('\n').length + out.stderr.toString().split('\n').length;
}

async function pgExecuteCountSince(before: number): Promise<number | null> {
	const out = await $`docker logs ${CONTAINER}`.nothrow().quiet();
	if (out.exitCode !== 0) return null;
	const lines = [...out.stdout.toString().split('\n'), ...out.stderr.toString().split('\n')];
	return lines.slice(before).filter((l) => /ms {2}(execute|statement)/.test(l)).length;
}

type Row = {
	path: string;
	status: number;
	ttfbMs: number[];
	bytes: number;
	gzipBytes: number | null;
	statements: number | null;
};

async function timed(
	path: string,
	cookie: string,
	gzip = false
): Promise<{ ttfb: number; status: number; bytes: number }> {
	const start = performance.now();
	const res = await fetch(`${BASE}${path}`, {
		headers: { cookie, ...(gzip ? { 'accept-encoding': 'gzip' } : {}) },
		redirect: 'manual',
		// Bun transparently decompresses; ask it not to so we can see wire bytes.
		decompress: !gzip
	} as RequestInit);
	const ttfb = performance.now() - start;
	const buf = await res.arrayBuffer();
	return { ttfb, status: res.status, bytes: buf.byteLength };
}

async function measure(path: string, cookie: string): Promise<Row> {
	// Warm-up so JIT/pool state is comparable across pages.
	await timed(path, cookie);

	const before = await pgLogLines();
	const first = await timed(path, cookie);
	await Bun.sleep(150);
	const statements = before === null ? null : await pgExecuteCountSince(before);

	const ttfbMs = [first.ttfb];
	for (let i = 1; i < RUNS; i++) ttfbMs.push((await timed(path, cookie)).ttfb);

	const gz = await timed(path, cookie, true);
	return {
		path,
		status: first.status,
		ttfbMs,
		bytes: first.bytes,
		gzipBytes: gz.bytes !== first.bytes ? gz.bytes : null,
		statements
	};
}

function kb(n: number | null): string {
	if (n === null) return '-';
	return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.round(n / 1024)} KB`;
}

const cookie = await signIn();

// Pick a project for the detail page from the first project link on /projects.
const projectsHtml = await fetch(`${BASE}/projects`, { headers: { cookie } }).then((r) => r.text());
const projectId = /href="\/projects\/([0-9a-f-]{36})"/.exec(projectsHtml)?.[1];

const pages = [
	'/tasks',
	'/week',
	'/projects',
	'/tickets',
	...(projectId ? [`/projects/${projectId}`] : []),
	'/tasks/__data.json',
	'/week/__data.json'
];

const rows: Row[] = [];
for (const p of pages) rows.push(await measure(p, cookie));

const header = ['page', 'status', `ttfb ms (${RUNS} runs)`, 'bytes', 'gzip', 'statements'];
const table = rows.map((r) => [
	r.path,
	String(r.status),
	r.ttfbMs.map((t) => Math.round(t)).join(' / '),
	kb(r.bytes),
	r.gzipBytes === null ? 'none' : kb(r.gzipBytes),
	r.statements === null ? '-' : String(r.statements)
]);
const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
console.log(line(header));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const row of table) console.log(line(row));
if (rows.some((r) => r.statements === null)) {
	console.log('\nstatements: `-` means the docker log was unreadable; see the header comment.');
}
