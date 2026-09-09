// Demo dataset seeder — see fixtures.ts for the content, util.ts for the
// deterministic-id / relative-date helpers. Every write is idempotent: rows are
// keyed by stable ids (or natural keys) and re-runs update in place.
//
// Order: orgs → users (+org membership) → projects (+members, favorites,
// prefs) → tasks → tickets → task/ticket extras (threads, messages, activity,
// attachments) → tags + chat → notes → wiki → notifications.

import { and, eq, isNull, sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';
import * as schema from '../../../src/lib/server/db/schema';
import type { AttachmentEntityType } from '../../../src/lib/config/attachments';
import { ok, info, warn, type Db } from './client';
import { openStorage } from './storage';
import { buildDemoFiles, type DemoFile } from './images';
import { demoId, esc, ymd } from './util';
import {
	USERS,
	ORGS,
	PROJECTS,
	FAVORITES,
	TASKS,
	TICKETS,
	TAGS,
	THREADS,
	NOTES,
	WIKI_PAGES,
	PROJECT_COMMENTS,
	MAX_USER,
	WEEK_LABEL,
	type UserKey,
	type OrgKey,
	type ProjectKey,
	type DemoTask,
	type DemoTicket,
	type WikiBlock
} from './fixtures';

const INTERNAL_ORG_ID = 'org_trackr_internal';

type Ctx = {
	db: Db;
	users: Map<UserKey, string>;
	orgs: Map<OrgKey, string>;
	projects: Map<ProjectKey, { id: string; orgId: string | null }>;
	tasks: Map<string, string>; // "SIWEB-52" → id
	tickets: Map<string, string>; // "SIWEB-7" → id
	files: Map<string, DemoFile>;
	storage: ReturnType<typeof openStorage>;
};

const u = (ctx: Ctx, k: UserKey) => {
	const id = ctx.users.get(k);
	if (!id) throw new Error(`fixture user ${k} not seeded`);
	return id;
};

/** Swap fixture mention/entity tokens for real ids. */
function resolveRefs(ctx: Ctx, text: string): string {
	return text
		.replace(/\]\((u\d|c\d)\)/g, (_, k: UserKey) => `](${ctx.users.get(k) ?? k})`)
		.replace(/\(task:([A-Z]+-\d+)\)/g, (_, key: string) => `(task:${ctx.tasks.get(key) ?? key})`)
		.replace(
			/\(ticket:([A-Z]+-\d+)\)/g,
			(_, key: string) => `(ticket:${ctx.tickets.get(key) ?? key})`
		);
}

const projectOf = (key: string) => key.slice(0, key.lastIndexOf('-')) as ProjectKey;
const numberOf = (key: string) => Number(key.slice(key.lastIndexOf('-') + 1));

// ── Organizations ──────────────────────────────────────────────────────────
async function seedOrgs(ctx: Ctx) {
	for (const o of ORGS) {
		const [existing] = await ctx.db
			.select({ id: schema.organization.id })
			.from(schema.organization)
			.where(eq(schema.organization.key, o.key))
			.limit(1);
		const values = {
			slug: o.slug,
			key: o.key,
			name: o.name,
			description: o.description,
			color: o.color
		};
		if (existing) {
			await ctx.db
				.update(schema.organization)
				.set(values)
				.where(eq(schema.organization.id, existing.id));
			ctx.orgs.set(o.key, existing.id);
			info(`org ${o.key} (existed)`);
		} else {
			const id = demoId(`org:${o.key}`);
			await ctx.db.insert(schema.organization).values({ id, ...values });
			ctx.orgs.set(o.key, id);
			ok(`org ${o.key} — ${o.name}`);
		}
	}
}

// ── Users ──────────────────────────────────────────────────────────────────
async function seedUsers(ctx: Ctx, password: string) {
	const passwordHash = await hashPassword(password);
	for (const usr of USERS) {
		const [existing] = await ctx.db
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(eq(schema.user.email, usr.email))
			.limit(1);
		let id: string;
		if (existing) {
			id = existing.id;
			await ctx.db
				.update(schema.user)
				.set({ name: usr.name, role: usr.appRole, emailVerified: true, updatedAt: new Date() })
				.where(eq(schema.user.id, id));
			// Demo accounts always match the documented password.
			await ctx.db
				.update(schema.account)
				.set({ password: passwordHash, updatedAt: new Date() })
				.where(and(eq(schema.account.userId, id), eq(schema.account.providerId, 'credential')));
			info(`user ${usr.email} (existed)`);
		} else {
			id = demoId(`user:${usr.id}`);
			await ctx.db.transaction(async (tx) => {
				await tx
					.insert(schema.user)
					.values({ id, email: usr.email, name: usr.name, role: usr.appRole, emailVerified: true });
				await tx.insert(schema.account).values({
					id: demoId(`account:${usr.id}`),
					userId: id,
					accountId: id,
					providerId: 'credential',
					password: passwordHash
				});
			});
			ok(`user ${usr.email}`);
		}
		ctx.users.set(usr.id, id);

		// Org membership (internal team or client org).
		const orgId = usr.org === 'internal' ? INTERNAL_ORG_ID : ctx.orgs.get(usr.org)!;
		const [m] = await ctx.db
			.select({ role: schema.organizationMember.role })
			.from(schema.organizationMember)
			.where(
				and(eq(schema.organizationMember.orgId, orgId), eq(schema.organizationMember.userId, id))
			)
			.limit(1);
		if (!m) {
			await ctx.db
				.insert(schema.organizationMember)
				.values({ orgId, userId: id, role: usr.orgRole });
		} else if (
			m.role !== usr.orgRole &&
			(m.role !== 'org.superadmin' || usr.orgRole === 'org.superadmin')
		) {
			await ctx.db
				.update(schema.organizationMember)
				.set({ role: usr.orgRole })
				.where(
					and(eq(schema.organizationMember.orgId, orgId), eq(schema.organizationMember.userId, id))
				);
		}
	}
}

