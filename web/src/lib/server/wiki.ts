import { asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { document, wikiPage } from './db/app.schema';
import { deleteAttachmentsFor } from './attachments';

export type WikiTreeNode = {
	id: string;
	parentId: string | null;
	title: string;
	icon: string;
	isFolder: boolean;
	sortOrder: number;
};

export async function loadWikiTree(): Promise<WikiTreeNode[]> {
	return db
		.select({
			id: wikiPage.id,
			parentId: wikiPage.parentId,
			title: wikiPage.title,
			icon: wikiPage.icon,
			isFolder: wikiPage.isFolder,
			sortOrder: wikiPage.sortOrder
		})
		.from(wikiPage)
		.orderBy(asc(wikiPage.sortOrder), asc(wikiPage.title));
}

export async function getWikiPage(id: string) {
	const [row] = await db.select().from(wikiPage).where(eq(wikiPage.id, id)).limit(1);
	return row ?? null;
}

/**
 * Ensures the page has a linked collaborative `document`, creating one (seeded
 * from the legacy `body` HTML) and linking it on first access. Returns the
 * document id, or null for a page that doesn't exist. Idempotent.
 */
export async function ensureDocumentForPage(pageId: string): Promise<string | null> {
	const [page] = await db
		.select({ documentId: wikiPage.documentId, body: wikiPage.body })
		.from(wikiPage)
		.where(eq(wikiPage.id, pageId))
		.limit(1);
	if (!page) return null;
	if (page.documentId) return page.documentId;

	const docId = crypto.randomUUID();
	await db.transaction(async (tx) => {
		await tx.insert(document).values({ id: docId, bodyHtml: page.body ?? '' });
		await tx.update(wikiPage).set({ documentId: docId }).where(eq(wikiPage.id, pageId));
	});
	return docId;
}

// Most recently edited pages (folders excluded) — drives the /wiki landing
// view's "Recent" shortcuts. There's no per-user view tracking, so updatedAt
// is the closest available signal for "what you were just working on".
export async function getRecentWikiPages(limit = 5) {
	return db
		.select({
			id: wikiPage.id,
			title: wikiPage.title,
			icon: wikiPage.icon,
			parentId: wikiPage.parentId
		})
		.from(wikiPage)
		.where(eq(wikiPage.isFolder, false))
		.orderBy(desc(wikiPage.updatedAt))
		.limit(limit);
}

export async function getFirstRootPageId(): Promise<string | null> {
	const [row] = await db
		.select({ id: wikiPage.id })
		.from(wikiPage)
		.where(isNull(wikiPage.parentId))
		.orderBy(asc(wikiPage.sortOrder), asc(wikiPage.title))
		.limit(1);
	return row?.id ?? null;
}

async function nextSortOrder(parentId: string | null): Promise<number> {
	const [row] = await db
		.select({ max: sql<number>`coalesce(max(${wikiPage.sortOrder}), -1)` })
		.from(wikiPage)
		.where(parentId ? eq(wikiPage.parentId, parentId) : isNull(wikiPage.parentId));
	return (row?.max ?? -1) + 1;
}

export type CreateWikiInput = {
	title: string;
	parentId: string | null;
	isFolder: boolean;
	icon?: string;
	body?: string;
	authorId: string;
};

export async function createWikiPage(input: CreateWikiInput) {
	const id = crypto.randomUUID();
	const sortOrder = await nextSortOrder(input.parentId);
	// Pages get a collaborative document up front; folders stay doc-less until a
	// description is added (ensureDocumentForPage creates one lazily then).
	const docId = input.isFolder ? null : crypto.randomUUID();
	await db.transaction(async (tx) => {
		if (docId) await tx.insert(document).values({ id: docId, bodyHtml: input.body ?? '' });
		await tx.insert(wikiPage).values({
			id,
			parentId: input.parentId,
			title: input.title,
			icon: input.icon ?? (input.isFolder ? 'folder' : 'book'),
			isFolder: input.isFolder,
			body: input.body ?? '',
			documentId: docId,
			authorId: input.authorId,
			updatedById: input.authorId,
			sortOrder
		});
	});
	return id;
}

export type UpdateWikiInput = Partial<{
	title: string;
	icon: string;
	body: string;
	parentId: string | null;
}>;

export async function updateWikiPage(
	id: string,
	patch: UpdateWikiInput,
	updatedById: string
): Promise<void> {
	await db
		.update(wikiPage)
		.set({ ...patch, updatedById })
		.where(eq(wikiPage.id, id));
}

export async function deleteWikiPage(id: string): Promise<void> {
	// Deleting a page cascades to its child pages (parent_id FK). Collect the
	// linked documents across the whole subtree first so they don't orphan, then
	// delete the root (cascading the rows) and finally the documents.
	const all = await db
		.select({ id: wikiPage.id, parentId: wikiPage.parentId, documentId: wikiPage.documentId })
		.from(wikiPage);

	const subtree = new Set<string>([id]);
	const stack = [id];
	while (stack.length) {
		const cur = stack.pop()!;
		for (const r of all)
			if (r.parentId === cur && !subtree.has(r.id)) {
				subtree.add(r.id);
				stack.push(r.id);
			}
	}
	const docIds = all.filter((r) => subtree.has(r.id) && r.documentId).map((r) => r.documentId!);

	await db.transaction(async (tx) => {
		await tx.delete(wikiPage).where(eq(wikiPage.id, id));
		if (docIds.length) await tx.delete(document).where(inArray(document.id, docIds));
	});

	// Remove embedded-image attachments for every page in the deleted subtree.
	// (wiki attachments are not FK-linked, so they don't cascade.)
	for (const pageId of subtree) await deleteAttachmentsFor('wiki_page', pageId);
}

export type MoveWikiInput = {
	id: string;
	parentId: string | null;
	/** Ordered ids of all siblings under the target parent, including the moved item. */
	orderedIds: string[];
	updatedById: string;
};

/**
 * Reparents a page/folder and renumbers siblings under the target parent.
 * Guards against cycles (a folder cannot be moved into its own descendant) and
 * only allows folders to receive children. Pure reordering does not touch
 * `updatedAt`; the moved item's `updatedAt`/`updatedById` are bumped.
 */
export async function moveWikiPage(input: MoveWikiInput): Promise<void> {
	const { id, parentId, orderedIds, updatedById } = input;

	const all = await db
		.select({ id: wikiPage.id, parentId: wikiPage.parentId, isFolder: wikiPage.isFolder })
		.from(wikiPage);

	const moved = all.find((r) => r.id === id);
	if (!moved) throw new Error('Page not found.');

	if (parentId) {
		if (parentId === id) throw new Error('Cannot move an item into itself.');
		const parent = all.find((r) => r.id === parentId);
		if (!parent) throw new Error('Target folder not found.');
		if (!parent.isFolder) throw new Error('Only folders can contain pages.');

		// Reject dropping a folder into one of its own descendants.
		const descendants = new Set<string>();
		const stack = [id];
		while (stack.length) {
			const cur = stack.pop()!;
			for (const r of all)
				if (r.parentId === cur && !descendants.has(r.id)) {
					descendants.add(r.id);
					stack.push(r.id);
				}
		}
		if (descendants.has(parentId)) throw new Error('Cannot move a folder into its own subtree.');
	}

	await db.transaction(async (tx) => {
		await tx.update(wikiPage).set({ parentId, updatedById }).where(eq(wikiPage.id, id));
		// Renumber siblings without bumping updatedAt (raw SQL bypasses $onUpdate).
		for (let i = 0; i < orderedIds.length; i++) {
			await tx.execute(
				sql`update wiki_page set sort_order = ${i} where id = ${orderedIds[i]}`
			);
		}
	});
}
