// Server logic for the unified thread/message system. v1 powers the org-wide
// support chat (subjectType='org'); the same primitives are intended to back
// task comments, ticket conversations, project chat and DMs later.
//
// Access is always derived from the subject (see notify/recipients.ts and the
// route load) — nothing here stores chat membership.

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import {
	message,
	tag,
	tagSubscription,
	thread,
	threadRead,
	threadTag,
	type Tag
} from './db/app.schema';
import { listAttachmentsForMany, type AttachmentPublic } from './attachments';

export type ChatTag = Pick<Tag, 'id' | 'label' | 'color'>;

export type ThreadListItem = {
	id: string;
	title: string | null;
	status: string;
	createdBy: string | null;
	createdAt: string;
	updatedAt: string;
	tagIds: string[];
	lastMessage: { body: string; authorId: string | null; createdAt: string } | null;
	unread: boolean;
};

export type ChatMessage = {
	id: string;
	threadId: string;
	authorId: string | null;
	body: string;
	kind: string;
	createdAt: string;
	editedAt: string | null;
	files: AttachmentPublic[];
};

// ─── Tags ────────────────────────────────────────────────────────────────────

export function listOrgTags(orgId: string): Promise<ChatTag[]> {
	return db
		.select({ id: tag.id, label: tag.label, color: tag.color })
		.from(tag)
		.where(eq(tag.orgId, orgId))
		.orderBy(tag.label);
}

export async function createTag(input: {
	orgId: string;
	label: string;
	color?: string | null;
	createdBy: string;
}): Promise<ChatTag> {
	const id = crypto.randomUUID();
	await db
		.insert(tag)
		.values({
			id,
			orgId: input.orgId,
			label: input.label,
			color: input.color ?? null,
			createdBy: input.createdBy
		})
		.onConflictDoNothing({ target: [tag.orgId, tag.label] });
	// Return the canonical row (handles the case where the label already existed).
	const [row] = await db
		.select({ id: tag.id, label: tag.label, color: tag.color })
		.from(tag)
		.where(and(eq(tag.orgId, input.orgId), eq(tag.label, input.label)))
		.limit(1);
	return row ?? { id, label: input.label, color: input.color ?? null };
}

// Replace the full tag set on a thread.
export async function setThreadTags(threadId: string, tagIds: string[]): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.delete(threadTag).where(eq(threadTag.threadId, threadId));
		if (tagIds.length > 0) {
			await tx
				.insert(threadTag)
				.values(tagIds.map((tagId) => ({ threadId, tagId })))
				.onConflictDoNothing();
		}
		await tx.update(thread).set({ updatedAt: new Date() }).where(eq(thread.id, threadId));
	});
}

// ─── Tag subscriptions (per-user follow / mute) ───────────────────────────────

// Map of tagId -> mode for the org's tags, for the given user.
export async function listTagSubscriptions(
	userId: string,
	orgId: string
): Promise<Record<string, 'all' | 'muted'>> {
	const rows = await db
		.select({ tagId: tagSubscription.tagId, mode: tagSubscription.mode })
		.from(tagSubscription)
		.innerJoin(tag, eq(tag.id, tagSubscription.tagId))
		.where(and(eq(tagSubscription.userId, userId), eq(tag.orgId, orgId)));
	const out: Record<string, 'all' | 'muted'> = {};
	for (const r of rows) out[r.tagId] = r.mode;
	return out;
}

export async function setTagSubscription(
	userId: string,
	tagId: string,
	mode: 'all' | 'muted' | null
): Promise<void> {
	if (mode === null) {
		await db
			.delete(tagSubscription)
			.where(and(eq(tagSubscription.tagId, tagId), eq(tagSubscription.userId, userId)));
		return;
	}
	await db
		.insert(tagSubscription)
		.values({ tagId, userId, mode })
		.onConflictDoUpdate({
			target: [tagSubscription.tagId, tagSubscription.userId],
			set: { mode, updatedAt: sql`now()` }
		});
}

// ─── Threads & messages ───────────────────────────────────────────────────────