// ── Projects ───────────────────────────────────────────────────────────────
async function seedProjects(ctx: Ctx) {
	for (const p of PROJECTS) {
		const leadId = u(ctx, p.lead);
		const orgId = p.org ? ctx.orgs.get(p.org)! : null;
		const [existing] = await ctx.db
			.select({ id: schema.project.id })
			.from(schema.project)
			.where(eq(schema.project.key, p.key))
			.limit(1);
		const values = {
			name: p.name,
			description: p.description,
			color: p.color,
			icon: p.icon,
			status: p.status,
			orgId,
			leadId
		};
		let projectId: string;
		if (existing) {
			projectId = existing.id;
			await ctx.db
				.update(schema.project)
				.set({ ...values, updatedAt: new Date() })
				.where(eq(schema.project.id, projectId));
			info(`project ${p.key} (existed)`);
		} else {
			projectId = demoId(`project:${p.key}`);
			await ctx.db.insert(schema.project).values({
				id: projectId,
				key: p.key,
				...values,
				createdBy: leadId,
				createdAt: p.createdAt
			});
			ok(`project ${p.key} — ${p.name}`);
		}
		ctx.projects.set(p.key, { id: projectId, orgId });

		// Members: lead is manager, everyone else member. Legacy 'owner'/'member'
		// role strings from older seeds get normalised here too.
		const current = await ctx.db
			.select({ userId: schema.projectMember.userId, role: schema.projectMember.role })
			.from(schema.projectMember)
			.where(eq(schema.projectMember.projectId, projectId));
		const byUser = new Map(current.map((m) => [m.userId, m.role]));
		for (const mk of new Set([...p.members, p.lead])) {
			const userId = u(ctx, mk);
			const role = userId === leadId ? 'project.manager' : 'project.member';
			const have = byUser.get(userId);
			if (have === undefined) {
				await ctx.db.insert(schema.projectMember).values({ projectId, userId, role });
			} else if (have !== role) {
				await ctx.db
					.update(schema.projectMember)
					.set({ role })
					.where(
						and(
							eq(schema.projectMember.projectId, projectId),
							eq(schema.projectMember.userId, userId)
						)
					);
			}
		}
	}

	// Favorites + preferences.
	for (const [uk, keys] of Object.entries(FAVORITES) as [UserKey, ProjectKey[]][]) {
		for (const pk of keys) {
			await ctx.db
				.insert(schema.projectFavorite)
				.values({ userId: u(ctx, uk), projectId: ctx.projects.get(pk)!.id })
				.onConflictDoNothing();
		}
	}
	await ctx.db
		.insert(schema.userPreferences)
		.values({
			userId: u(ctx, MAX_USER),
			theme: 'dark',
			defaultLanding: '/week',
			locale: 'en',
			weekStartsOn: 1
		})
		.onConflictDoNothing();
	ok('projects: members, favorites, preferences reconciled');
}

// ── Attachments ────────────────────────────────────────────────────────────
async function attach(
	ctx: Ctx,
	opts: {
		entityType: AttachmentEntityType;
		entityId: string;
		filename: string;
		orgId: string | null;
		projectId: string | null;
		uploadedBy: string | null;
		createdAt: Date;
	}
): Promise<string | null> {
	const file = ctx.files.get(opts.filename);
	if (!file) {
		warn(`no demo file named ${opts.filename}`);
		return null;
	}
	const id = demoId(`att:${opts.entityType}:${opts.entityId}:${opts.filename}`);
	const storageKey = `attachments/${id}`;

	const [existing] = await ctx.db
		.select({ id: schema.attachment.id, hasThumbnail: schema.attachment.hasThumbnail })
		.from(schema.attachment)
		.where(eq(schema.attachment.id, id))
		.limit(1);

	// Bytes: (re)write if missing so a wiped data/ dir heals on re-seed.
	if (!(await ctx.storage.exists(`${storageKey}/original`))) {
		await ctx.storage.put(`${storageKey}/original`, file.bytes);
	}
	let width: number | null = null;
	let height: number | null = null;
	let hasThumbnail = false;
	let thumbhash: Uint8Array | null = null;
	const isImage = file.mimeType.startsWith('image/');
	if (isImage) {
		const meta = await sharp(file.bytes).metadata();
		width = meta.width ?? null;
		height = meta.height ?? null;
		if (!(await ctx.storage.exists(`${storageKey}/thumb`))) {
			const thumb = await sharp(file.bytes)
				.rotate()
				.resize({ width: 480, withoutEnlargement: true })
				.webp({ quality: 80 })
				.toBuffer();
			await ctx.storage.put(`${storageKey}/thumb`, thumb);
		}
		hasThumbnail = true;
		const { data, info: raw } = await sharp(file.bytes)
			.rotate()
			.resize(100, 100, { fit: 'inside', withoutEnlargement: true })
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		thumbhash = rgbaToThumbHash(raw.width, raw.height, data);
	}

	if (existing) {
		await ctx.db
			.update(schema.attachment)
			.set({ deletedAt: null, hasThumbnail })
			.where(eq(schema.attachment.id, id));
		return id;
	}
	await ctx.db.insert(schema.attachment).values({
		id,
		entityType: opts.entityType,
		entityId: opts.entityId,
		orgId: opts.orgId,
		projectId: opts.projectId,
		uploadedBy: opts.uploadedBy,
		storageKey,
		filename: file.filename,
		mimeType: file.mimeType,
		sizeBytes: file.bytes.length,
		width,
		height,
		hasThumbnail,
		thumbhash,
		createdAt: opts.createdAt
	});
	return id;
}

