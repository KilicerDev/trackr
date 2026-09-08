// Server logic for Notes — quick (personal) and meeting notes. Mirrors the
// shape of `wiki.ts`: each note owns a collaborative `document` (Yjs + derived
// HTML); content is persisted by Hocuspocus, only metadata flows through here.
//
// Access (v1, the whole feature is internal-team gated):
//   - quick   → owner = write; otherwise the role from a redeemed `note_access`
//               grant; otherwise no access.
//   - meeting → required project/task link; any team member (or project member)
//               gets write. The link is the organizing key + forward-compat.

import { recordAudit } from '$lib/server/audit';
import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from './db';
import { document, note, noteAccess, noteShareLink, noteTemplate } from './db/app.schema';
import { deleteAttachmentsFor } from './attachments';
import { loadBodyHtml } from './collab/derive';
import { replaceDocumentHtml } from './collab/replace';
import type { Memberships } from '$lib/permissions';

export type NoteRole = 'read' | 'write';
export type NoteKind = 'quick' | 'meeting';

function isTeam(m: Memberships): boolean {
	return m.orgs.some((o) => o.isInternal);
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function getNote(id: string) {
	const [row] = await db.select().from(note).where(eq(note.id, id)).limit(1);
	return row ?? null;
}

/** Note row plus its rendered body HTML (see `loadBodyHtml`). Null if missing. */
export async function getNoteWithBody(id: string) {
	const row = await getNote(id);
	if (!row) return null;
	const bodyHtml = row.documentId ? await loadBodyHtml(row.documentId) : '';
	return { ...row, bodyHtml };
}

/**
 * Replace a note's content with the given document HTML (see
 * `markdownToDocHtml`) through the collab layer, creating the linked document
 * first if needed. Returns false when the note doesn't exist.
 */
async function auditNote(
	type: 'note.update' | 'note.delete',
	id: string,
	actorId: string,
	meta: Record<string, unknown>,
	title?: string | null
): Promise<void> {
	let label = title ?? null;
	if (label === null) {
		const [row] = await db.select({ title: note.title }).from(note).where(eq(note.id, id)).limit(1);
		label = row?.title ?? null;
	}
	await recordAudit({ type, actorId, targetType: 'note', targetId: id, targetLabel: label, meta });
}

export async function updateNoteBody(id: string, html: string, userId: string): Promise<boolean> {
	const docId = await ensureDocumentForNote(id);
	if (!docId) return false;
	await replaceDocumentHtml(docId, html, userId);
	void auditNote('note.update', id, userId, { body: true });
	return true;
}

export type NoteListItem = {
	id: string;
	kind: string;
	title: string;
	icon: string;
	pinned: boolean;
	parentId: string | null;
	sortOrder: number;
	updatedAt: Date;
	meetingDate: Date | null;
	projectId: string | null;
	taskId: string | null;
};

const listColumns = {
	id: note.id,
	kind: note.kind,
	title: note.title,
	icon: note.icon,
	pinned: note.pinned,
	parentId: note.parentId,
	sortOrder: note.sortOrder,
	updatedAt: note.updatedAt,
	meetingDate: note.meetingDate,
	projectId: note.projectId,
	taskId: note.taskId
};

// Owner's quick notes in tree order (siblings by sort_order, then creation).
// The sidebar nests them by parentId; pinned ones surface in Favorites.
export async function listQuickNotes(ownerId: string): Promise<NoteListItem[]> {
	return db
		.select(listColumns)
		.from(note)
		.where(and(eq(note.kind, 'quick'), eq(note.ownerId, ownerId)))
		.orderBy(asc(note.sortOrder), asc(note.createdAt));
}

// Quick notes shared with this user via a (non-revoked) redeemed link, excluding
// ones they own.
export async function listSharedWithMe(userId: string): Promise<NoteListItem[]> {
	return db
		.select(listColumns)
		.from(note)
		.innerJoin(noteAccess, eq(noteAccess.noteId, note.id))
		.where(and(eq(noteAccess.userId, userId), eq(note.kind, 'quick')))
		.orderBy(desc(note.createdAt));
}

// All meeting notes, newest meeting first. Team members see every meeting note.
export async function listMeetingNotes(): Promise<NoteListItem[]> {
	return db
		.select(listColumns)
		.from(note)
		.where(eq(note.kind, 'meeting'))
		.orderBy(desc(note.meetingDate), desc(note.createdAt));
}

// Meeting notes connected to a project — linked directly OR via one of its
// tasks. Newest meeting first, undated meetings last.
export async function listProjectMeetings(
	projectId: string,
	taskIds: string[]
): Promise<NoteListItem[]> {
	const link =
		taskIds.length > 0
			? or(eq(note.projectId, projectId), inArray(note.taskId, taskIds))
			: eq(note.projectId, projectId);
	return db
		.select(listColumns)
		.from(note)
		.where(and(eq(note.kind, 'meeting'), link))
		.orderBy(sql`${note.meetingDate} desc nulls last`, desc(note.createdAt));
}

/**
 * Ensures the note has a linked collaborative `document`, creating one (seeded
 * from `seedHtml`, used for templates) and linking it on first access. Returns
 * the document id, or null if the note doesn't exist. Idempotent.
 */
export async function ensureDocumentForNote(noteId: string): Promise<string | null> {
	const [row] = await db
		.select({ documentId: note.documentId })
		.from(note)
		.where(eq(note.id, noteId))
		.limit(1);
	if (!row) return null;
	if (row.documentId) return row.documentId;

	const docId = randomUUID();
	await db.transaction(async (tx) => {
		await tx.insert(document).values({ id: docId, bodyHtml: '' });
		await tx.update(note).set({ documentId: docId }).where(eq(note.id, noteId));
	});
	return docId;
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export type CreateNoteInput = {
	kind: NoteKind;
	ownerId: string;
	title?: string;
	icon?: string;
	// quick-only: nest under one of the owner's own quick notes.
	parentId?: string | null;
	// meeting-only
	meetingDate?: Date;
	projectId?: string | null;
	taskId?: string | null;
	templateId?: string | null;
};

/**
 * A quick note may only nest under another quick note of the same owner.
 * Throws for anything else (missing, foreign, meeting) so callers surface a
 * 400 rather than silently creating a root note.
 */
async function requireOwnParent(parentId: string, ownerId: string): Promise<void> {
	const parent = await getNote(parentId);
	if (!parent || parent.ownerId !== ownerId || parent.kind !== 'quick') {
		throw new Error('Parent note not found.');
	}
}

async function nextSortOrder(ownerId: string, parentId: string | null): Promise<number> {
	const [row] = await db
		.select({ max: sql<number | null>`max(${note.sortOrder})` })
		.from(note)
		.where(
			and(
				eq(note.kind, 'quick'),
				eq(note.ownerId, ownerId),
				parentId ? eq(note.parentId, parentId) : isNull(note.parentId)
			)
		);
	return (row?.max ?? -1) + 1;
}

export async function createNote(input: CreateNoteInput): Promise<string> {
	const id = randomUUID();
	const docId = randomUUID();

	const parentId = input.kind === 'quick' ? (input.parentId ?? null) : null;
	if (parentId) await requireOwnParent(parentId, input.ownerId);
	// New notes land at the end of their sibling group (root = top level).
	const sortOrder = input.kind === 'quick' ? await nextSortOrder(input.ownerId, parentId) : 0;

	// Apply a template by seeding the document's body_html; Hocuspocus'
	// onLoadDocument builds the ydoc from it on first open (same path as legacy
	// wiki HTML), so no collab-side seeding code is needed here.
	let seedHtml = '';
	if (input.templateId) {
		const [tpl] = await db
			.select({ bodyHtml: noteTemplate.bodyHtml })
			.from(noteTemplate)
			.where(eq(noteTemplate.id, input.templateId))
			.limit(1);
		seedHtml = tpl?.bodyHtml ?? '';
	}

	await db.transaction(async (tx) => {
		await tx.insert(document).values({ id: docId, bodyHtml: seedHtml });
		await tx.insert(note).values({
			id,
			kind: input.kind,
			title: input.title ?? '',
			icon: input.icon ?? (input.kind === 'meeting' ? 'users' : 'file'),
			documentId: docId,
			ownerId: input.ownerId,
			updatedById: input.ownerId,
			parentId,
			sortOrder,
			meetingDate: input.kind === 'meeting' ? (input.meetingDate ?? new Date()) : null,
			projectId: input.projectId ?? null,
			taskId: input.taskId ?? null,
			templateId: input.templateId ?? null
		});
	});
	void recordAudit({
		type: 'note.create',
		actorId: input.ownerId,
		targetType: 'note',
		targetId: id,
		targetLabel: input.title ?? '',
		meta: {
			kind: input.kind,
			parentId,
			projectId: input.projectId ?? null,
			taskId: input.taskId ?? null
		}
	});
	return id;
}

export type UpdateNoteInput = Partial<{
	title: string;
	icon: string;
	meetingDate: Date;
	projectId: string | null;
	taskId: string | null;
}>;

export async function updateNote(
	id: string,
	patch: UpdateNoteInput,
	updatedById: string
): Promise<void> {
	await db
		.update(note)
		.set({ ...patch, updatedById })
		.where(eq(note.id, id));
	void auditNote('note.update', id, updatedById, { fields: Object.keys(patch) }, patch.title);
}

export async function setPinned(id: string, pinned: boolean, updatedById: string): Promise<void> {
	// Pinning is a list-ordering tweak, not a content edit — but reuse updatedById
	// for attribution; updatedAt bumps via $onUpdate (acceptable for v1).
	await db.update(note).set({ pinned, updatedById }).where(eq(note.id, id));
}

export type MoveNoteInput = {
	id: string;
	/** New parent (must be the owner's own quick note) or null for top level. */
	parentId: string | null;
	/** Sibling ids under `parentId` in their final order (including `id`). */
	orderedIds: string[];
	ownerId: string;
};

/**
 * Reparent and/or reorder one of the owner's quick notes (sidebar drag & drop).
 * Every id involved must be a quick note of the same owner; cycles are
 * rejected. Sibling renumbering bypasses $onUpdate so `updatedAt` (and with it
 * the Recent section) doesn't churn on a pure reorder.
 */
export async function moveNote(input: MoveNoteInput): Promise<void> {
	const { id, parentId, ownerId } = input;
	const mine = await db
		.select({ id: note.id, parentId: note.parentId })
		.from(note)
		.where(and(eq(note.kind, 'quick'), eq(note.ownerId, ownerId)));
	const own = new Set(mine.map((r) => r.id));
	if (!own.has(id)) throw new Error('Note not found.');

	if (parentId) {
		if (parentId === id) throw new Error('Cannot move a note into itself.');
		if (!own.has(parentId)) throw new Error('Parent note not found.');
		const descendants = new Set<string>();
		const stack = [id];
		while (stack.length) {
			const cur = stack.pop()!;
			for (const r of mine)
				if (r.parentId === cur && !descendants.has(r.id)) {
					descendants.add(r.id);
					stack.push(r.id);
				}
		}
		if (descendants.has(parentId)) throw new Error('Cannot move a note into its own sub-notes.');
	}

	const orderedIds = input.orderedIds.filter((sid) => own.has(sid));
	await db.transaction(async (tx) => {
		await tx.update(note).set({ parentId, updatedById: ownerId }).where(eq(note.id, id));
		for (let i = 0; i < orderedIds.length; i++) {
			await tx.execute(sql`update note set sort_order = ${i} where id = ${orderedIds[i]}`);
		}
	});
	void auditNote('note.update', id, ownerId, { moved: true, parentId });
}

export async function deleteNote(id: string, actorId?: string | null): Promise<void> {
	const row = await getNote(id);
	if (!row) return;

	// Sub-notes cascade via the parent_id FK; collect the subtree first so each
	// note's document and attachments go with it (neither is FK-linked).
	const subtree = new Map<string, string | null>([[id, row.documentId]]);
	if (row.kind === 'quick') {
		const mine = await db
			.select({ id: note.id, parentId: note.parentId, documentId: note.documentId })
			.from(note)
			.where(and(eq(note.kind, 'quick'), eq(note.ownerId, row.ownerId ?? '')));
		const stack = [id];
		while (stack.length) {
			const cur = stack.pop()!;
			for (const r of mine)
				if (r.parentId === cur && !subtree.has(r.id)) {
					subtree.set(r.id, r.documentId);
					stack.push(r.id);
				}
		}
	}
	const docIds = [...subtree.values()].filter((d): d is string => !!d);

	await db.transaction(async (tx) => {
		// note_share_link / note_access cascade via FK; drop the note then its docs.
		await tx.delete(note).where(eq(note.id, id));
		if (docIds.length) await tx.delete(document).where(inArray(document.id, docIds));
	});
	for (const noteId of subtree.keys()) await deleteAttachmentsFor('note', noteId);
	if (actorId) {
		void auditNote(
			'note.delete',
			id,
			actorId,
			{ kind: row.kind, deletedNotes: subtree.size },
			row.title
		);
	}
}

// ─── Sharing ───────────────────────────────────────────────────────────────

export async function listShareLinks(noteId: string) {
	return db
		.select()
		.from(noteShareLink)
		.where(eq(noteShareLink.noteId, noteId))
		.orderBy(desc(noteShareLink.createdAt));
}

export async function createShareLink(
	noteId: string,
	role: NoteRole,
	createdById: string
): Promise<string> {
	const id = randomUUID();
	const token = randomBytes(24).toString('base64url');
	await db.insert(noteShareLink).values({ id, noteId, token, role, createdById });
	return token;
}

export async function revokeShareLink(id: string): Promise<void> {
	await db.update(noteShareLink).set({ revokedAt: new Date() }).where(eq(noteShareLink.id, id));
}

/**
 * Redeem a share link for a logged-in user: validate the token, then upsert a
 * `note_access` grant so subsequent collab connections authorize. Returns the
 * target note id, or null if the token is invalid/revoked. Idempotent; an
 * existing grant is upgraded to the link's role.
 */
export async function redeemShareLink(token: string, userId: string): Promise<string | null> {
	const [link] = await db
		.select()
		.from(noteShareLink)
		.where(eq(noteShareLink.token, token))
		.limit(1);
	if (!link || link.revokedAt) return null;

	// Owners never need a grant; just send them to the note.
	const target = await getNote(link.noteId);
	if (!target) return null;
	if (target.ownerId === userId) return link.noteId;

	await db
		.insert(noteAccess)
		.values({
			id: randomUUID(),
			noteId: link.noteId,
			userId,
			role: link.role,
			grantedVia: link.id
		})
		.onConflictDoUpdate({
			target: [noteAccess.noteId, noteAccess.userId],
			set: { role: link.role, grantedVia: link.id }
		});
	return link.noteId;
}

/**
 * Resolve a viewer's effective role on a note, or null for no access. Used by
 * both the page load (to set `editable`) and Hocuspocus auth (to gate the
 * websocket + set read-only).
 */
export async function resolveNoteRole(
	row: { id: string; kind: string; ownerId: string | null; projectId: string | null },
	userId: string,
	memberships: Memberships
): Promise<NoteRole | null> {
	if (row.ownerId === userId) return 'write';

	if (row.kind === 'meeting') {
		// Inherited from the linked project. Team sees all projects → write.
		if (isTeam(memberships)) return 'write';
		if (row.projectId && memberships.projects.some((p) => p.projectId === row.projectId))
			return 'write';
		return null;
	}

	// Quick note: only via an explicit grant.
	const [grant] = await db
		.select({ role: noteAccess.role })
		.from(noteAccess)
		.where(and(eq(noteAccess.noteId, row.id), eq(noteAccess.userId, userId)))
		.limit(1);
	return (grant?.role as NoteRole | undefined) ?? null;
}

// ─── Templates ───────────────────────────────────────────────────────────────

// Seeded once (idempotent via fixed ids). Built-in meeting skeletons; users can
// author their own on top of these.
const SYSTEM_TEMPLATES = [
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
] as const;

let systemTemplatesSeeded = false;
async function ensureSystemTemplates(): Promise<void> {
	if (systemTemplatesSeeded) return;
	await db
		.insert(noteTemplate)
		.values(SYSTEM_TEMPLATES.map((t) => ({ ...t, isSystem: true, ownerId: null })))
		.onConflictDoNothing();
	systemTemplatesSeeded = true;
}

// All templates — system ones plus every team member's custom ones. Templates
// are only reachable behind the isTrackrTeam gate, and a template anyone on
// the team creates should be usable by the whole team (rename/delete stay
// owner-scoped).
export async function listTemplates() {
	await ensureSystemTemplates();
	return db
		.select()
		.from(noteTemplate)
		.orderBy(desc(noteTemplate.isSystem), desc(noteTemplate.updatedAt));
}

export async function getTemplate(id: string) {
	const [row] = await db.select().from(noteTemplate).where(eq(noteTemplate.id, id)).limit(1);
	return row ?? null;
}

export async function createTemplate(input: {
	name: string;
	icon?: string;
	bodyHtml?: string;
	ownerId: string;
}): Promise<string> {
	const id = randomUUID();
	await db.insert(noteTemplate).values({
		id,
		name: input.name,
		icon: input.icon ?? 'file-text',
		bodyHtml: input.bodyHtml ?? '',
		ownerId: input.ownerId,
		isSystem: false
	});
	return id;
}

export async function updateTemplate(
	id: string,
	ownerId: string,
	patch: Partial<{ name: string; icon: string; bodyHtml: string }>
): Promise<void> {
	// Owner-scoped: never let a user edit a system template or someone else's.
	await db
		.update(noteTemplate)
		.set(patch)
		.where(and(eq(noteTemplate.id, id), eq(noteTemplate.ownerId, ownerId)));
}

export async function deleteTemplate(id: string, ownerId: string): Promise<void> {
	await db
		.delete(noteTemplate)
		.where(and(eq(noteTemplate.id, id), eq(noteTemplate.ownerId, ownerId)));
}

// Used by collab store() to bump the owning note's edit signal. Mirrors the
// wiki update in hocuspocus.ts. No-op if the document isn't a note's.
export async function touchNoteByDocument(documentId: string, userId: string): Promise<void> {
	await db.update(note).set({ updatedById: userId }).where(eq(note.documentId, documentId));
}