export async function loadOrgThreads(
	orgId: string,
	userId: string,
	opts: { tagId?: string } = {}
): Promise<ThreadListItem[]> {
	const base = and(
		eq(thread.subjectType, 'org'),
		eq(thread.subjectId, orgId),
		isNull(thread.deletedAt)
	);
	const rows = opts.tagId
		? await db
				.select({
					id: thread.id,
					title: thread.title,
					status: thread.status,
					createdBy: thread.createdBy,
					createdAt: thread.createdAt,
					updatedAt: thread.updatedAt
				})
				.from(thread)
				.innerJoin(threadTag, eq(threadTag.threadId, thread.id))
				.where(and(base, eq(threadTag.tagId, opts.tagId)))
				.orderBy(desc(thread.updatedAt))
		: await db
				.select({
					id: thread.id,
					title: thread.title,
					status: thread.status,
					createdBy: thread.createdBy,
					createdAt: thread.createdAt,
					updatedAt: thread.updatedAt
				})
				.from(thread)
				.where(base)
				.orderBy(desc(thread.updatedAt));

	const ids = rows.map((r) => r.id);
	if (ids.length === 0) return [];

	const [tagRows, msgRows, readRows] = await Promise.all([
		db
			.select({ threadId: threadTag.threadId, tagId: threadTag.tagId })
			.from(threadTag)
			.where(inArray(threadTag.threadId, ids)),
		db
			.select({
				threadId: message.threadId,
				body: message.body,
				authorId: message.authorId,
				createdAt: message.createdAt
			})
			.from(message)
			.where(and(inArray(message.threadId, ids), isNull(message.deletedAt)))
			.orderBy(message.createdAt),
		db
			.select({ threadId: threadRead.threadId, lastReadAt: threadRead.lastReadAt })
			.from(threadRead)
			.where(and(eq(threadRead.userId, userId), inArray(threadRead.threadId, ids)))
	]);

	const tagsByThread = new Map<string, string[]>();
	for (const t of tagRows) {
		const list = tagsByThread.get(t.threadId) ?? [];
		list.push(t.tagId);
		tagsByThread.set(t.threadId, list);
	}
	// msgRows is ascending by createdAt, so the last seen per thread is the latest.
	const lastByThread = new Map<string, { body: string; authorId: string | null; createdAt: Date }>();
	for (const mrow of msgRows) {
		lastByThread.set(mrow.threadId, {
			body: mrow.body,
			authorId: mrow.authorId,
			createdAt: mrow.createdAt
		});
	}
	const readByThread = new Map<string, Date>();
	for (const r of readRows) readByThread.set(r.threadId, r.lastReadAt);

	return rows.map((r) => {
		const last = lastByThread.get(r.id) ?? null;
		const lastRead = readByThread.get(r.id);
		const unread =
			!!last &&
			last.authorId !== userId &&
			(!lastRead || last.createdAt.getTime() > lastRead.getTime());
		return {
			id: r.id,
			title: r.title,
			status: r.status,
			createdBy: r.createdBy,
			createdAt: r.createdAt.toISOString(),
			updatedAt: r.updatedAt.toISOString(),
			tagIds: tagsByThread.get(r.id) ?? [],
			lastMessage: last
				? { body: last.body, authorId: last.authorId, createdAt: last.createdAt.toISOString() }
				: null,
			unread
		};
	});
}

export async function loadMessages(threadId: string): Promise<ChatMessage[]> {
	const rows = await db
		.select()
		.from(message)
		.where(and(eq(message.threadId, threadId), isNull(message.deletedAt)))
		.orderBy(message.createdAt);
	const fileMap = await listAttachmentsForMany(
		'message',
		rows.map((r) => r.id)
	);
	return rows.map((r) => ({
		id: r.id,
		threadId: r.threadId,
		authorId: r.authorId,
		body: r.body,
		kind: r.kind,
		createdAt: r.createdAt.toISOString(),
		editedAt: r.editedAt ? r.editedAt.toISOString() : null,
		files: fileMap.get(r.id) ?? []
	}));
}

// Create a thread plus its first message in one transaction. Returns both ids so
// the caller can attach staged files to the message.
export async function createThread(input: {
	orgId: string;
	title: string;
	body: string;
	createdBy: string;
	tagIds?: string[];
}): Promise<{ threadId: string; messageId: string }> {
	const threadId = crypto.randomUUID();
	const messageId = crypto.randomUUID();
	await db.transaction(async (tx) => {
		await tx.insert(thread).values({
			id: threadId,
			subjectType: 'org',
			subjectId: input.orgId,
			title: input.title,
			createdBy: input.createdBy
		});
		await tx.insert(message).values({
			id: messageId,
			threadId,
			authorId: input.createdBy,
			body: input.body
		});
		if (input.tagIds && input.tagIds.length > 0) {
			await tx
				.insert(threadTag)
				.values(input.tagIds.map((tagId) => ({ threadId, tagId })))
				.onConflictDoNothing();
		}
	});
	return { threadId, messageId };
}

export async function addMessage(input: {
	threadId: string;
	authorId: string;
	body: string;
}): Promise<{ id: string }> {
	const id = crypto.randomUUID();
	await db.transaction(async (tx) => {
		await tx.insert(message).values({
			id,
			threadId: input.threadId,
			authorId: input.authorId,
			body: input.body
		});
		await tx.update(thread).set({ updatedAt: new Date() }).where(eq(thread.id, input.threadId));
	});
	return { id };
}

// Resolve the org + title for a thread (used to scope permission checks and
// render notifications for thread-targeted actions). Returns null for non-org
// threads / missing rows.
export async function getThreadContext(
	threadId: string
): Promise<{ orgId: string; title: string | null } | null> {
	const [row] = await db
		.select({
			subjectType: thread.subjectType,
			subjectId: thread.subjectId,
			title: thread.title
		})
		.from(thread)
		.where(and(eq(thread.id, threadId), isNull(thread.deletedAt)))
		.limit(1);
	if (!row || row.subjectType !== 'org') return null;
	return { orgId: row.subjectId, title: row.title };
}

export async function markThreadRead(threadId: string, userId: string): Promise<void> {
	await db
		.insert(threadRead)
		.values({ threadId, userId, lastReadAt: new Date() })
		.onConflictDoUpdate({
			target: [threadRead.threadId, threadRead.userId],
			set: { lastReadAt: sql`now()` }
		});
}