// ── Threads / messages (shared by tasks, tickets, chat) ────────────────────
async function ensureThread(
	ctx: Ctx,
	subjectType: 'task' | 'ticket',
	subjectId: string,
	fallbackId: string
): Promise<string> {
	const [th] = await ctx.db
		.select({ id: schema.thread.id })
		.from(schema.thread)
		.where(and(eq(schema.thread.subjectType, subjectType), eq(schema.thread.subjectId, subjectId)))
		.limit(1);
	if (th) return th.id;
	await ctx.db.insert(schema.thread).values({ id: fallbackId, subjectType, subjectId });
	return fallbackId;
}

async function upsertMessage(
	ctx: Ctx,
	m: {
		id: string;
		threadId: string;
		authorId: string | null;
		body: string;
		at: Date;
		kind?: 'comment' | 'system';
		internal?: boolean;
		meta?: Record<string, unknown> | null;
	}
) {
	await ctx.db
		.insert(schema.message)
		.values({
			id: m.id,
			threadId: m.threadId,
			authorId: m.authorId,
			body: m.body,
			kind: m.kind ?? 'comment',
			internal: m.internal ?? false,
			meta: m.meta ?? null,
			createdAt: m.at,
			updatedAt: m.at
		})
		.onConflictDoUpdate({
			target: schema.message.id,
			set: {
				body: m.body,
				internal: m.internal ?? false,
				meta: m.meta ?? null,
				createdAt: m.at,
				deletedAt: null
			}
		});
}

// ── Tasks ──────────────────────────────────────────────────────────────────
function latestTouch(t: DemoTask): Date {
	let latest = t.createdAt;
	for (const c of t.comments ?? []) if (c.at > latest) latest = c.at;
	for (const l of t.timeLogs ?? []) if (l.at > latest) latest = l.at;
	return latest;
}

async function seedTaskRows(ctx: Ctx) {
	const maxNumber = new Map<string, number>();
	for (const t of TASKS) {
		const pk = projectOf(t.key);
		const project = ctx.projects.get(pk);
		if (!project) {
			warn(`skip ${t.key}: unknown project`);
			continue;
		}
		const number = numberOf(t.key);
		const values = {
			projectId: project.id,
			number,
			title: t.title,
			description: t.description ? resolveRefs(ctx, t.description) : null,
			status: t.status,
			priority: t.priority,
			type: t.type,
			dueDate: t.due ?? null,
			startDate: t.start ?? null,
			endDate: t.end ?? null,
			estimateMinutes: t.estimate ?? null,
			tags: t.tags ?? [],
			checklist: (t.checklist ?? []).map((c, i) => ({
				id: demoId(`cl:${t.key}:${i}`),
				text: c.text,
				done: c.done
			})),
			createdBy: u(ctx, t.createdBy),
			createdAt: t.createdAt,
			updatedAt: latestTouch(t),
			archivedAt: null,
			deletedAt: null
		};
		const [existing] = await ctx.db
			.select({ id: schema.task.id })
			.from(schema.task)
			.where(and(eq(schema.task.projectId, project.id), eq(schema.task.number, number)))
			.limit(1);
		let id: string;
		if (existing) {
			id = existing.id;
			await ctx.db.update(schema.task).set(values).where(eq(schema.task.id, id));
		} else {
			id = demoId(`task:${t.key}`);
			await ctx.db.insert(schema.task).values({ id, ...values });
		}
		ctx.tasks.set(t.key, id);

		await ctx.db.delete(schema.taskAssignee).where(eq(schema.taskAssignee.taskId, id));
		await ctx.db
			.insert(schema.taskAssignee)
			.values(t.assignees.map((a) => ({ taskId: id, userId: u(ctx, a), addedAt: t.createdAt })));

		maxNumber.set(project.id, Math.max(maxNumber.get(project.id) ?? 0, number));
	}
	// Descriptions may reference tasks/tickets seeded later — second pass below.
	for (const [projectId, max] of maxNumber) {
		await ctx.db
			.update(schema.project)
			.set({ nextTaskNumber: sql`GREATEST(${schema.project.nextTaskNumber}, ${max + 1})` })
			.where(eq(schema.project.id, projectId));
	}
	ok(`tasks: ${ctx.tasks.size} rows reconciled`);
}

