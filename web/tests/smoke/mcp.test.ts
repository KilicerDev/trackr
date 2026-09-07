// Smoke tests for the MCP endpoint (/api/mcp) against a live server — see
// helpers.ts for the target/credentials and `bun run test:smoke:mcp`.
// Connects with the Streamable HTTP client and a `trk_` API key (a user with
// MCP access enabled), checks the tool contract, then runs a task and a note
// through create → read → update → delete, cleaning up after itself.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { API_KEY, BASE_URL, requireServer, SMOKE_PREFIX, stamp, USER_EMAIL } from './helpers';

const MCP_URL = `${BASE_URL}/api/mcp`;

/** The tool contract. Adding or renaming a tool means updating this list. */
const EXPECTED_TOOLS = [
	'attach_file',
	'checklist_toggle',
	'create_meeting_note',
	'create_note',
	'create_project',
	'create_task',
	'create_ticket',
	'delete_note',
	'delete_task',
	'delete_ticket',
	'get_attachment',
	'get_inbox',
	'get_note',
	'get_project',
	'get_task',
	'get_ticket',
	'list_notes',
	'list_orgs',
	'list_projects',
	'list_tasks',
	'list_tickets',
	'list_users',
	'log_time',
	'search',
	'update_note',
	'update_project',
	'update_task',
	'update_ticket',
	'whoami',
	'wiki_create_folder',
	'wiki_create_page',
	'wiki_delete_page',
	'wiki_get_page',
	'wiki_tree',
	'wiki_update_page'
];

type ToolResult = Awaited<ReturnType<Client['callTool']>>;

function connect(apiKey: string): { client: Client; transport: StreamableHTTPClientTransport } {
	const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
		requestInit: { headers: { Authorization: `Bearer ${apiKey}` } }
	});
	const client = new Client({ name: 'trackr-smoke', version: '0.0.1' });
	return { client, transport };
}

function textOf(result: ToolResult): string {
	const content = (result.content ?? []) as { type: string; text?: string }[];
	return content
		.filter((c) => c.type === 'text')
		.map((c) => c.text ?? '')
		.join('\n');
}

function structured<T>(result: ToolResult): T {
	return result.structuredContent as T;
}

const run = stamp();
let client: Client;
let projectKey: string;
// Cleaned up in afterAll even when a test failed half-way.
const created = { taskKeys: new Set<string>(), noteIds: new Set<string>() };

async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
	return client.callTool({ name, arguments: args });
}

/** Call a tool and fail the test with the server's message if it errored. */
async function ok(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
	const result = await call(name, args);
	if (result.isError) throw new Error(`${name} failed: ${textOf(result)}`);
	return result;
}

beforeAll(async () => {
	await requireServer();
	const c = connect(API_KEY);
	try {
		await c.client.connect(c.transport);
	} catch (err) {
		throw new Error(
			`MCP connect to ${MCP_URL} failed (${err instanceof Error ? err.message : err}). ` +
				'Is the smoke API key seeded with MCP access? Run `bun run scripts/db/seed/test-fixtures.ts`.',
			{ cause: err }
		);
	}
	client = c.client;
	const projects = structured<{ projects: { key: string; status: string }[] }>(
		await ok('list_projects', { limit: 50 })
	);
	const active = projects.projects.filter((p) => p.status === 'active');
	projectKey = (active.find((p) => p.key === 'TRACKR') ?? active[0] ?? projects.projects[0])?.key;
	if (!projectKey) throw new Error('No project visible to the smoke user — seed the demo data.');
});

afterAll(async () => {
	if (!client) return;
	for (const key of created.taskKeys) await call('delete_task', { key }).catch(() => {});
	for (const id of created.noteIds) await call('delete_note', { id }).catch(() => {});
	await client.close().catch(() => {});
});

describe('transport + auth', () => {
	test('server identifies as trackr', () => {
		const server = client.getServerVersion();
		expect(server?.name).toBe('trackr');
	});

	test('an unknown trk_ key cannot connect', async () => {
		const c = connect('trk_not-a-real-key-000000000000000000000000000');
		await expect(c.client.connect(c.transport)).rejects.toThrow();
		await c.client.close().catch(() => {});
	});

	test('GET /api/mcp is 405 (stateless POST-only endpoint)', async () => {
		const res = await fetch(MCP_URL, { headers: { Authorization: `Bearer ${API_KEY}` } });
		expect(res.status).toBe(405);
	});
});

