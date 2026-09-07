#!/usr/bin/env bun
/**
 * `bun run test` — runs every test suite in the repo, prints ✓ per passed
 * test along the way and one summary board at the end.
 *
 *   bun run test                       everything below
 *   bun run test --only unit,go        just those tiers
 *   bun run test --skip smoke          everything except those tiers
 *   bun run test --spawn               always start a private dev server for
 *                                      the smoke tier instead of reusing :5173
 *
 * Tiers (the `test:*` package scripts are shorthands for `--only <tier>`):
 *   unit        `bun test src` — pure TypeScript modules, no database.
 *   go          `go test ./...` in cli/ and services/ (worker, shared,
 *               scheduler), rendered from `-json`.
 *   smoke:api   tests/smoke/api.test.ts — the /api/v1 surface, live server.
 *   smoke:mcp   tests/smoke/mcp.test.ts — the /api/mcp endpoint, live server.
 *   smoke       both smoke tiers.
 *
 * The smoke tiers need a running trackr + database. The runner first seeds
 * the smoke credentials (scripts/db/seed/test-fixtures.ts), then picks a
 * server: $TRACKR_TEST_URL if set, else the dev server on 127.0.0.1:5173 when
 * it answers, else (or with --spawn) it starts its own `vite dev` on :5199
 * for the duration of the run.
 *
 * Missing prerequisites (no Go toolchain, no database, server won't start)
 * skip the tier with a reason instead of failing it. Exit code is non-zero
 * when any test failed.
 *
 * Why not plain `bun test`? Its console reporter only prints failures. The
 * junit reporter runs alongside it, so each bun suite is run with
 * `--reporter=junit` and the XML is rendered here as one line per test.
 */

import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { rm, readFile } from 'node:fs/promises';

const WEB = resolve(import.meta.dir, '../..');
const ROOT = resolve(WEB, '..');
const SPAWN_PORT = 5199;
const DEV_URL = 'http://127.0.0.1:5173';

// ── CLI ─────────────────────────────────────────────────────────────────────
type Tier = 'unit' | 'go' | 'smoke:api' | 'smoke:mcp';
const TIERS: Tier[] = ['unit', 'go', 'smoke:api', 'smoke:mcp'];
const ALIASES: Record<string, Tier[]> = { smoke: ['smoke:api', 'smoke:mcp'] };

function tierArg(name: string): Set<Tier> | null {
	const i = process.argv.indexOf(`--${name}`);
	if (i < 0 || !process.argv[i + 1]) return null;
	const out = new Set<Tier>();
	for (const raw of process.argv[i + 1].split(',')) {
		const t = raw.trim();
		if (ALIASES[t]) for (const x of ALIASES[t]) out.add(x);
		else if (TIERS.includes(t as Tier)) out.add(t as Tier);
		else die(`unknown tier "${t}" (expected ${[...TIERS, ...Object.keys(ALIASES)].join(' | ')})`);
	}
	return out;
}
const only = tierArg('only');
const skip = tierArg('skip') ?? new Set<Tier>();
const forceSpawn = process.argv.includes('--spawn');
const wants = (t: Tier) => (only ? only.has(t) : true) && !skip.has(t);

// ── Output ──────────────────────────────────────────────────────────────────
const tty = process.stdout.isTTY ?? false;
const paint = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = {
	green: paint('32'),
	red: paint('31'),
	yellow: paint('33'),
	dim: paint('2'),
	bold: paint('1')
};
const PASS = c.green('✓');
const FAIL = c.red('✗');
const SKIP = c.yellow('⊘');

function heading(title: string) {
	console.log('');
	console.log(c.bold(`── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`));
}
function die(msg: string): never {
	console.error(`${FAIL} ${msg}`);
	process.exit(2);
}
const ms = (n: number) => c.dim(`[${n.toFixed(n < 10 ? 1 : 0)}ms]`);
const seconds = (n: number) => `${(n / 1000).toFixed(1)}s`;

// ── Results ─────────────────────────────────────────────────────────────────
type Outcome = 'pass' | 'fail' | 'skip';
type StepResult = {
	name: string;
	outcome: Outcome;
	passed: number;
	failed: number;
	ms: number;
	note?: string;
};
const results: StepResult[] = [];
const skipStep = (name: string, note: string) =>
	results.push({ name, outcome: 'skip', passed: 0, failed: 0, ms: 0, note });

// ── Process helpers ─────────────────────────────────────────────────────────
/**
 * Spawn a command, stream its output live (stdout/stderr kept apart) and
 * also collect it so the caller can parse it afterwards.
 */