async function seedTaskExtras(ctx: Ctx) {
	let comments = 0,
		logs = 0,
		plans = 0,
		files = 0;
	for (const t of TASKS) {
		const id = ctx.tasks.get(t.key);
		if (!id) continue;
		const project = ctx.projects.get(projectOf(t.key))!;
		const creator = u(ctx, t.createdBy);
		const taskMeta = { taskRef: t.key, taskTitle: t.title };

		// Second pass: parent, ticket link, resolved description refs.
		await ctx.db
			.update(schema.task)
			.set({
				parentId: t.parent ? (ctx.tasks.get(t.parent) ?? null) : null,
				sourceTicketId: t.fromTicket ? (ctx.tickets.get(t.fromTicket) ?? null) : null,
				description: t.description ? resolveRefs(ctx, t.description) : null,
				updatedAt: latestTouch(t)
			})
			.where(eq(schema.task.id, id));

		// Activity: created → assigned → status trail.
		const acts: {
			id: string;
			type: schema.ProjectActivityType;
			actor: string;
			at: Date;
			meta: Record<string, unknown>;
			body?: string;
		}[] = [];
		acts.push({
			id: demoId(`act:${t.key}:created`),
			type: 'task.created',
			actor: creator,
			at: t.createdAt,
			meta: taskMeta
		});
		const others = t.assignees.filter((a) => a !== t.createdBy).map((a) => u(ctx, a));
		if (others.length) {
			acts.push({
				id: demoId(`act:${t.key}:assigned`),
				type: 'task.assignee',
				actor: creator,
				at: new Date(t.createdAt.getTime() + 60_000),
				meta: { ...taskMeta, added: others, removed: [] }
			});
		}
		if (t.status !== 'todo' && t.status !== 'backlog') {
			const now = Date.now();
			const mid = new Date(t.createdAt.getTime() + (now - t.createdAt.getTime()) * 0.4);
			const actor = u(ctx, t.assignees[0] ?? t.createdBy);
			if (t.status === 'done' || t.status === 'in_review') {
				acts.push({
					id: demoId(`act:${t.key}:s1`),
					type: 'task.status',
					actor,
					at: mid,
					meta: { ...taskMeta, from: 'todo', to: 'in_progress' }
				});
				const later = new Date(t.createdAt.getTime() + (now - t.createdAt.getTime()) * 0.8);
				acts.push({
					id: demoId(`act:${t.key}:s2`),
					type: 'task.status',
					actor,
					at: later,
					meta: { ...taskMeta, from: 'in_progress', to: t.status }
				});
			} else {
				acts.push({
					id: demoId(`act:${t.key}:s1`),
					type: 'task.status',
					actor,
					at: mid,
					meta: { ...taskMeta, from: 'todo', to: t.status }
				});
			}
		}
		if (t.priority === 'urgent') {
			acts.push({
				id: demoId(`act:${t.key}:prio`),
				type: 'task.priority',
				actor: creator,
				at: new Date(t.createdAt.getTime() + 120_000),
				meta: { ...taskMeta, from: 'high', to: 'urgent' }
			});
		}

		// Time logs (+ their activity rows).
		for (const [i, l] of (t.timeLogs ?? []).entries()) {
			await ctx.db
				.insert(schema.taskTimeLog)
				.values({
					id: demoId(`tl:${t.key}:${i}`),
					taskId: id,
					userId: u(ctx, l.user),
					minutes: l.minutes,
					note: l.note ?? null,
					loggedAt: ymd(l.at),
					createdAt: l.at
				})
				.onConflictDoNothing();
			acts.push({
				id: demoId(`act:tl:${t.key}:${i}`),
				type: 'time.logged',
				actor: u(ctx, l.user),
				at: l.at,
				meta: { ...taskMeta, minutes: l.minutes, note: l.note ?? null, loggedAt: ymd(l.at) }
			});
			logs++;
		}

		for (const a of acts) {
			await ctx.db
				.insert(schema.projectActivity)
				.values({
					id: a.id,
					projectId: project.id,
					taskId: id,
					actorId: a.actor,
					type: a.type,
					body: a.body ?? null,
					meta: a.meta,
					createdAt: a.at,
					updatedAt: a.at
				})
				.onConflictDoNothing();
		}

		// Comments live in the task's thread.
		if (t.comments?.length) {
			const threadId = await ensureThread(ctx, 'task', id, demoId(`thread:task:${t.key}`));
			for (const [i, c] of t.comments.entries()) {
				const mid = demoId(`msg:task:${t.key}:${i}`);
				await upsertMessage(ctx, {
					id: mid,
					threadId,
					authorId: u(ctx, c.user),
					body: resolveRefs(ctx, c.text),
					at: c.at
				});
				for (const f of c.files ?? []) {
					if (
						await attach(ctx, {
							entityType: 'message',
							entityId: mid,
							filename: f,
							orgId: project.orgId,
							projectId: project.id,
							uploadedBy: u(ctx, c.user),
							createdAt: c.at
						})
					)
						files++;
				}
				comments++;
			}
		}

		// Task-level attachments.
		for (const f of t.files ?? []) {
			if (
				await attach(ctx, {
					entityType: 'task',
					entityId: id,
					filename: f,
					orgId: project.orgId,
					projectId: project.id,
					uploadedBy: creator,
					createdAt: new Date(t.createdAt.getTime() + 30_000)
				})
			)
				files++;
		}

		// My-week planning.
		for (const p of t.plans ?? []) {
			await ctx.db
				.insert(schema.taskPlanning)
				.values({ taskId: id, userId: u(ctx, p.user), plannedFor: ymd(p.day) })
				.onConflictDoUpdate({
					target: [schema.taskPlanning.taskId, schema.taskPlanning.userId],
					set: { plannedFor: ymd(p.day), updatedAt: new Date() }
				});
			plans++;
		}
	}

	for (const [i, c] of PROJECT_COMMENTS.entries()) {
		const project = ctx.projects.get(c.project)!;
		await ctx.db
			.insert(schema.projectActivity)
			.values({
				id: demoId(`pc:${c.project}:${i}`),
				projectId: project.id,
				taskId: null,
				actorId: u(ctx, c.user),
				type: 'comment',
				body: resolveRefs(ctx, c.text),
				meta: null,
				createdAt: c.at,
				updatedAt: c.at
			})
			.onConflictDoUpdate({
				target: schema.projectActivity.id,
				set: { body: resolveRefs(ctx, c.text) }
			});
	}
	ok(
		`tasks: ${comments} comments, ${logs} time logs, ${plans} week plans, ${files} attachments (week ${WEEK_LABEL})`
	);
}

