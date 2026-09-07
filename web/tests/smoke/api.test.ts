// Smoke tests for the /api/v1 JSON surface (the native app's API), run
// against a live server — see helpers.ts for the target/credentials and
// `bun run test:smoke:api`. Walks auth, the read endpoints, and a full
// create → read → update → delete lifecycle for tasks and tickets, cleaning
// up everything it creates.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	api,
	requireServer,
	signInForBearerToken,
	SMOKE_PREFIX,
	stamp,
	USER_EMAIL
} from './helpers';

type Me = {
	user: { id: string; name: string; email: string };
	capabilities: { userType: string; isAdmin: boolean; surfaces: Record<string, boolean> };
	orgs: { id: string; slug: string; name: string }[];
	unreadCount: number;
};
type ProjectRow = { id: string; key: string; name: string; status: string };
type TaskDetail = {
	task: {
		uuid: string;
		id: string;
		title: string;
		status: string;
		priority: string;
		comments?: { id: string; body: string }[];
		timeLogs?: { id: string; minutes: number }[];
	};
	canEdit: boolean;
	canComment: boolean;
};
type TicketDetail = {
	ticket: { id: string; displayId: string; subject: string; status: string; priority: string };
	messages: unknown[];
	canEdit: boolean;
};

const run = stamp();
let me: Me;
let projectKey: string;
let orgId: string;

// Ids of rows created below; deleted in afterAll even when a test failed
// half-way, so a red run never leaves smoke rows behind.
const created = { tasks: new Set<string>(), tickets: new Set<string>(), notes: new Set<string>() };

beforeAll(async () => {
	await requireServer();
	const res = await api<Me>('GET', '/api/v1/me');
	if (res.status !== 200) {
		throw new Error(
			`GET /api/v1/me answered ${res.status} — is the smoke API key seeded? ` +
				'Run `bun run scripts/db/seed/test-fixtures.ts` (or `bun run db:seed --all`).'
		);
	}
	me = res.body;
	const projects = await api<{ projects: ProjectRow[] }>('GET', '/api/v1/projects');
	const active = projects.body.projects.filter((p) => p.status === 'active');
	projectKey = (active.find((p) => p.key === 'TRACKR') ?? active[0] ?? projects.body.projects[0])
		?.key;
	if (!projectKey) throw new Error('No project visible to the smoke user — seed the demo data.');
	orgId = (me.orgs.find((o) => o.slug === 'siweb') ?? me.orgs[0])?.id;
	if (!orgId) throw new Error('No organization visible to the smoke user — seed the demo data.');
});

afterAll(async () => {
	for (const id of created.tasks) await api('DELETE', `/api/v1/tasks/${id}`);
	for (const id of created.tickets) await api('DELETE', `/api/v1/tickets/${id}`);
});

describe('handshake + auth', () => {
	test('GET /api/v1/instance identifies as trackr', async () => {
		const res = await api<{ name: string; version: string; api: number }>(
			'GET',
			'/api/v1/instance',
			undefined,
			{ token: null }
		);
		expect(res.status).toBe(200);
		expect(res.body.name).toBe('trackr');
		expect(res.body.api).toBe(1);
	});

	test('no Authorization header → 401 JSON', async () => {
		const res = await api<{ message?: string }>('GET', '/api/v1/me', undefined, { token: null });
		expect(res.status).toBe(401);
	});

	test('unknown trk_ key → 401', async () => {
		const res = await api('GET', '/api/v1/me', undefined, {
			token: 'trk_not-a-real-key-000000000000000000000000000'
		});
		expect(res.status).toBe(401);
	});

	test('email + password sign-in yields a bearer session token that works', async () => {
		const token = await signInForBearerToken();
		const res = await api<Me>('GET', '/api/v1/me', undefined, { token });
		expect(res.status).toBe(200);
		expect(res.body.user.email).toBe(USER_EMAIL);
	});
});

describe('me', () => {
	test('GET /api/v1/me describes the demo staff user', () => {
		expect(me.user.email).toBe(USER_EMAIL);
		expect(me.capabilities.userType).toBe('staff');
		expect(me.capabilities.surfaces.tasks).toBe(true);
		expect(me.orgs.length).toBeGreaterThan(0);
		expect(typeof me.unreadCount).toBe('number');
	});

	test('GET /api/v1/inbox/badge returns an unread count', async () => {
		const res = await api<{ unread: number }>('GET', '/api/v1/inbox/badge');
		expect(res.status).toBe(200);
		expect(typeof res.body.unread).toBe('number');
	});

	test('GET /api/v1/inbox lists notifications', async () => {
		const res = await api<Record<string, unknown>>('GET', '/api/v1/inbox');
		expect(res.status).toBe(200);
		expect(typeof res.body).toBe('object');
	});
});