describe('tool contract', () => {
	test('tools/list exposes exactly the documented tools', async () => {
		const { tools } = await client.listTools();
		expect(tools.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
	});

	test('every tool carries a title, description and annotations', async () => {
		const { tools } = await client.listTools();
		for (const t of tools) {
			expect(t.title, t.name).toBeString();
			expect(t.description, t.name).toBeString();
			expect(t.annotations, t.name).toBeDefined();
		}
	});

	test('resource templates cover ticket, task, wiki, note and attachment', async () => {
		const { resourceTemplates } = await client.listResourceTemplates();
		const uris = resourceTemplates.map((r) => r.uriTemplate);
		for (const kind of ['ticket', 'task', 'wiki', 'note', 'attachment']) {
			expect(
				uris.some((u) => u.startsWith(`trackr://${kind}/`)),
				kind
			).toBe(true);
		}
	});

	test('prompts are listed', async () => {
		const { prompts } = await client.listPrompts();
		expect(prompts.length).toBeGreaterThan(0);
	});
});

describe('read tools', () => {
	test('whoami is the demo staff user via api_key', async () => {
		const me = structured<{ email: string; staff: boolean; authKind: string; orgs: unknown[] }>(
			await ok('whoami')
		);
		expect(me.email).toBe(USER_EMAIL);
		expect(me.staff).toBe(true);
		expect(me.authKind).toBe('api_key');
		expect(me.orgs.length).toBeGreaterThan(0);
	});

	test('list_orgs / list_users / get_inbox answer', async () => {
		const orgs = structured<{ total: number }>(await ok('list_orgs'));
		expect(orgs.total).toBeGreaterThan(0);
		const users = await ok('list_users');
		expect(textOf(users)).toContain(USER_EMAIL);
		const inbox = structured<{ total: number }>(await ok('get_inbox', { limit: 5 }));
		expect(typeof inbox.total).toBe('number');
	});

	test('list_tickets / list_tasks list rows', async () => {
		const tickets = structured<{ total: number }>(await ok('list_tickets', { segment: 'all' }));
		expect(tickets.total).toBeGreaterThan(0);
		const tasks = structured<{ total: number }>(await ok('list_tasks', { scope: 'all' }));
		expect(tasks.total).toBeGreaterThan(0);
	});

	test('get_project resolves a key case-insensitively', async () => {
		const res = await ok('get_project', { key: projectKey.toLowerCase() });
		expect(textOf(res)).toContain(projectKey);
	});

	test('wiki_tree answers', async () => {
		const res = await ok('wiki_tree');
		expect(textOf(res).length).toBeGreaterThan(0);
	});

	test('a malformed task key is a tool error, not a crash', async () => {
		const res = await call('get_task', { key: 'not a key' });
		expect(res.isError).toBe(true);
	});
});

describe('task lifecycle', () => {
	const title = `${SMOKE_PREFIX} mcp task ${run}`;
	let key: string;

	test('create_task returns the new key', async () => {
		const res = structured<{ key: string }>(
			await ok('create_task', {
				projectKey,
				title,
				description: 'created by tests/smoke/mcp.test.ts',
				priority: 'low',
				checklist: [{ text: 'first', done: false }]
			})
		);
		expect(res.key).toStartWith(`${projectKey}-`);
		key = res.key;
		created.taskKeys.add(key);
	});

	test('get_task shows it', async () => {
		const res = await ok('get_task', { key });
		expect(textOf(res)).toContain(title);
	});

	test('search finds it by its unique title token', async () => {
		const res = structured<{ results: { type: string; title: string }[] }>(
			await ok('search', { query: run, types: ['task'] })
		);
		expect(res.results.some((r) => r.type === 'task' && r.title === title)).toBe(true);
	});

	test('update_task changes the status', async () => {
		await ok('update_task', { key, status: 'in_progress' });
		const res = await ok('get_task', { key });
		expect(textOf(res)).toContain('in_progress');
	});

	test('log_time adds a time log', async () => {
		const res = structured<{ minutes: number }>(
			await ok('log_time', { taskKey: key, minutes: 20 })
		);
		expect(res.minutes).toBe(20);
	});

	test('trackr://task/{key} resource mirrors get_task', async () => {
		const res = await client.readResource({ uri: `trackr://task/${key}` });
		const text = res.contents.map((c) => ('text' in c ? c.text : '')).join('\n');
		expect(text).toContain(title);
	});

	test('delete_task removes it; a second delete is 404', async () => {
		const res = structured<{ deleted: boolean }>(await ok('delete_task', { key }));
		expect(res.deleted).toBe(true);
		created.taskKeys.delete(key);
		const again = await call('delete_task', { key });
		expect(again.isError).toBe(true);
	});
});

describe('note lifecycle', () => {
	const title = `${SMOKE_PREFIX} mcp note ${run}`;
	let id: string;

	test('create_note returns the id', async () => {
		const res = structured<{ id: string }>(
			await ok('create_note', { title, body: `Hello **${run}**\n\n- [ ] todo` })
		);
		expect(res.id).toMatch(/^[0-9a-f-]{36}$/);
		id = res.id;
		created.noteIds.add(id);
	});

	test('get_note round-trips the markdown body', async () => {
		const res = await ok('get_note', { id });
		const md = textOf(res);
		expect(md).toContain(title);
		expect(md).toContain(`**${run}**`);
		expect(md).toContain('- [ ] todo');
	});

	test('update_note replaces the body', async () => {
		await ok('update_note', { id, body: `replaced ${run}` });
		const res = await ok('get_note', { id });
		expect(textOf(res)).toContain(`replaced ${run}`);
		expect(textOf(res)).not.toContain('- [ ] todo');
	});

	test('delete_note removes it', async () => {
		const res = structured<{ deleted: boolean }>(await ok('delete_note', { id }));
		expect(res.deleted).toBe(true);
		created.noteIds.delete(id);
		const again = await call('get_note', { id });
		expect(again.isError).toBe(true);
	});
});

describe('attachments', () => {
	// 1×1 transparent PNG — the smallest raster image createAttachment will
	// sniff, thumbnail and hand back inline from get_attachment.
	const PNG_1X1 =
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
	const title = `${SMOKE_PREFIX} mcp attachments ${run}`;
	let key: string;
	let textId: string;
	let pngId: string;

	test('a throwaway task to attach to', async () => {
		const res = structured<{ key: string }>(await ok('create_task', { projectKey, title }));
		key = res.key;
		created.taskKeys.add(key);
	});

	test('attach_file with inline base64 text', async () => {
		const body = `hello ${run}\n`;
		const res = structured<{ id: string; mimeType: string; sizeBytes: number; filename: string }>(
			await ok('attach_file', {
				target: 'task',
				key,
				filename: 'notes.txt',
				content: Buffer.from(body).toString('base64')
			})
		);
		expect(res.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(res.filename).toBe('notes.txt');
		expect(res.mimeType).toBe('text/plain'); // derived from the extension
		expect(res.sizeBytes).toBe(body.length);
		textId = res.id;
	});

	test('attach_file with an inline data: URL image', async () => {
		const res = structured<{ id: string; mimeType: string }>(
			await ok('attach_file', {
				target: 'task',
				key,
				filename: 'dot.png',
				content: `data:image/png;base64,${PNG_1X1}`
			})
		);
		expect(res.mimeType).toBe('image/png');
		pngId = res.id;
	});

	test('get_attachment returns the image inline and text as metadata', async () => {
		const img = await ok('get_attachment', { id: pngId });
		const blocks = (img.content ?? []) as { type: string; mimeType?: string }[];
		expect(blocks.some((b) => b.type === 'image' && b.mimeType === 'image/png')).toBe(true);
		const txt = await ok('get_attachment', { id: textId });
		expect(textOf(txt)).toContain('notes.txt');
		expect(textOf(txt)).toContain('/api/attachments/');
	});

	test('get_task lists both files', async () => {
		const md = textOf(await ok('get_task', { key }));
		expect(md).toContain('notes.txt');
		expect(md).toContain('dot.png');
	});

	test('inline content is refused when oversized, empty, invalid, or unnamed', async () => {
		// 10 MiB + 1 byte, base64 — bounded by encoded length, never buffered.
		const big = 'A'.repeat(Math.ceil(((10 * 1024 * 1024 + 1) * 4) / 3) + 4);
		const tooBig = await call('attach_file', {
			target: 'task',
			key,
			filename: 'big.bin',
			content: big
		});
		expect(tooBig.isError).toBe(true);
		expect(textOf(tooBig)).toContain('10 MiB');
		const empty = await call('attach_file', {
			target: 'task',
			key,
			filename: 'e.txt',
			content: '   '
		});
		expect(empty.isError).toBe(true);
		const invalid = await call('attach_file', {
			target: 'task',
			key,
			filename: 'x.txt',
			content: '@@@'
		});
		expect(invalid.isError).toBe(true);
		const unnamed = await call('attach_file', { target: 'task', key, content: PNG_1X1 });
		expect(unnamed.isError).toBe(true);
		const both = await call('attach_file', {
			target: 'task',
			key,
			filename: 'x.txt',
			content: PNG_1X1,
			url: 'https://example.com/x'
		});
		expect(both.isError).toBe(true);
	});

	test('url attachments refuse private hosts and plain http', async () => {
		const loopback = await call('attach_file', {
			target: 'task',
			key,
			url: `https://127.0.0.1:5173/api/v1/instance`
		});
		expect(loopback.isError).toBe(true);
		expect(textOf(loopback)).toContain('not allowed');
		const http = await call('attach_file', { target: 'task', key, url: 'http://example.com/x' });
		expect(http.isError).toBe(true);
		expect(textOf(http)).toContain('https');
	});

	// Needs internet; opt in with SMOKE_ONLINE=1.
	test.skipIf(!process.env.SMOKE_ONLINE)('attach_file downloads a public https URL', async () => {
		const res = structured<{ id: string; filename: string }>(
			await ok('attach_file', {
				target: 'task',
				key,
				url: 'https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore'
			})
		);
		expect(res.filename).toBe('Node.gitignore');
	});
});

describe('MCP Apps (inline UI)', () => {
	const UI_URI = 'ui://trackr/tickets.html';
	const UI_MIME = 'text/html;profile=mcp-app';

	test('list_tickets advertises its widget in _meta', async () => {
		const { tools } = await client.listTools();
		const tool = tools.find((t) => t.name === 'list_tickets')!;
		const meta = (tool._meta ?? {}) as { ui?: { resourceUri?: string }; 'ui/resourceUri'?: string };
		expect(meta.ui?.resourceUri).toBe(UI_URI);
		expect(meta['ui/resourceUri']).toBe(UI_URI);
	});

	test('the widget is listed as an MCP App resource (no host-specific domain)', async () => {
		const { resources } = await client.listResources();
		const r = resources.find((x) => x.uri === UI_URI)!;
		expect(r).toBeDefined();
		expect(r.mimeType).toBe(UI_MIME);
		const meta = (r._meta ?? {}) as { ui?: { domain?: string; prefersBorder?: boolean } };
		expect(meta.ui?.prefersBorder).toBe(true);
		// A `domain` would point Claude Desktop at a sandbox host that only
		// exists for claude.ai remote connectors — the frame then fails to load.
		expect(meta.ui?.domain).toBeUndefined();
	});

	test('reading ui://trackr/tickets.html returns a self-contained HTML app', async () => {
		const res = await client.readResource({ uri: UI_URI });
		const [c] = res.contents;
		expect(c.mimeType).toBe(UI_MIME);
		const html = 'text' in c ? c.text : '';
		expect(html).toStartWith('<!doctype html>');
		expect(html).toContain('trackr-tickets'); // the App's name
		expect(html.length).toBeGreaterThan(100_000); // ext-apps client is inlined
		// Single file: no external scripts or stylesheets to load.
		expect(html).not.toMatch(/<script[^>]+src=/);
		expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
	});

	test('list_tickets rows carry id + url for click-to-open', async () => {
		const res = structured<{ tickets: { id: string; key: string; url: string }[] }>(
			await ok('list_tickets', { segment: 'all', limit: 3 })
		);
		expect(res.tickets.length).toBeGreaterThan(0);
		for (const t of res.tickets) {
			expect(t.id).toMatch(/^[0-9a-f-]{36}$/);
			expect(t.url).toBe(`${BASE_URL}/tickets/${t.id}`);
		}
	});
});