// ── Tickets ────────────────────────────────────────────────────────────────
function ticketTouch(t: DemoTicket): Date {
	let latest = t.createdAt;
	for (const m of t.messages) if (m.at > latest) latest = m.at;
	return latest;
}

async function seedTicketRows(ctx: Ctx) {
	const maxNumber = new Map<string, number>();
	for (const t of TICKETS) {
		const orgKey = projectOf(t.key) as OrgKey;
		const orgId = ctx.orgs.get(orgKey);
		if (!orgId) {
			warn(`skip ticket ${t.key}: unknown org`);
			continue;
		}
		const number = numberOf(t.key);
		const firstAgentReply = t.messages.find(
			(m) => !m.internal && USERS.find((x) => x.id === m.user)?.org === 'internal'
		);
		const resolvedEvt = (t.events ?? []).find(
			(e) => e.meta.event === 'status_changed' && e.meta.to === 'resolved'
		);
		const closedEvt = (t.events ?? []).find(
			(e) => e.meta.event === 'status_changed' && e.meta.to === 'closed'
		);
		const values = {
			orgId,
			number,
			subject: t.subject,
			description: t.description,
			status: t.status,
			priority: t.priority,
			category: t.category,
			channel: t.channel,
			customerId: u(ctx, t.customer),
			createdBy: u(ctx, t.customer),
			firstResponseAt: firstAgentReply?.at ?? null,
			resolvedAt:
				t.status === 'resolved' || t.status === 'closed'
					? (resolvedEvt?.at ?? ticketTouch(t))
					: null,
			closedAt: t.status === 'closed' ? (closedEvt?.at ?? ticketTouch(t)) : null,
			satisfactionScore: t.satisfaction ?? null,
			tags: t.tags ?? [],
			checklist: (t.checklist ?? []).map((c, i) => ({
				id: demoId(`tcl:${t.key}:${i}`),
				text: c.text,
				done: c.done
			})),
			deletedAt: null,
			createdAt: t.createdAt,
			updatedAt: ticketTouch(t)
		};
		const [existing] = await ctx.db
			.select({ id: schema.ticket.id })
			.from(schema.ticket)
			.where(and(eq(schema.ticket.orgId, orgId), eq(schema.ticket.number, number)))
			.limit(1);
		let id: string;
		if (existing) {
			id = existing.id;
			await ctx.db.update(schema.ticket).set(values).where(eq(schema.ticket.id, id));
		} else {
			id = demoId(`ticket:${t.key}`);
			await ctx.db.insert(schema.ticket).values({ id, ...values });
		}
		ctx.tickets.set(t.key, id);

		await ctx.db.delete(schema.ticketAssignee).where(eq(schema.ticketAssignee.ticketId, id));
		if (t.assignees.length) {
			await ctx.db
				.insert(schema.ticketAssignee)
				.values(
					t.assignees.map((a) => ({ ticketId: id, userId: u(ctx, a), addedAt: t.createdAt }))
				);
		}
		for (const p of t.pinnedBy ?? []) {
			await ctx.db
				.insert(schema.ticketFavorite)
				.values({ userId: u(ctx, p), ticketId: id })
				.onConflictDoNothing();
		}
		maxNumber.set(orgId, Math.max(maxNumber.get(orgId) ?? 0, number));
	}
	for (const [orgId, max] of maxNumber) {
		await ctx.db
			.update(schema.organization)
			.set({ nextTicketNumber: sql`GREATEST(${schema.organization.nextTicketNumber}, ${max + 1})` })
			.where(eq(schema.organization.id, orgId));
	}
	ok(`tickets: ${ctx.tickets.size} rows reconciled`);
}

async function seedTicketExtras(ctx: Ctx) {
	let messages = 0,
		files = 0;
	for (const t of TICKETS) {
		const id = ctx.tickets.get(t.key);
		if (!id) continue;
		const orgId = ctx.orgs.get(projectOf(t.key) as OrgKey)!;
		const threadId = await ensureThread(ctx, 'ticket', id, demoId(`thread:ticket:${t.key}`));

		for (const [i, m] of t.messages.entries()) {
			const mid = demoId(`msg:ticket:${t.key}:${i}`);
			await upsertMessage(ctx, {
				id: mid,
				threadId,
				authorId: u(ctx, m.user),
				body: resolveRefs(ctx, m.text),
				at: m.at,
				internal: m.internal ?? false
			});
			for (const f of m.files ?? []) {
				if (
					await attach(ctx, {
						entityType: 'message',
						entityId: mid,
						filename: f,
						orgId,
						projectId: null,
						uploadedBy: u(ctx, m.user),
						createdAt: m.at
					})
				)
					files++;
			}
			messages++;
		}
		for (const [i, e] of (t.events ?? []).entries()) {
			const meta: Record<string, unknown> =
				e.meta.event === 'assigned'
					? {
							event: 'assigned',
							added: e.meta.added.map((k) => u(ctx, k)),
							removed: e.meta.removed.map((k) => u(ctx, k))
						}
					: { ...e.meta };
			const body =
				e.meta.event === 'status_changed'
					? `Status: ${e.meta.from} → ${e.meta.to}`
					: e.meta.event === 'priority_changed'
						? `Priority: ${e.meta.from} → ${e.meta.to}`
						: `Assignees changed (+${e.meta.added.length}/-${e.meta.removed.length})`;
			await upsertMessage(ctx, {
				id: demoId(`evt:ticket:${t.key}:${i}`),
				threadId,
				authorId: u(ctx, e.actor),
				body,
				at: e.at,
				kind: 'system',
				internal: e.internal ?? false,
				meta
			});
		}
		for (const f of t.files ?? []) {
			if (
				await attach(ctx, {
					entityType: 'ticket',
					entityId: id,
					filename: f,
					orgId,
					projectId: null,
					uploadedBy: u(ctx, t.customer),
					createdAt: new Date(t.createdAt.getTime() + 20_000)
				})
			)
				files++;
		}
	}
	ok(`tickets: ${messages} messages, ${files} attachments`);
}

