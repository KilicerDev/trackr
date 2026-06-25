import { and, eq, sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import * as schema from '../../../src/lib/server/db/schema';
import type { ProjectId, WikiPage } from '../../../src/lib/types';
import { ok, info, type Db } from './client';
import { USERS, PROJECTS, TASKS, WIKI_PAGES } from './fixtures';

type IdMap = Map<string, string>;

// ── Users ──────────────────────────────────────────────────────────────────
// Seed the six active demo users as credential accounts (idempotent by email).
async function seedUsers(db: Db, password: string): Promise<IdMap> {
	const userIdMap: IdMap = new Map();
	const passwordHash = await hashPassword(password);

	for (const u of USERS.slice(0, 6)) {
		const [existing] = await db
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(eq(schema.user.email, u.email))
			.limit(1);

		if (existing) {
			userIdMap.set(u.id, existing.id);
			await db
				.update(schema.user)
				.set({ name: u.name, updatedAt: new Date() })
				.where(eq(schema.user.id, existing.id));
			info(`user ${u.email} (existed)`);
			continue;
		}

		const id = crypto.randomUUID();
		await db.transaction(async (tx) => {
			await tx.insert(schema.user).values({
				id,
				email: u.email,
				name: u.name,
				role: u.role === 'owner' ? 'admin' : 'user',
				emailVerified: true
			});
			await tx.insert(schema.account).values({
				id: crypto.randomUUID(),
				userId: id,
				accountId: id,
				providerId: 'credential',
				password: passwordHash
			});
		});
		userIdMap.set(u.id, id);
		ok(`user ${u.email}`);
	}
	return userIdMap;
}

// ── Projects ─────────────────────────────────────────────────────────────────
async function seedProjects(db: Db, userIdMap: IdMap): Promise<Map<ProjectId, string>> {
	const projectIdMap = new Map<ProjectId, string>();

	for (const key of Object.keys(PROJECTS) as ProjectId[]) {
		const p = PROJECTS[key];
		const leadDb = userIdMap.get(p.lead) ?? null;

		const [existing] = await db
			.select({ id: schema.project.id })
			.from(schema.project)
			.where(eq(schema.project.key, key))
			.limit(1);

		let projectId: string;
		if (existing) {
			projectId = existing.id;
			await db
				.update(schema.project)
				.set({
					name: p.name,
					description: p.description,
					color: p.color,
					icon: p.icon,
					status: p.status,
					leadId: leadDb,
					updatedAt: new Date()
				})
				.where(eq(schema.project.id, projectId));
			info(`project ${key} (existed)`);
		} else {
			projectId = crypto.randomUUID();
			await db.insert(schema.project).values({
				id: projectId,
				key,
				name: p.name,
				description: p.description,
				color: p.color,
				icon: p.icon,
				status: p.status,
				leadId: leadDb,
				createdBy: leadDb
			});
			ok(`project ${key}`);
		}
		projectIdMap.set(key, projectId);

		// Reconcile members.
		const wantedMemberIds = new Set(
			p.members.map((mid) => userIdMap.get(mid)).filter((x): x is string => !!x)
		);
		const currentMembers = await db
			.select({ userId: schema.projectMember.userId })
			.from(schema.projectMember)
			.where(eq(schema.projectMember.projectId, projectId));
		const current = new Set(currentMembers.map((m) => m.userId));
		const toAdd = [...wantedMemberIds].filter((id) => !current.has(id));
		if (toAdd.length) {
			await db.insert(schema.projectMember).values(
				toAdd.map((userId) => ({
					projectId,
					userId,
					role: userId === leadDb ? 'owner' : 'member'
				}))
			);
		}
	}
	return projectIdMap;
}

// ── Tasks ────────────────────────────────────────────────────────────────────
async function seedTasks(db: Db, userIdMap: IdMap, projectIdMap: Map<ProjectId, string>) {
	const maxNumberByProject = new Map<string, number>();

	for (const t of TASKS) {
		const projectId = projectIdMap.get(t.project as ProjectId);
		if (!projectId) {
			info(`skip task ${t.id} (no project)`);
			continue;
		}

		// Parse "SIWEB-15" → number=15.
		const dash = t.id.lastIndexOf('-');
		const number = Number(t.id.slice(dash + 1));
		if (!Number.isFinite(number)) {
			info(`skip task ${t.id} (bad number)`);
			continue;
		}

		const creator = t.createdBy ? (userIdMap.get(t.createdBy) ?? null) : null;
		const dueDate = t.due ? new Date(t.due) : null;
		const startDate = t.startDate ? new Date(t.startDate) : null;
		const endDate = t.endDate ? new Date(t.endDate) : null;

		const taskValues = {
			projectId,
			number,
			title: t.title,
			description: t.description ?? null,
			status: t.status,
			priority: t.priority,
			type: t.type ?? 'task',
			dueDate,
			startDate,
			endDate,
			estimateMinutes: t.estimate ?? null,
			tags: t.labels ?? [],
			createdBy: creator
		} as const;

		const [existing] = await db
			.select({ id: schema.task.id })
			.from(schema.task)
			.where(and(eq(schema.task.projectId, projectId), eq(schema.task.number, number)))
			.limit(1);

		let taskId: string;
		if (existing) {
			taskId = existing.id;
			await db
				.update(schema.task)
				.set({ ...taskValues, updatedAt: new Date() })
				.where(eq(schema.task.id, taskId));
		} else {
			taskId = crypto.randomUUID();
			await db.insert(schema.task).values({ id: taskId, ...taskValues });
		}

		// Reconcile assignees.
		const wantedAssignees = new Set<string>(
			(t.assignees ?? [t.assignee]).map((aid) => userIdMap.get(aid)).filter((x): x is string => !!x)
		);
		await db.delete(schema.taskAssignee).where(eq(schema.taskAssignee.taskId, taskId));
		if (wantedAssignees.size > 0) {
			await db
				.insert(schema.taskAssignee)
				.values([...wantedAssignees].map((userId) => ({ taskId, userId })));
		}

		const prev = maxNumberByProject.get(projectId) ?? 0;
		if (number > prev) maxNumberByProject.set(projectId, number);
	}
	ok(`tasks: ${TASKS.length} reconciled`);

	// Bump per-project counter past the highest seeded number so the next real
	// create starts cleanly.
	for (const [projectId, max] of maxNumberByProject) {
		await db
			.update(schema.project)
			.set({ nextTaskNumber: sql`GREATEST(${schema.project.nextTaskNumber}, ${max + 1})` })
			.where(eq(schema.project.id, projectId));
	}
}

// ── Wiki ─────────────────────────────────────────────────────────────────────
const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Render the fixture block body to the HTML stored on `wiki_page.body`. The app
// builds the collaborative ydoc lazily from this on first open (see
// ensureDocumentForPage), so seeding the HTML is enough.
function bodyToHtml(body: WikiPage['body']): string {
	return body
		.map((block) => {
			switch (block.kind) {
				case 'h1':
					return `<h1>${escapeHtml(block.text)}</h1>`;
				case 'h2':
					return `<h2>${escapeHtml(block.text)}</h2>`;
				case 'p':
					return `<p>${escapeHtml(block.text)}</p>`;
				case 'list':
					return `<ul>${block.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
				case 'callout':
					return `<blockquote>${escapeHtml(block.text)}</blockquote>`;
			}
		})
		.join('\n');
}

async function seedWiki(db: Db, userIdMap: IdMap) {
	// Fixture order lists folders/parents before their children, so parentId
	// references resolve. The fixture page id doubles as the (text) primary key.
	for (let i = 0; i < WIKI_PAGES.length; i++) {
		const p = WIKI_PAGES[i];
		const isFolder = p.icon === 'folder';
		const values = {
			id: p.id,
			parentId: p.parent,
			title: p.title,
			icon: p.icon,
			isFolder,
			body: isFolder ? '' : bodyToHtml(p.body),
			authorId: userIdMap.get(p.author) ?? null,
			sortOrder: i
		};
		await db
			.insert(schema.wikiPage)
			.values(values)
			.onConflictDoUpdate({
				target: schema.wikiPage.id,
				set: {
					parentId: values.parentId,
					title: values.title,
					icon: values.icon,
					isFolder: values.isFolder,
					body: values.body,
					authorId: values.authorId,
					sortOrder: values.sortOrder,
					updatedAt: new Date()
				}
			});
	}
	ok(`wiki: ${WIKI_PAGES.length} pages reconciled`);
}

/**
 * Seed the full demo dataset in dependency order: users → projects → tasks →
 * wiki. Idempotent; safe to re-run. Reads DEMO_PASSWORD (default 'demo12345').
 */
export async function seedDemo(db: Db): Promise<void> {
	const password = process.env.DEMO_PASSWORD ?? 'demo12345';
	if (password.length < 8) {
		throw new Error('DEMO_PASSWORD must be at least 8 characters.');
	}
	const userIdMap = await seedUsers(db, password);
	const projectIdMap = await seedProjects(db, userIdMap);
	await seedTasks(db, userIdMap, projectIdMap);
	await seedWiki(db, userIdMap);
	ok('demo seed complete');
}