async function run(
	cmd: string[],
	opts: { cwd: string; env?: Record<string, string>; quiet?: boolean }
): Promise<{ code: number; out: string }> {
	const proc = Bun.spawn(cmd, {
		cwd: opts.cwd,
		env: { ...process.env, ...(opts.env ?? {}) },
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe'
	});
	let out = '';
	const pump = async (stream: ReadableStream<Uint8Array>, sink: NodeJS.WriteStream) => {
		const decoder = new TextDecoder();
		for await (const chunk of stream) {
			const text = decoder.decode(chunk, { stream: true });
			out += text;
			if (!opts.quiet) sink.write(text);
		}
	};
	await Promise.all([pump(proc.stdout, process.stdout), pump(proc.stderr, process.stderr)]);
	return { code: await proc.exited, out };
}

// ── bun test (rendered from its junit report) ───────────────────────────────
type Case = { name: string; ms: number; status: Outcome; detail?: string };
type Suite = { name: string; file?: string; suites: Suite[]; cases: Case[] };

const unescapeXml = (s: string) =>
	s
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
		.replace(/&amp;/g, '&');

function attrs(tag: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = unescapeXml(m[2]);
	return out;
}

/** Minimal parser for the nested <testsuite>/<testcase> tree bun emits. */
function parseJunit(xml: string): Suite {
	const root: Suite = { name: 'root', suites: [], cases: [] };
	const stack: Suite[] = [root];
	const top = () => stack[stack.length - 1];
	const tagRe = /<(\/?)(testsuite|testcase|failure|skipped|error)\b([^>]*?)(\/?)>/g;
	let current: Case | null = null;
	let m: RegExpExecArray | null;
	while ((m = tagRe.exec(xml))) {
		const [, closing, tag, rawAttrs, selfClosing] = m;
		if (tag === 'testsuite') {
			if (closing) {
				if (stack.length > 1) stack.pop();
			} else {
				const a = attrs(rawAttrs);
				const s: Suite = { name: a.name ?? '', file: a.file, suites: [], cases: [] };
				top().suites.push(s);
				if (!selfClosing) stack.push(s);
			}
		} else if (tag === 'testcase') {
			if (closing) {
				current = null;
			} else {
				const a = attrs(rawAttrs);
				current = { name: a.name ?? '', ms: Number(a.time ?? 0) * 1000, status: 'pass' };
				top().cases.push(current);
				if (selfClosing) current = null;
			}
		} else if (!closing && current) {
			const a = attrs(rawAttrs);
			current.status = tag === 'skipped' ? 'skip' : 'fail';
			if (a.message) current.detail = a.message;
		}
	}
	return root;
}

function render(suite: Suite, depth: number) {
	const indent = '  '.repeat(depth);
	for (const t of suite.cases) {
		const icon = t.status === 'pass' ? PASS : t.status === 'fail' ? FAIL : SKIP;
		console.log(`${indent}${icon} ${t.name} ${ms(t.ms)}`);
		if (t.status === 'fail' && t.detail) {
			console.log(`${indent}    ${c.red(t.detail.split('\n')[0].slice(0, 200))}`);
		}
	}
	for (const s of suite.suites) {
		console.log(`${indent}${c.bold(s.name)}`);
		render(s, depth + 1);
	}
}

async function bunTest(name: string, target: string, env: Record<string, string> = {}) {
	heading(name);
	const started = Date.now();
	const report = join(tmpdir(), `trackr-${name.replace(/\W+/g, '-')}-${process.pid}.xml`);
	const { code, out } = await run(
		['bun', 'test', target, '--reporter=junit', `--reporter-outfile=${report}`],
		{ cwd: WEB, env }
	);
	let passed = 0;
	let failed = 0;
	let skipped = 0;
	try {
		const tree = parseJunit(await readFile(report, 'utf8'));
		const walk = (s: Suite) => {
			for (const t of s.cases) {
				if (t.status === 'pass') passed++;
				else if (t.status === 'fail') failed++;
				else skipped++;
			}
			s.suites.forEach(walk);
		};
		walk(tree);
		// Bun prints only failures live; this is where every ✓ comes from.
		// Top level is one suite per file, below that one per describe().
		for (const s of tree.suites) {
			console.log(c.dim(s.file ?? s.name));
			render(s, 1);
		}
	} catch {
		// No report: the suite never started (syntax error, missing file…).
		// Bun's own output above says why.
	} finally {
		await rm(report, { force: true });
	}
	// Fallback to the console trailer when the report is missing.
	if (!passed && !failed) {
		passed = Number(/(\d+) pass/.exec(out)?.[1] ?? 0);
		failed = Number(/(\d+) fail/.exec(out)?.[1] ?? 0);
	}
	const ok = code === 0 && failed === 0;
	console.log(c.dim(`${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`));
	results.push({
		name,
		outcome: ok ? 'pass' : 'fail',
		passed,
		failed: failed || (ok ? 0 : 1),
		ms: Date.now() - started,
		note: !ok && !failed ? 'suite did not run cleanly (see output above)' : undefined
	});
}