// ── Chat ───────────────────────────────────────────────────────────────────
async function seedChat(ctx: Ctx) {
	const orgIdOf = (o: 'internal' | OrgKey) =>
		o === 'internal' ? INTERNAL_ORG_ID : ctx.orgs.get(o)!;
	const tagIds = new Map<string, string>(); // `${org}:${label}` → id
	for (const t of TAGS) {
		const orgId = orgIdOf(t.org);
		const [existing] = await ctx.db
			.select({ id: schema.tag.id })
			.from(schema.tag)
			.where(
				and(
					t.org === 'internal' ? isNull(schema.tag.orgId) : eq(schema.tag.orgId, orgId),
					eq(schema.tag.label, t.label)
				)
			)
			.limit(1);
		let id = existing?.id;
		if (!id) {
			id = demoId(`tag:${t.org}:${t.label}`);
			await ctx.db.insert(schema.tag).values({
				id,
				orgId: t.org === 'internal' ? null : orgId,
				label: t.label,
				color: t.color,
				createdBy: u(ctx, 'u6')
			});
		} else {
			await ctx.db.update(schema.tag).set({ color: t.color }).where(eq(schema.tag.id, id));
		}
		tagIds.set(`${t.org}:${t.label}`, id);
	}

	let messages = 0;
	const maxId = u(ctx, MAX_USER);
	for (const th of THREADS) {
		const orgId = orgIdOf(th.org);
		const id = demoId(`thread:chat:${th.id}`);
		const first = th.messages[0].at;
		const last = th.messages[th.messages.length - 1].at;
		await ctx.db
			.insert(schema.thread)
			.values({
				id,
				subjectType: 'org',
				subjectId: orgId,
				title: th.title,
				status: th.status ?? 'open',
				createdBy: u(ctx, th.createdBy),
				createdAt: first,
				updatedAt: last
			})
			.onConflictDoUpdate({
				target: schema.thread.id,
				set: { title: th.title, status: th.status ?? 'open', updatedAt: last, deletedAt: null }
			});
		for (const label of th.tags) {
			const tagId = tagIds.get(`${th.org}:${label}`);
			if (tagId)
				await ctx.db.insert(schema.threadTag).values({ threadId: id, tagId }).onConflictDoNothing();
		}
		for (const [i, m] of th.messages.entries()) {
			const mid = demoId(`msg:chat:${th.id}:${i}`);
			await upsertMessage(ctx, {
				id: mid,
				threadId: id,
				authorId: u(ctx, m.user),
				body: resolveRefs(ctx, m.text),
				at: m.at
			});
			for (const f of m.files ?? []) {
				await attach(ctx, {
					entityType: 'message',
					entityId: mid,
					filename: f,
					orgId: th.org === 'internal' ? null : orgId,
					projectId: null,
					uploadedBy: u(ctx, m.user),
					createdAt: m.at
				});
			}
			messages++;
		}
		// Max has read everything older than a day; today's threads stay unread.
		const lastFromOthers = [...th.messages].reverse().find((m) => m.user !== MAX_USER);
		const unread = lastFromOthers && Date.now() - lastFromOthers.at.getTime() < 20 * 3600_000;
		if (!unread) {
			await ctx.db
				.insert(schema.threadRead)
				.values({ threadId: id, userId: maxId, lastReadAt: last })
				.onConflictDoNothing();
		}
	}
	ok(`chat: ${THREADS.length} threads, ${messages} messages, ${TAGS.length} tags`);
}

// ── Notes ──────────────────────────────────────────────────────────────────
async function upsertDocument(ctx: Ctx, id: string, html: string) {
	const [existing] = await ctx.db
		.select({ id: schema.document.id, hasYdoc: sql<boolean>`${schema.document.ydoc} is not null` })
		.from(schema.document)
		.where(eq(schema.document.id, id))
		.limit(1);
	if (!existing) {
		await ctx.db.insert(schema.document).values({ id, bodyHtml: html });
	} else if (!existing.hasYdoc) {
		// Nobody has opened it in the editor yet — safe to refresh the seed HTML.
		await ctx.db.update(schema.document).set({ bodyHtml: html }).where(eq(schema.document.id, id));
	}
}

// The app seeds these lazily on first use (see SYSTEM_TEMPLATES in
// src/lib/server/notes.ts); a fresh database has none yet, and meeting notes
// reference them by id.
const SYSTEM_NOTE_TEMPLATES = [
	{
		id: 'tmpl-standup',
		name: 'Standup',
		icon: 'list',
		bodyHtml:
			'<h2>Yesterday</h2><ul><li></li></ul><h2>Today</h2><ul><li></li></ul><h2>Blockers</h2><ul><li></li></ul>'
	},
	{
		id: 'tmpl-one-on-one',
		name: '1:1',
		icon: 'users',
		bodyHtml:
			'<h2>Talking points</h2><ul><li></li></ul><h2>Feedback</h2><ul><li></li></ul><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"></li></ul>'
	},
	{
		id: 'tmpl-retro',
		name: 'Retro',
		icon: 'refresh',
		bodyHtml:
			'<h2>What went well</h2><ul><li></li></ul><h2>What didn\'t</h2><ul><li></li></ul><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"></li></ul>'
	}
];

