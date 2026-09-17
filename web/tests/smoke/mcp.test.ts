// Smoke tests for the MCP endpoint (/api/mcp) against a live server — see
// helpers.ts for the target/credentials and `bun run test:smoke:mcp`.
// Connects with the Streamable HTTP client and a `trk_` API key (a user with
// MCP access enabled), checks the tool contract, then runs a task and a note
// through create → read → update → delete, cleaning up after itself.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import {
	api,
	API_KEY,
	BASE_URL,
	DEMO,
	formAction,
	idOf,
	requireServer,
	signInForCookie,
	SMOKE_PREFIX,
	stamp,
	USER_EMAIL
} from './helpers';

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
	'get_guide',
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
	'show_items',
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
const created = {
	taskKeys: new Set<string>(),
	ticketKeys: new Set<string>(),
	noteIds: new Set<string>()
};

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
	for (const key of created.ticketKeys) await call('delete_ticket', { key }).catch(() => {});
	for (const id of created.noteIds) await call('delete_note', { id }).catch(() => {});
	await client.close().catch(() => {});
});

describe('ticket attribution', () => {
	test('an agent-created ticket retains the authenticated creator and customer', async () => {
		const me = structured<{ id: string; name: string; staff: boolean }>(await ok('whoami'));
		expect(me.staff).toBe(true);
		const { orgs } = structured<{ orgs: { key: string; internal: boolean }[] }>(
			await ok('list_orgs')
		);
		const org = orgs.find((o) => o.internal) ?? orgs[0];
		expect(org).toBeDefined();
		type Detail = {
			ticket: {
				customer: { id: string; name: string } | null;
				createdBy: { id: string; name: string } | null;
			};
		};
		const result = structured<Detail & { id: string; key: string }>(
			await ok('create_ticket', {
				orgKey: org.key,
				subject: `${SMOKE_PREFIX} mcp reporter ${run}`,
				createdBy: 'spoofed-creator',
				customerId: 'spoofed-customer'
			})
		);
		created.ticketKeys.add(result.key);
		const expected = { id: me.id, name: me.name };
		expect(result.ticket.createdBy).toEqual(expected);
		expect(result.ticket.customer).toEqual(expected);
		const detail = structured<Detail>(await ok('get_ticket', { key: result.key }));
		expect(detail.ticket.createdBy).toEqual(expected);
		expect(detail.ticket.customer).toEqual(expected);
		// Read through the independent REST surface to check the persisted fields.
		const persisted = await api<{
			ticket: { createdBy: string | null; customerId: string | null };
		}>('GET', `/api/v1/tickets/${result.id}`);
		expect(persisted.status).toBe(200);
		expect(persisted.body.ticket.createdBy).toBe(me.id);
		expect(persisted.body.ticket.customerId).toBe(me.id);
	});
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
		for (const kind of ['ticket', 'task', 'wiki', 'note', 'attachment', 'guide']) {
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

	test('list_tasks filters: array status, unassigned, and never exceed the unfiltered total', async () => {
		type T = { total: number; tasks: { status: string; assignees: { id: string }[] }[] };
		const all = structured<T>(await ok('list_tasks', { scope: 'all', limit: 200 }));
		// A multi-value status filter keeps only those statuses.
		const open = structured<T>(
			await ok('list_tasks', { scope: 'all', status: ['todo', 'in_progress'], limit: 200 })
		);
		expect(open.total).toBeLessThanOrEqual(all.total);
		expect(open.tasks.every((t) => t.status === 'todo' || t.status === 'in_progress')).toBe(true);
		// `unassigned` returns only tasks with no assignees.
		const none = structured<T>(
			await ok('list_tasks', { scope: 'all', assignee: 'unassigned', limit: 200 })
		);
		expect(none.tasks.every((t) => t.assignees.length === 0)).toBe(true);
	});

	test('list_tickets filters: unassigned returns only unassigned', async () => {
		type T = { total: number; tickets: { assignees: { id: string }[] }[] };
		const none = structured<T>(
			await ok('list_tickets', { segment: 'all', assignee: 'unassigned', limit: 200 })
		);
		expect(none.tickets.every((t) => t.assignees.length === 0)).toBe(true);
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

	test('create_note with parentId nests a sub-note; list_notes reports the parent', async () => {
		const child = structured<{ id: string; parentId: string | null }>(
			await ok('create_note', { title: `${title} child`, parentId: id })
		);
		expect(child.parentId).toBe(id);
		created.noteIds.add(child.id);
		const list = structured<{ notes: { id: string; parentId: string | null }[] }>(
			await ok('list_notes', { kind: 'quick', limit: 200 })
		);
		expect(list.notes.find((n) => n.id === child.id)?.parentId).toBe(id);
		expect(list.notes.find((n) => n.id === id)?.parentId).toBeNull();
		// A note that isn't yours (or doesn't exist) can't be a parent.
		const bad = await call('create_note', {
			title: `${title} orphan`,
			parentId: '00000000-0000-0000-0000-000000000000'
		});
		expect(bad.isError).toBe(true);
	});

	test('delete_note removes it and its sub-notes', async () => {
		const before = structured<{ notes: { id: string; parentId: string | null }[] }>(
			await ok('list_notes', { kind: 'quick', limit: 200 })
		);
		const childIds = before.notes.filter((n) => n.parentId === id).map((n) => n.id);
		expect(childIds.length).toBe(1);
		const res = structured<{ deleted: boolean }>(await ok('delete_note', { id }));
		expect(res.deleted).toBe(true);
		created.noteIds.delete(id);
		for (const c of childIds) created.noteIds.delete(c);
		const again = await call('get_note', { id });
		expect(again.isError).toBe(true);
		const childAgain = await call('get_note', { id: childIds[0] });
		expect(childAgain.isError).toBe(true);
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
	const LIST_URI = 'ui://trackr/list.html';
	const DETAIL_URI = 'ui://trackr/detail.html';
	const UI_MIME = 'text/html;profile=mcp-app';
	const LIST_TOOLS = ['show_items'];
	// Finding tools stay text-only so the host folds them away while the model works.
	const TEXT_ONLY_TOOLS = ['list_tickets', 'list_tasks', 'list_projects', 'search', 'delete_task'];
	const DETAIL_TOOLS = [
		'get_task',
		'create_task',
		'update_task',
		'log_time',
		'checklist_toggle',
		'get_ticket',
		'create_ticket',
		'update_ticket'
	];

	test('list and detail tools advertise their widget in _meta', async () => {
		const { tools } = await client.listTools();
		const uriOf = (name: string) => {
			const meta = (tools.find((t) => t.name === name)?._meta ?? {}) as {
				ui?: { resourceUri?: string };
				'ui/resourceUri'?: string;
			};
			expect(meta['ui/resourceUri'], name).toBe(meta.ui?.resourceUri);
			return meta.ui?.resourceUri;
		};
		for (const name of LIST_TOOLS) expect(uriOf(name), name).toBe(LIST_URI);
		for (const name of DETAIL_TOOLS) expect(uriOf(name), name).toBe(DETAIL_URI);
		for (const name of TEXT_ONLY_TOOLS) expect(uriOf(name), name).toBeUndefined();
	});

	test('both widgets are listed as MCP App resources (no host-specific domain)', async () => {
		const { resources } = await client.listResources();
		for (const uri of [LIST_URI, DETAIL_URI]) {
			const r = resources.find((x) => x.uri === uri)!;
			expect(r, uri).toBeDefined();
			expect(r.mimeType, uri).toBe(UI_MIME);
			const meta = (r._meta ?? {}) as { ui?: { domain?: string; prefersBorder?: boolean } };
			expect(meta.ui?.prefersBorder, uri).toBe(true);
			// A `domain` would point Claude Desktop at a sandbox host that only
			// exists for claude.ai remote connectors — the frame then fails to load.
			expect(meta.ui?.domain, uri).toBeUndefined();
		}
	});

	test('reading each widget returns a self-contained HTML app', async () => {
		for (const [uri, appName] of [
			[LIST_URI, 'trackr-list'],
			[DETAIL_URI, 'trackr-detail']
		]) {
			const res = await client.readResource({ uri });
			const [c] = res.contents;
			expect(c.mimeType, uri).toBe(UI_MIME);
			const html = 'text' in c ? c.text : '';
			expect(html, uri).toStartWith('<!doctype html>');
			expect(html, uri).toContain(appName);
			expect(html.length, uri).toBeGreaterThan(100_000); // ext-apps client inlined
			expect(html, uri).not.toMatch(/<script[^>]+src=/);
			expect(html, uri).not.toMatch(/<link[^>]+rel="stylesheet"/);
		}
	});

	test('list rows carry an app url for click-to-open', async () => {
		const tickets = structured<{ tickets: { id: string; url: string }[] }>(
			await ok('list_tickets', { segment: 'all', limit: 3 })
		);
		for (const t of tickets.tickets) expect(t.url).toBe(`${BASE_URL}/tickets/${t.id}`);
		const tasks = structured<{ tasks: { key: string; url: string }[] }>(
			await ok('list_tasks', { scope: 'all', limit: 3 })
		);
		for (const t of tasks.tasks) expect(t.url).toBe(`${BASE_URL}/tasks?task=${t.key}`);
		const projects = structured<{ projects: { id: string; url: string | null }[] }>(
			await ok('list_projects', { limit: 3 })
		);
		for (const p of projects.projects) expect(p.url).toBe(`${BASE_URL}/projects/${p.id}`);
		const hits = structured<{ results: { url: string }[] }>(await ok('search', { query: 'in' }));
		for (const r of hits.results) expect(r.url).toStartWith(`${BASE_URL}/`);
	});

	test('show_items renders the named tasks, tickets and projects together', async () => {
		const [ticket] = structured<{ tickets: { key: string }[] }>(
			await ok('list_tickets', { segment: 'all', limit: 1 })
		).tickets;
		const [task] = structured<{ tasks: { key: string }[] }>(
			await ok('list_tasks', { scope: 'all', limit: 1 })
		).tasks;
		const [project] = structured<{ projects: { key: string }[] }>(
			await ok('list_projects', { limit: 1 })
		).projects;
		type Shown = {
			total: number;
			notFound: string[];
			tasks?: { key: string; projectName: string; url: string }[];
			tickets?: { key: string; orgName: string; url: string }[];
			projects?: { key: string; url: string | null }[];
		};
		const res = await ok('show_items', {
			keys: [task.key.toLowerCase(), ticket.key, project.key.toLowerCase(), 'NOPE-999', task.key]
		});
		const shown = structured<Shown>(res);
		expect(shown.total).toBe(3);
		expect(shown.notFound).toEqual(['NOPE-999']);
		expect(shown.tasks?.map((t) => t.key)).toEqual([task.key]);
		expect(shown.tasks?.[0].projectName).toBeTruthy();
		expect(shown.tickets?.map((t) => t.key)).toEqual([ticket.key]);
		expect(shown.tickets?.[0].orgName).toBeTruthy();
		expect(shown.projects?.map((p) => p.key)).toEqual([project.key]);
		const md = textOf(res);
		expect(md).toContain('## Tasks (1)');
		expect(md).toContain('## Tickets (1)');
		expect(md).toContain('## Projects (1)');
		expect(md).toContain('NOPE-999');
	});

	test('task write tools return the full task for the detail widget', async () => {
		const title = `${SMOKE_PREFIX} mcp detail ${run}`;
		type Detail = {
			task: {
				kind: string;
				key: string;
				url: string;
				status: string;
				description: string;
				checklist: { id: string; text: string; done: boolean }[];
				comments: unknown[];
				timeLogs: { minutes: number }[];
				totalMinutes: number;
			};
		};
		const made = structured<Detail>(
			await ok('create_task', {
				projectKey,
				title,
				description: 'Some **markdown**',
				checklist: [{ text: 'first' }, { text: 'second', done: true }]
			})
		);
		created.taskKeys.add(made.task.key);
		expect(made.task.kind).toBe('task');
		expect(made.task.description).toBe('Some **markdown**');
		expect(made.task.checklist.map((c) => c.done)).toEqual([false, true]);
		expect(made.task.url).toBe(`${BASE_URL}/tasks?task=${made.task.key}`);

		const updated = structured<Detail & { changed: boolean }>(
			await ok('update_task', { key: made.task.key, status: 'in_progress' })
		);
		expect(updated.changed).toBe(true);
		expect(updated.task.status).toBe('in_progress');
		expect(updated.task.checklist).toHaveLength(2);

		const toggled = structured<Detail>(
			await ok('checklist_toggle', {
				target: 'task',
				key: made.task.key,
				itemId: made.task.checklist[0].id,
				done: true
			})
		);
		expect(toggled.task.checklist.every((c) => c.done)).toBe(true);

		const logged = structured<Detail>(
			await ok('log_time', { taskKey: made.task.key, minutes: 25 })
		);
		expect(logged.task.totalMinutes).toBe(25);

		const fetched = structured<Detail>(await ok('get_task', { key: made.task.key }));
		expect(fetched.task.timeLogs[0].minutes).toBe(25);
		expect(fetched.task.status).toBe('in_progress');
	});

	test('get_ticket returns the full ticket for the detail widget', async () => {
		const list = structured<{ tickets: { key: string }[] }>(
			await ok('list_tickets', { segment: 'all', limit: 1 })
		);
		const key = list.tickets[0].key;
		const d = structured<{
			ticket: {
				kind: string;
				key: string;
				url: string;
				messages: { kind: string; body: string; author: { name: string } | null }[];
				checklist: unknown[];
				attachments: unknown[];
				assignees: { name: string }[];
			};
		}>(await ok('get_ticket', { key }));
		expect(d.ticket.kind).toBe('ticket');
		expect(d.ticket.key).toBe(key);
		expect(d.ticket.url).toContain('/tickets/');
		expect(Array.isArray(d.ticket.messages)).toBe(true);
		expect(Array.isArray(d.ticket.checklist)).toBe(true);
	});
});

describe('guidance (instructions + guides)', () => {
	// Admin-side setup goes through the Settings → MCP form actions with the
	// superadmin demo account (Settings → MCP is superadmin tier); the MCP side is checked with a
	// fresh client because instructions are only delivered on initialize.
	const slug = `smoke-guide-${run}`;
	let cookie: string;
	let guideId: string | null = null;

	beforeAll(async () => {
		cookie = await signInForCookie(DEMO.superadmin.email, DEMO.superadmin.password);
	});

	afterAll(async () => {
		if (guideId) {
			await formAction('/admin/settings/mcp', 'guideDelete', { id: guideId }, { cookie });
		}
		await formAction('/admin/settings/mcp', 'saveInstructions', { instructions: '' }, { cookie });
	});

	async function freshInstructions(): Promise<string> {
		const c = connect(API_KEY);
		await c.client.connect(c.transport);
		const text = c.client.getInstructions() ?? '';
		await c.client.close().catch(() => {});
		return text;
	}

	test('built-in instructions tell the model not to pad tasks and tickets', () => {
		const text = client.getInstructions() ?? '';
		expect(text).toContain('Writing tasks and tickets');
		expect(text).toContain('Never invent steps');
	});

	test('get_guide with an unknown slug is a 404 tool error', async () => {
		const res = await call('get_guide', { slug: `nope-${run}` });
		expect(res.isError).toBe(true);
		expect(textOf(res)).toContain('404');
	});

	test('admin instructions are appended for new connections', async () => {
		const marker = `${SMOKE_PREFIX} house rule ${run}: always answer in haiku`;
		const saved = await formAction(
			'/admin/settings/mcp',
			'saveInstructions',
			{ instructions: marker },
			{ cookie }
		);
		expect(saved.type).toBe('success');
		const text = await freshInstructions();
		expect(text).toContain('Workspace instructions from the admins');
		expect(text).toContain(marker);
		expect(text.indexOf('Writing tasks and tickets')).toBeLessThan(text.indexOf(marker));
	});

	test('a guide is readable through get_guide, the resource and the index', async () => {
		const title = `${SMOKE_PREFIX} guide ${run}`;
		const body = `# Rack the server\n\n1. Mount rails\n2. Cable power\n\nStamp ${run}.`;
		const saved = await formAction(
			'/admin/settings/mcp/guides/new',
			'save',
			{ title, slug, summary: 'Steps for racking a server', body, enabled: 'on', fetched: '0' },
			{ cookie }
		);
		expect(saved.type).toBe('redirect');
		const match = /\/admin\/settings\/mcp\/guides\/([^/?]+)/.exec(saved.location ?? '');
		expect(match).not.toBeNull();
		guideId = match![1];

		const res = await ok('get_guide', { slug });
		const data = structured<{ slug: string; title: string; markdown: string }>(res);
		expect(data.slug).toBe(slug);
		expect(data.title).toBe(title);
		expect(data.markdown).toContain('1. Mount rails');
		expect(textOf(res)).toContain(`Stamp ${run}`);

		const c = connect(API_KEY);
		await c.client.connect(c.transport);
		try {
			expect(c.client.getInstructions() ?? '').toContain(`\`${slug}\` — ${title}`);
			const tool = (await c.client.listTools()).tools.find((t) => t.name === 'get_guide');
			expect(tool?.description).toContain(slug);
			const { resources } = await c.client.listResources();
			expect(resources.some((r) => r.uri === `trackr://guide/${slug}`)).toBe(true);
			const read = await c.client.readResource({ uri: `trackr://guide/${slug}` });
			const first = read.contents[0] as { text?: string; mimeType?: string };
			expect(first.mimeType).toBe('text/markdown');
			expect(first.text).toContain('2. Cable power');
		} finally {
			await c.client.close().catch(() => {});
		}
	});

	test('a disabled guide disappears from get_guide', async () => {
		expect(guideId).not.toBeNull();
		const off = await formAction(
			'/admin/settings/mcp',
			'guideDisable',
			{ id: guideId! },
			{ cookie }
		);
		expect(off.type).toBe('success');
		const res = await call('get_guide', { slug });
		expect(res.isError).toBe(true);
		const on = await formAction('/admin/settings/mcp', 'guideEnable', { id: guideId! }, { cookie });
		expect(on.type).toBe('success');
		expect((await ok('get_guide', { slug })).isError).toBeFalsy();
	});

	test('a duplicate slug is rejected', async () => {
		const dup = await formAction(
			'/admin/settings/mcp/guides/new',
			'save',
			{ title: 'dup', slug, body: '', enabled: 'on', fetched: '0' },
			{ cookie }
		);
		expect(dup.type).toBe('failure');
		expect(dup.status).toBe(400);
	});
});

describe('audit trail (channel + content events + connections)', () => {
	// The audit log is admin-only; read it through the log page's JSON feed
	// with the smoke user's cookie and the same filters the UI uses.
	let cookie: string;
	// Settings → MCP is superadmin tier; the OAuth flow itself needs a user with
	// MCP access (the smoke user), so the two roles are kept apart.
	let superadminCookie: string;
	let wikiPageId: string | null = null;
	let connectionId: string | null = null;

	type LogRow = { type: string; channel: string | null; target: string; targetId: string | null };

	async function logRows(params: Record<string, string>): Promise<LogRow[]> {
		const res = await fetch(`${BASE_URL}/admin/system/logs/data?${new URLSearchParams(params)}`, {
			headers: { cookie },
			signal: AbortSignal.timeout(30_000)
		});
		if (!res.ok) throw new Error(`/admin/system/logs/data → HTTP ${res.status}`);
		return ((await res.json()) as { events: LogRow[] }).events;
	}

	/** recordAudit is fire-and-forget — give the insert a moment. */
	async function rowsFor(params: Record<string, string>, predicate: (r: LogRow) => boolean) {
		for (let i = 0; i < 10; i++) {
			const hit = (await logRows(params)).filter(predicate);
			if (hit.length) return hit;
			await new Promise((r) => setTimeout(r, 200));
		}
		return [];
	}

	beforeAll(async () => {
		[cookie, superadminCookie] = await Promise.all([
			signInForCookie(DEMO.admin.email, DEMO.admin.password),
			signInForCookie(DEMO.superadmin.email, DEMO.superadmin.password)
		]);
	});

	afterAll(async () => {
		if (wikiPageId) await call('wiki_delete_page', { id: wikiPageId }).catch(() => {});
		if (connectionId) {
			await formAction(
				'/admin/settings/mcp',
				'revoke',
				{ id: connectionId },
				{ cookie: superadminCookie }
			);
		}
	});

	test('a task created through MCP is logged on the mcp channel', async () => {
		const title = `${SMOKE_PREFIX} audit task ${run}`;
		const { key } = structured<{ key: string }>(await ok('create_task', { projectKey, title }));
		created.taskKeys.add(key);
		const rows = await rowsFor(
			{ channel: 'mcp', q: key },
			(r) => r.type === 'task.create' && r.target.startsWith(key)
		);
		expect(rows.length).toBe(1);
		expect(rows[0].channel).toBe('mcp');
		// …and does not show up under another channel.
		const web = await logRows({ channel: 'web', q: key });
		expect(web.some((r) => r.type === 'task.create')).toBe(false);
	});

	test('wiki page create/update/delete are audited under "content"', async () => {
		const title = `${SMOKE_PREFIX} audit wiki ${run}`;
		const { id } = structured<{ id: string }>(
			await ok('wiki_create_page', { title, body: 'first version' })
		);
		wikiPageId = id;
		await ok('wiki_update_page', { id, body: 'second version' });
		const rows = await rowsFor(
			{ kind: 'content', channel: 'mcp', q: title },
			(r) => r.targetId === id
		);
		expect(rows.map((r) => r.type).sort()).toEqual(['wiki.create', 'wiki.update']);
		await ok('wiki_delete_page', { id });
		wikiPageId = null;
		const deleted = await rowsFor(
			{ kind: 'content', q: title },
			(r) => r.targetId === id && r.type === 'wiki.delete'
		);
		expect(deleted.length).toBe(1);
	});

	test('an OAuth code exchange is logged as an MCP connection', async () => {
		// Dynamic client registration → authorize (session cookie, PKCE) → token.
		const reg = await fetch(`${BASE_URL}/api/auth/mcp/register`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				client_name: `${SMOKE_PREFIX} oauth ${run}`,
				redirect_uris: ['http://127.0.0.1:1/callback'],
				grant_types: ['authorization_code'],
				response_types: ['code'],
				token_endpoint_auth_method: 'none'
			}),
			signal: AbortSignal.timeout(30_000)
		});
		expect(reg.status).toBeLessThan(300);
		const client = (await reg.json()) as { client_id: string };

		const verifier = 'smoke-verifier-' + run + '-' + 'x'.repeat(32);
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
		const challenge = Buffer.from(digest).toString('base64url');
		const authz = new URLSearchParams({
			client_id: client.client_id,
			redirect_uri: 'http://127.0.0.1:1/callback',
			response_type: 'code',
			scope: 'openid profile email offline_access',
			state: run,
			code_challenge: challenge,
			code_challenge_method: 'S256'
		});
		const auth = await fetch(`${BASE_URL}/api/auth/mcp/authorize?${authz}`, {
			headers: { cookie },
			redirect: 'manual',
			signal: AbortSignal.timeout(30_000)
		});
		const location = auth.headers.get('location') ?? '';
		const code = new URL(location, BASE_URL).searchParams.get('code');
		expect(code, `authorize answered ${auth.status} → ${location}`).toBeTruthy();

		const tok = await fetch(`${BASE_URL}/api/auth/mcp/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: code!,
				redirect_uri: 'http://127.0.0.1:1/callback',
				client_id: client.client_id,
				code_verifier: verifier
			}),
			signal: AbortSignal.timeout(30_000)
		});
		expect(tok.status).toBe(200);
		const tokens = (await tok.json()) as { access_token: string };
		expect(tokens.access_token).toBeString();

		const rows = await rowsFor(
			{ channel: 'mcp', q: `oauth ${run}` },
			(r) => r.type === 'mcp_connection.create'
		);
		expect(rows.length).toBe(1);
		expect(rows[0].target).toContain(`oauth ${run}`);
		connectionId = rows[0].targetId;
		expect(connectionId).toBeTruthy();

		// The token actually works against the MCP endpoint.
		const c = connect(tokens.access_token);
		await c.client.connect(c.transport);
		expect(c.client.getServerVersion()?.name).toBe('trackr');
		await c.client.close().catch(() => {});
	});
});

describe('personal guidance (/me/connections)', () => {
	// The smoke API key belongs to Max (has MCP access): his personal layer is
	// what a fresh client sees. A workspace guide with the same slug (set up
	// as the superadmin) must be shadowed by his own.
	const slug = `smoke-personal-${run}`;
	let cookie: string;
	let superadminCookie: string;
	let superadminId: string;
	let personalId: string | null = null;
	let workspaceId: string | null = null;

	beforeAll(async () => {
		[cookie, superadminCookie, superadminId] = await Promise.all([
			signInForCookie(DEMO.admin.email, DEMO.admin.password),
			signInForCookie(DEMO.superadmin.email, DEMO.superadmin.password),
			idOf(DEMO.superadmin.email, DEMO.superadmin.password)
		]);
		// The "other user" below needs MCP access of her own (no fixture row).
		await formAction(
			'/admin/directory/users',
			'mcpEnable',
			{ userId: superadminId },
			{ cookie: superadminCookie }
		);
	});

	afterAll(async () => {
		await formAction(
			'/admin/directory/users',
			'mcpDisable',
			{ userId: superadminId },
			{ cookie: superadminCookie }
		);
		if (personalId) {
			await formAction('/me/connections', 'guideDelete', { id: personalId }, { cookie });
		}
		if (workspaceId) {
			await formAction(
				'/admin/settings/mcp',
				'guideDelete',
				{ id: workspaceId },
				{ cookie: superadminCookie }
			);
		}
		await formAction('/me/connections', 'saveInstructions', { instructions: '' }, { cookie });
	});

	async function fresh() {
		const c = connect(API_KEY);
		await c.client.connect(c.transport);
		return c;
	}

	test('personal instructions are appended after the workspace ones', async () => {
		const marker = `${SMOKE_PREFIX} personal rule ${run}: call me Max`;
		const saved = await formAction(
			'/me/connections',
			'saveInstructions',
			{ instructions: marker },
			{ cookie }
		);
		expect(saved.type).toBe('success');
		const c = await fresh();
		try {
			const text = c.client.getInstructions() ?? '';
			expect(text).toContain('Personal instructions from the user');
			expect(text).toContain(marker);
			expect(text.indexOf('Writing tasks and tickets')).toBeLessThan(text.indexOf(marker));
		} finally {
			await c.client.close().catch(() => {});
		}
	});

	test('a personal guide is listed as personal and shadows a workspace guide with the same slug', async () => {
		const ws = await formAction(
			'/admin/settings/mcp/guides/new',
			'save',
			{
				title: `${SMOKE_PREFIX} ws ${run}`,
				slug,
				body: `workspace body ${run}`,
				enabled: 'on',
				fetched: '0'
			},
			{ cookie: superadminCookie }
		);
		expect(ws.type).toBe('redirect');
		workspaceId = /\/guides\/([^/?]+)/.exec(ws.location ?? '')?.[1] ?? null;
		expect(workspaceId).toBeString();

		const mine = await formAction(
			'/me/connections/guides/new',
			'save',
			{
				title: `${SMOKE_PREFIX} mine ${run}`,
				slug,
				body: `personal body ${run}`,
				enabled: 'on',
				fetched: '0'
			},
			{ cookie }
		);
		expect(mine.type).toBe('redirect');
		expect(mine.location).toContain('/me/connections/guides/');
		personalId = /\/guides\/([^/?]+)/.exec(mine.location ?? '')?.[1] ?? null;
		expect(personalId).toBeString();
		expect(personalId).not.toBe(workspaceId);

		const c = await fresh();
		try {
			const text = c.client.getInstructions() ?? '';
			expect(text).toContain(`\`${slug}\` — ${SMOKE_PREFIX} mine ${run}`);
			expect(text).toContain('(personal guide');
			expect(text).not.toContain(`${SMOKE_PREFIX} ws ${run}`);
			const res = await c.client.callTool({ name: 'get_guide', arguments: { slug } });
			expect(res.isError).toBeFalsy();
			expect(textOf(res)).toContain(`personal body ${run}`);
			expect(textOf(res)).not.toContain(`workspace body ${run}`);
		} finally {
			await c.client.close().catch(() => {});
		}
	});

	test("someone else's personal guide cannot be touched from /me", async () => {
		expect(personalId).toBeString();
		const r = await formAction(
			'/me/connections',
			'guideDelete',
			{ id: personalId! },
			{ cookie: superadminCookie }
		);
		expect(r.type).toBe('failure');
		expect(r.status).toBe(404);
		// …nor from the workspace registry: it is not a workspace guide.
		const a = await formAction(
			'/admin/settings/mcp',
			'guideDelete',
			{ id: personalId! },
			{ cookie: superadminCookie }
		);
		expect(a.type).toBe('failure');
		expect(a.status).toBe(404);
	});
});