// ── Go ──────────────────────────────────────────────────────────────────────
type GoEvent = {
	Action: string;
	Package?: string;
	Test?: string;
	Output?: string;
	Elapsed?: number;
};

/**
 * `go test -json` rendered as ✓/✗ per test (subtests indented). Each test's
 * own output is buffered and shown only when it fails.
 */
async function goTest(name: string, cwd: string, patterns: string[]) {
	heading(name);
	const started = Date.now();
	const { code, out } = await run(['go', 'test', '-json', ...patterns], { cwd, quiet: true });
	let passed = 0;
	let failed = 0;
	let skipped = 0;
	const buffered = new Map<string, string[]>();
	const packages = new Set<string>();
	let broken = false;
	let lastPkg = '';

	for (const line of out.split('\n')) {
		if (!line.trim()) continue;
		let ev: GoEvent;
		try {
			ev = JSON.parse(line) as GoEvent;
		} catch {
			// Non-JSON lines are compiler/setup errors — always show them.
			console.log(c.red(line));
			broken = true;
			continue;
		}
		const pkg = ev.Package ?? '';
		if (ev.Test) {
			const key = `${pkg}::${ev.Test}`;
			const parts = ev.Test.split('/');
			const indent = '  '.repeat(parts.length);
			const label = parts[parts.length - 1];
			if (ev.Action === 'output') {
				buffered.set(key, [...(buffered.get(key) ?? []), ev.Output ?? '']);
				continue;
			}
			if (ev.Action !== 'pass' && ev.Action !== 'fail' && ev.Action !== 'skip') continue;
			if (pkg !== lastPkg) {
				console.log(c.dim(pkg.replace(/^github\.com\/[^/]+\/trackr\//, '')));
				lastPkg = pkg;
			}
			if (ev.Action === 'pass') {
				passed++;
				console.log(`${indent}${PASS} ${label} ${ms((ev.Elapsed ?? 0) * 1000)}`);
			} else if (ev.Action === 'fail') {
				failed++;
				console.log(`${indent}${FAIL} ${label}`);
				for (const o of buffered.get(key) ?? []) {
					const t = o.replace(/\n$/, '');
					if (t && !/^\s*(=== RUN|--- FAIL|--- PASS)/.test(t))
						console.log(`${indent}    ${c.dim(t)}`);
				}
			} else {
				skipped++;
				console.log(`${indent}${SKIP} ${label}`);
			}
			buffered.delete(key);
		} else if (ev.Action === 'start') {
			packages.add(pkg);
		} else if (ev.Action === 'fail' && pkg && !failed) {
			// Package failed with no test attributed: build error, panic in init…
			broken = true;
		} else if (ev.Action === 'output' && ev.Output && /^(FAIL|panic:|#)/.test(ev.Output)) {
			process.stdout.write(c.red(ev.Output));
		}
	}
	const ok = code === 0 && !broken;
	console.log(
		c.dim(
			`${packages.size} packages · ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`
		)
	);
	results.push({
		name,
		outcome: ok ? 'pass' : 'fail',
		passed,
		failed: failed || (ok ? 0 : 1),
		ms: Date.now() - started,
		note: broken ? 'build or setup failure (see output above)' : undefined
	});
}

// ── Server for the smoke tiers ──────────────────────────────────────────────
async function isTrackr(url: string, timeoutMs = 3000): Promise<boolean> {
	try {
		const res = await fetch(`${url}/api/v1/instance`, { signal: AbortSignal.timeout(timeoutMs) });
		if (!res.ok) return false;
		return ((await res.json()) as { name?: string })?.name === 'trackr';
	} catch {
		return false;
	}
}

type Server = { url: string; note: string; stop: () => Promise<void> };
const noStop = async () => {};

async function resolveServer(): Promise<Server | { error: string }> {
	const explicit = process.env.TRACKR_TEST_URL?.replace(/\/+$/, '');
	if (explicit && !forceSpawn) {
		if (await isTrackr(explicit)) return { url: explicit, note: 'TRACKR_TEST_URL', stop: noStop };
		return { error: `TRACKR_TEST_URL=${explicit} does not answer like a trackr server` };
	}
	if (!forceSpawn && (await isTrackr(DEV_URL))) {
		return { url: DEV_URL, note: 'running dev server', stop: noStop };
	}

	const url = `http://127.0.0.1:${SPAWN_PORT}`;
	console.log(c.dim(`starting a private vite dev server on :${SPAWN_PORT}…`));
	const proc = Bun.spawn(
		[
			'bun',
			'x',
			'vite',
			'dev',
			'--host',
			'127.0.0.1',
			'--port',
			String(SPAWN_PORT),
			'--strictPort'
		],
		{ cwd: WEB, env: process.env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }
	);
	let log = '';
	const capture = async (stream: ReadableStream<Uint8Array>) => {
		const decoder = new TextDecoder();
		for await (const chunk of stream) log += decoder.decode(chunk, { stream: true });
	};
	void capture(proc.stdout);
	void capture(proc.stderr);
	const stop = async () => {
		proc.kill();
		await proc.exited.catch(() => {});
	};

	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		if (proc.exitCode !== null) {
			return { error: `vite dev exited early (code ${proc.exitCode}):\n${log.slice(-2000)}` };
		}
		if (await isTrackr(url, 2000)) return { url, note: `private vite dev on :${SPAWN_PORT}`, stop };
		await Bun.sleep(500);
	}
	await stop();
	return { error: `vite dev on :${SPAWN_PORT} did not answer within 90s:\n${log.slice(-2000)}` };
}

// ── Tiers ───────────────────────────────────────────────────────────────────
async function tierGo() {
	if (!Bun.which('go')) {
		heading('go');
		console.log(`${SKIP} Go toolchain not found in PATH`);
		skipStep('go cli', 'no go in PATH');
		skipStep('go services', 'no go in PATH');
		return;
	}
	await goTest('go cli', resolve(ROOT, 'cli'), ['./...']);
	// services/ is a go.work workspace: `./...` at its root matches nothing,
	// so name the member modules.
	await goTest('go services', resolve(ROOT, 'services'), [
		'./worker/...',
		'./shared/...',
		'./scheduler/...'
	]);
}

async function tierSmoke(tiers: Tier[]) {
	heading('smoke: fixtures');
	const fixtures = await run(['bun', 'run', 'scripts/db/seed/test-fixtures.ts'], { cwd: WEB });
	if (fixtures.code !== 0) {
		const note = 'smoke credentials could not be seeded (database down or demo data missing)';
		console.log(`${SKIP} ${note}`);
		for (const t of tiers) skipStep(t, note);
		return;
	}

	heading('smoke: server');
	const server = await resolveServer();
	if ('error' in server) {
		console.log(`${SKIP} ${server.error}`);
		for (const t of tiers) skipStep(t, 'no server');
		return;
	}
	console.log(`${PASS} using ${server.url} ${c.dim(`(${server.note})`)}`);
	const env = { TRACKR_TEST_URL: server.url };
	try {
		if (tiers.includes('smoke:api')) await bunTest('smoke:api', 'tests/smoke/api.test.ts', env);
		if (tiers.includes('smoke:mcp')) await bunTest('smoke:mcp', 'tests/smoke/mcp.test.ts', env);
	} finally {
		await server.stop();
	}
}

// ── Main ────────────────────────────────────────────────────────────────────
const startedAll = Date.now();
if (wants('unit')) await bunTest('unit', 'src');
if (wants('go')) await tierGo();
const smokeTiers = (['smoke:api', 'smoke:mcp'] as Tier[]).filter(wants);
if (smokeTiers.length) await tierSmoke(smokeTiers);

heading('summary');
const width = Math.max(8, ...results.map((r) => r.name.length));
for (const r of results) {
	const icon = r.outcome === 'pass' ? PASS : r.outcome === 'fail' ? FAIL : SKIP;
	const counts =
		r.outcome === 'skip'
			? c.yellow('skipped')
			: `${String(r.passed).padStart(4)} passed${r.failed ? c.red(`  ${r.failed} failed`) : ''}`;
	const time = r.outcome === 'skip' ? '' : c.dim(seconds(r.ms).padStart(7));
	const note = r.note ? c.dim(`  ${r.note}`) : '';
	console.log(`${icon} ${r.name.padEnd(width)}  ${counts.padEnd(tty ? 30 : 20)}${time}${note}`);
}
const totalPassed = results.reduce((n, r) => n + r.passed, 0);
const totalFailed = results.reduce((n, r) => n + r.failed, 0);
const anyFail = results.some((r) => r.outcome === 'fail');
console.log('');
console.log(
	anyFail
		? c.red(`✗ ${totalFailed} failed, ${totalPassed} passed in ${seconds(Date.now() - startedAll)}`)
		: c.green(`✓ all green — ${totalPassed} tests in ${seconds(Date.now() - startedAll)}`)
);
process.exit(anyFail ? 1 : 0);