async function seedNotes(ctx: Ctx) {
	await ctx.db
		.insert(schema.noteTemplate)
		.values(SYSTEM_NOTE_TEMPLATES.map((t) => ({ ...t, isSystem: true, ownerId: null })))
		.onConflictDoNothing();
	for (const n of NOTES) {
		const id = demoId(`note:${n.id}`);
		const docId = demoId(`doc:note:${n.id}`);
		await upsertDocument(ctx, docId, n.html);
		const owner = u(ctx, n.owner);
		const values = {
			kind: n.kind,
			title: n.title,
			icon: n.icon,
			documentId: docId,
			ownerId: owner,
			updatedById: owner,
			pinned: n.pinned ?? false,
			meetingDate: n.kind === 'meeting' ? (n.meetingDate ?? n.updatedAt) : null,
			projectId: n.project ? ctx.projects.get(n.project)!.id : null,
			templateId: n.template ?? null,
			updatedAt: n.updatedAt
		};
		await ctx.db
			.insert(schema.note)
			.values({ id, ...values, createdAt: n.meetingDate ?? n.updatedAt })
			.onConflictDoUpdate({ target: schema.note.id, set: values });
		for (const f of n.files ?? []) {
			await attach(ctx, {
				entityType: 'note',
				entityId: id,
				filename: f,
				orgId: null,
				projectId: null,
				uploadedBy: owner,
				createdAt: n.updatedAt
			});
		}
	}
	ok(`notes: ${NOTES.length} reconciled`);
}

// ── Wiki ───────────────────────────────────────────────────────────────────
function blocksToHtml(body: WikiBlock[]): string {
	return body
		.map((b) => {
			switch (b.kind) {
				case 'h1':
					return `<h1>${esc(b.text)}</h1>`;
				case 'h2':
					return `<h2>${esc(b.text)}</h2>`;
				case 'p':
					return `<p>${esc(b.text)}</p>`;
				case 'callout':
					return `<blockquote><p>${esc(b.text)}</p></blockquote>`;
				case 'list':
					return `<ul>${b.items.map((i) => `<li><p>${esc(i)}</p></li>`).join('')}</ul>`;
				case 'tasks':
					return `<ul data-type="taskList">${b.items.map(([t, d]) => `<li data-type="taskItem" data-checked="${d}"><p>${esc(t)}</p></li>`).join('')}</ul>`;
				case 'code':
					return `<pre><code>${esc(b.text)}</code></pre>`;
			}
		})
		.join('');
}

async function seedWiki(ctx: Ctx) {
	for (const [i, p] of WIKI_PAGES.entries()) {
		const isFolder = p.icon === 'folder';
		const html = isFolder ? '' : blocksToHtml(p.body);
		const values = {
			parentId: p.parent,
			title: p.title,
			icon: p.icon,
			isFolder,
			body: html,
			authorId: u(ctx, p.author),
			sortOrder: i,
			updatedAt: p.updatedAt
		};
		const [existing] = await ctx.db
			.select({ documentId: schema.wikiPage.documentId })
			.from(schema.wikiPage)
			.where(eq(schema.wikiPage.id, p.id))
			.limit(1);
		if (existing) {
			await ctx.db.update(schema.wikiPage).set(values).where(eq(schema.wikiPage.id, p.id));
			// Pages opened in the editor already have a document — keep it fresh
			// unless someone has actually edited it (ydoc set).
			if (existing.documentId && !isFolder) await upsertDocument(ctx, existing.documentId, html);
		} else {
			await ctx.db.insert(schema.wikiPage).values({ id: p.id, ...values });
		}
	}
	ok(`wiki: ${WIKI_PAGES.length} pages reconciled`);
}