describe('projects', () => {
	test('GET /api/v1/projects lists projects with members', async () => {
		const res = await api<{ projects: (ProjectRow & { members: unknown[] })[] }>(
			'GET',
			'/api/v1/projects'
		);
		expect(res.status).toBe(200);
		expect(res.body.projects.length).toBeGreaterThan(0);
		const p = res.body.projects.find((x) => x.key === projectKey)!;
		expect(p).toBeDefined();
		expect(Array.isArray(p.members)).toBe(true);
	});
});

describe('tasks lifecycle', () => {
	const title = `${SMOKE_PREFIX} api task ${run}`;
	let taskId: string;
	let displayId: string;

	test('POST /api/v1/tasks creates a task', async () => {
		const res = await api<{ id: string; displayId: string }>('POST', '/api/v1/tasks', {
			title,
			projectKey,
			description: 'created by tests/smoke/api.test.ts',
			priority: 'low',
			tags: ['smoke']
		});
		expect(res.status).toBe(201);
		expect(res.body.id).toBeString();
		expect(res.body.displayId).toStartWith(`${projectKey}-`);
		taskId = res.body.id;
		displayId = res.body.displayId;
		created.tasks.add(taskId);
	});

	test('POST /api/v1/tasks rejects a missing title', async () => {
		const res = await api('POST', '/api/v1/tasks', { projectKey });
		expect(res.status).toBe(400);
	});

	test('GET /api/v1/tasks/:id returns the detail', async () => {
		const res = await api<TaskDetail>('GET', `/api/v1/tasks/${taskId}`);
		expect(res.status).toBe(200);
		expect(res.body.task.title).toBe(title);
		expect(res.body.task.id).toBe(displayId);
		expect(res.body.task.status).toBe('todo');
		expect(res.body.task.priority).toBe('low');
		expect(res.body.canEdit).toBe(true);
	});

	test('GET /api/v1/tasks?scope=mine includes it', async () => {
		const res = await api<{ tasks: { uuid: string }[] }>('GET', '/api/v1/tasks?scope=mine');
		expect(res.status).toBe(200);
		expect(res.body.tasks.some((t) => t.uuid === taskId)).toBe(true);
	});

	test('PATCH /api/v1/tasks/:id changes status', async () => {
		const res = await api<{ ok: boolean }>('PATCH', `/api/v1/tasks/${taskId}`, {
			status: 'in_progress'
		});
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		const after = await api<TaskDetail>('GET', `/api/v1/tasks/${taskId}`);
		expect(after.body.task.status).toBe('in_progress');
	});

	test('PATCH with an invalid status → 400', async () => {
		const res = await api('PATCH', `/api/v1/tasks/${taskId}`, { status: 'nope' });
		expect(res.status).toBe(400);
	});

	test('POST /api/v1/tasks/:id/comments adds a comment', async () => {
		const res = await api<{ id: string }>('POST', `/api/v1/tasks/${taskId}/comments`, {
			body: `${SMOKE_PREFIX} comment ${run}`
		});
		expect(res.status).toBe(201);
		const after = await api<TaskDetail>('GET', `/api/v1/tasks/${taskId}`);
		expect((after.body.task.comments ?? []).some((c) => c.id === res.body.id)).toBe(true);
	});

	test('POST /api/v1/tasks/:id/time logs time', async () => {
		const res = await api('POST', `/api/v1/tasks/${taskId}/time`, {
			minutes: 15,
			date: new Date().toISOString().slice(0, 10),
			note: 'smoke'
		});
		expect(res.status).toBe(201);
		const after = await api<TaskDetail>('GET', `/api/v1/tasks/${taskId}`);
		expect((after.body.task.timeLogs ?? []).some((l) => l.minutes === 15)).toBe(true);
	});

	test('GET /api/v1/search finds it by its unique title token', async () => {
		const res = await api<{ results: { type: string; id: string; title: string }[] }>(
			'GET',
			`/api/v1/search?q=${encodeURIComponent(run)}&types=task`
		);
		expect(res.status).toBe(200);
		expect(res.body.results.some((r) => r.type === 'task' && r.title === title)).toBe(true);
	});

	test('DELETE /api/v1/tasks/:id soft-deletes; a second GET is 404', async () => {
		const res = await api<{ ok: boolean }>('DELETE', `/api/v1/tasks/${taskId}`);
		expect(res.status).toBe(200);
		created.tasks.delete(taskId);
		const after = await api('GET', `/api/v1/tasks/${taskId}`);
		expect(after.status).toBe(404);
	});

	test('GET of a random uuid → 404', async () => {
		const res = await api('GET', `/api/v1/tasks/${crypto.randomUUID()}`);
		expect(res.status).toBe(404);
	});
});

