#!/usr/bin/env bun
/**
 * Seed (or refresh) demo data so dev sees a populated app:
 *   - 6 demo users (idempotent, matched by email).
 *   - 4 orgs+projects matching the original mock fixtures (SIWEB, TRACKR, MAJA, WEBIM).
 *   - 23 mock tasks with status/priority/assignee.
 *
 * Re-runs are idempotent: existing users/projects are updated in place,
 * existing tasks (matched on `(project_id, number)`) are upserted.
 *
 * Usage:
 *   bun seed:demo
 *   DEMO_PASSWORD=changeme123 bun seed:demo  # overrides default
 */

import '../load-root-env';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import * as schema from '../../src/lib/server/db/schema';
import { resolveDatabaseUrl } from '../../src/lib/server/db/resolve-url';
import { TRACKR_TASKS, TRACKR_PROJECTS, TRACKR_USERS } from '../../src/lib/data';
import type { ProjectId } from '../../src/lib/types';

const DEFAULT_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo12345';
if (DEFAULT_PASSWORD.length < 8) {
	console.error('DEMO_PASSWORD must be at least 8 characters.');
	process.exit(1);
}

const client = postgres(resolveDatabaseUrl(process.env), { max: 1 });
const db = drizzle(client, { schema });

function ok(msg: string) {
	console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}
function info(msg: string) {
	console.log(`\x1b[2m·\x1b[0m ${msg}`);
}

// Map mock user id (u1…u6) → real db user id.
const userIdMap = new Map<string, string>();
// Mock project key (SIWEB, …) → db project id.
const projectIdMap = new Map<ProjectId, string>();

try {
	// ── Users ────────────────────────────────────────────────────────────
	const passwordHash = await hashPassword(DEFAULT_PASSWORD);
	for (const u of TRACKR_USERS.slice(0, 6)) {
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

	// ── Projects ─────────────────────────────────────────────────────────
	for (const key of Object.keys(TRACKR_PROJECTS) as ProjectId[]) {
		const p = TRACKR_PROJECTS[key];
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

	// ── Tasks ────────────────────────────────────────────────────────────
	let maxNumberByProject = new Map<string, number>();
	for (const t of TRACKR_TASKS) {
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
	ok(`tasks: ${TRACKR_TASKS.length} reconciled`);

	// Bump per-project counter past the highest seeded number so the next
	// real create starts cleanly.
	for (const [projectId, max] of maxNumberByProject) {
		await db
			.update(schema.project)
			.set({ nextTaskNumber: sql`GREATEST(${schema.project.nextTaskNumber}, ${max + 1})` })
			.where(eq(schema.project.id, projectId));
	}

	ok('demo seed complete');
} catch (err) {
	console.error('\x1b[31m✗\x1b[0m seed failed:', err);
	process.exitCode = 1;
} finally {
	await client.end();
}