// ── Notifications (Max's inbox) ────────────────────────────────────────────
async function seedNotifications(ctx: Ctx) {
	const maxId = u(ctx, MAX_USER);
	const name = (k: UserKey) => USERS.find((x) => x.id === k)!.name;
	const plain = (s: string) =>
		s.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').replace(/~\[([^\]]+)\]\([^)]+\)/g, '$1');
	type N = {
		id: string;
		kind: schema.NotificationKind;
		title: string;
		body: string | null;
		url: string;
		actor: UserKey;
		at: Date;
		orgId: string | null;
		entityType: string;
		entityId: string;
	};
	const out: N[] = [];

	for (const t of TASKS) {
		const id = ctx.tasks.get(t.key);
		if (!id) continue;
		const project = ctx.projects.get(projectOf(t.key))!;
		const mine = t.assignees.includes(MAX_USER);
		const url = `/tasks?task=${t.key}`;
		if (mine && t.createdBy !== MAX_USER) {
			out.push({
				id: demoId(`n:assigned:${t.key}`),
				kind: 'taskAssigned',
				title: `${name(t.createdBy)} assigned you ${t.key} — ${t.title}`,
				body: null,
				url,
				actor: t.createdBy,
				at: new Date(t.createdAt.getTime() + 60_000),
				orgId: project.orgId,
				entityType: 'task',
				entityId: id
			});
		}
		for (const [i, c] of (t.comments ?? []).entries()) {
			if (c.user === MAX_USER) continue;
			const mentioned = c.text.includes(`](${MAX_USER})`);
			if (!mine && !mentioned) continue;
			out.push({
				id: demoId(`n:comment:${t.key}:${i}`),
				kind: mentioned ? 'taskMentioned' : 'taskCommented',
				title: mentioned
					? `${name(c.user)} mentioned you in ${t.key} — ${t.title}`
					: `${name(c.user)} commented on ${t.key} — ${t.title}`,
				body: plain(c.text),
				url,
				actor: c.user,
				at: c.at,
				orgId: project.orgId,
				entityType: 'task',
				entityId: id
			});
		}
	}
	for (const t of TICKETS) {
		const id = ctx.tickets.get(t.key);
		if (!id) continue;
		const orgId = ctx.orgs.get(projectOf(t.key) as OrgKey)!;
		const mine = t.assignees.includes(MAX_USER);
		const url = `/tickets/${id}`;
		const assignEvt = (t.events ?? []).find(
			(e) => e.meta.event === 'assigned' && e.meta.added.includes(MAX_USER)
		);
		if (mine && assignEvt && assignEvt.actor !== MAX_USER) {
			out.push({
				id: demoId(`n:tassigned:${t.key}`),
				kind: 'ticketAssigned',
				title: `${name(assignEvt.actor)} assigned you ${t.key} — ${t.subject}`,
				body: null,
				url,
				actor: assignEvt.actor,
				at: assignEvt.at,
				orgId,
				entityType: 'ticket',
				entityId: id
			});
		}
		if (t.status === 'open' && !t.assignees.length) {
			out.push({
				id: demoId(`n:tcreated:${t.key}`),
				kind: 'ticketCreated',
				title: `New ticket ${t.key} — ${t.subject}`,
				body: plain(t.description).split('\n')[0],
				url,
				actor: t.customer,
				at: t.createdAt,
				orgId,
				entityType: 'ticket',
				entityId: id
			});
		}
		for (const [i, m] of t.messages.entries()) {
			if (!mine || m.internal || USERS.find((x) => x.id === m.user)?.org === 'internal') continue;
			out.push({
				id: demoId(`n:tmsg:${t.key}:${i}`),
				kind: 'ticketMessage',
				title: `${name(m.user)} replied on ${t.key} — ${t.subject}`,
				body: plain(m.text),
				url,
				actor: m.user,
				at: m.at,
				orgId,
				entityType: 'ticket',
				entityId: id
			});
		}
	}
	for (const th of THREADS) {
		const orgId = th.org === 'internal' ? INTERNAL_ORG_ID : ctx.orgs.get(th.org)!;
		const threadId = demoId(`thread:chat:${th.id}`);
		for (const [i, m] of th.messages.entries()) {
			if (!m.text.includes(`](${MAX_USER})`)) continue;
			out.push({
				id: demoId(`n:chat:${th.id}:${i}`),
				kind: 'chatMentioned',
				title: `${name(m.user)} mentioned you in "${th.title}"`,
				body: plain(m.text),
				url: `/chat?org=${orgId}&thread=${threadId}`,
				actor: m.user,
				at: m.at,
				orgId: th.org === 'internal' ? null : orgId,
				entityType: 'thread',
				entityId: threadId
			});
		}
	}

	// Anything older than ~2 days counts as read; recent ones stay unread.
	const cutoff = Date.now() - 2 * 24 * 3600_000;
	for (const n of out) {
		await ctx.db
			.insert(schema.notification)
			.values({
				id: n.id,
				recipientId: maxId,
				orgId: n.orgId,
				kind: n.kind,
				title: n.title,
				body: n.body,
				url: n.url,
				actorId: u(ctx, n.actor),
				entityType: n.entityType,
				entityId: n.entityId,
				readAt: n.at.getTime() < cutoff ? new Date(n.at.getTime() + 3600_000) : null,
				createdAt: n.at
			})
			.onConflictDoNothing();
	}
	ok(
		`inbox: ${out.length} notifications for Max (${out.filter((n) => n.at.getTime() >= cutoff).length} unread)`
	);
}

// ── Entry ──────────────────────────────────────────────────────────────────
export async function seedDemo(db: Db): Promise<void> {
	const password = process.env.DEMO_PASSWORD ?? 'demo12345';
	if (password.length < 8) throw new Error('DEMO_PASSWORD must be at least 8 characters.');

	const ctx: Ctx = {
		db,
		users: new Map(),
		orgs: new Map(),
		projects: new Map(),
		tasks: new Map(),
		tickets: new Map(),
		files: await buildDemoFiles(),
		storage: openStorage()
	};
	info(`demo files: ${ctx.files.size} generated`);

	await seedOrgs(ctx);
	await seedUsers(ctx, password);
	await seedProjects(ctx);
	await seedTaskRows(ctx);
	await seedTicketRows(ctx);
	await seedTaskExtras(ctx);
	await seedTicketExtras(ctx);
	await seedChat(ctx);
	await seedNotes(ctx);
	await seedWiki(ctx);
	await seedNotifications(ctx);

	const max = USERS.find((x) => x.id === MAX_USER)!;
	ok('demo seed complete');
	console.log('');
	console.log('  Demo login (all demo users share the same password):');
	console.log(`    ${max.name.padEnd(14)} ${max.email}   /  ${password}`);
	for (const usr of USERS.filter((x) => x.id !== MAX_USER && x.org === 'internal')) {
		console.log(`    ${usr.name.padEnd(14)} ${usr.email}`);
	}
	console.log('  Client portal users:');
	for (const usr of USERS.filter((x) => x.org !== 'internal')) {
		console.log(`    ${usr.name.padEnd(14)} ${usr.email}   (${usr.org})`);
	}
	console.log('');
}