describe('tickets lifecycle', () => {
	const subject = `${SMOKE_PREFIX} api ticket ${run}`;
	let ticketId: string;

	test('POST /api/v1/tickets creates a ticket', async () => {
		const res = await api<{ id: string; displayId: string }>('POST', '/api/v1/tickets', {
			orgId,
			subject,
			description: 'created by tests/smoke/api.test.ts',
			priority: 'low'
		});
		expect(res.status).toBe(201);
		expect(res.body.id).toBeString();
		expect(res.body.displayId).toMatch(/^[A-Z0-9]+-\d+$/);
		ticketId = res.body.id;
		created.tickets.add(ticketId);
	});

	test('POST /api/v1/tickets rejects an invalid priority', async () => {
		const res = await api('POST', '/api/v1/tickets', { orgId, subject, priority: 'urgent!!' });
		expect(res.status).toBe(400);
	});

	test('GET /api/v1/tickets/:id returns the detail', async () => {
		const res = await api<TicketDetail>('GET', `/api/v1/tickets/${ticketId}`);
		expect(res.status).toBe(200);
		expect(res.body.ticket.subject).toBe(subject);
		expect(res.body.ticket.status).toBe('open');
		expect(res.body.ticket.priority).toBe('low');
		expect(Array.isArray(res.body.messages)).toBe(true);
		expect(res.body.canEdit).toBe(true);
	});

	test('GET /api/v1/tickets?segment=all includes it', async () => {
		const res = await api<{ tickets: { id: string }[] }>('GET', '/api/v1/tickets?segment=all');
		expect(res.status).toBe(200);
		expect(res.body.tickets.some((t) => t.id === ticketId)).toBe(true);
	});

	test('GET /api/v1/tickets?segment=bogus → 400', async () => {
		const res = await api('GET', '/api/v1/tickets?segment=bogus');
		expect(res.status).toBe(400);
	});

	test('PATCH /api/v1/tickets/:id changes status + priority', async () => {
		const res = await api<{ ok: boolean }>('PATCH', `/api/v1/tickets/${ticketId}`, {
			status: 'in_progress',
			priority: 'high'
		});
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		const after = await api<TicketDetail>('GET', `/api/v1/tickets/${ticketId}`);
		expect(after.body.ticket.status).toBe('in_progress');
		expect(after.body.ticket.priority).toBe('high');
	});

	test('DELETE /api/v1/tickets/:id soft-deletes; a second GET is 404', async () => {
		const res = await api<{ ok: boolean }>('DELETE', `/api/v1/tickets/${ticketId}`);
		expect(res.status).toBe(200);
		created.tickets.delete(ticketId);
		const after = await api('GET', `/api/v1/tickets/${ticketId}`);
		expect(after.status).toBe(404);
	});
});

describe('notes', () => {
	test('GET /api/v1/notes/list returns the three note buckets', async () => {
		const res = await api<{ quick: unknown[]; meetings: unknown[]; shared: unknown[] }>(
			'GET',
			'/api/v1/notes/list'
		);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body.quick)).toBe(true);
		expect(Array.isArray(res.body.meetings)).toBe(true);
		expect(Array.isArray(res.body.shared)).toBe(true);
	});

	test('POST /api/v1/notes rejects a missing title', async () => {
		const res = await api('POST', '/api/v1/notes', { body: 'no title' });
		expect(res.status).toBe(400);
	});
});

describe('search', () => {
	test('GET /api/v1/search?q= with a nonsense types param returns nothing', async () => {
		const res = await api<{ results: unknown[] }>('GET', '/api/v1/search?q=in&types=bogus');
		expect(res.status).toBe(200);
		expect(res.body.results).toEqual([]);
	});

	test('GET /api/v1/search?q=in returns grouped, typed results', async () => {
		const res = await api<{ results: { type: string }[] }>('GET', '/api/v1/search?q=in');
		expect(res.status).toBe(200);
		expect(res.body.results.length).toBeGreaterThan(0);
		for (const r of res.body.results) {
			expect(['ticket', 'task', 'project', 'wiki', 'note']).toContain(r.type);
		}
	});
});
