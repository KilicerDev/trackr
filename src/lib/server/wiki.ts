import { asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { wikiPage } from './db/app.schema';

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
	await db.insert(wikiPage).values({
		id,
		parentId: input.parentId,
		title: input.title,
		icon: input.icon ?? (input.isFolder ? 'folder' : 'book'),
		isFolder: input.isFolder,
		body: input.body ?? '',
		authorId: input.authorId,
		updatedById: input.authorId,
		sortOrder
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
	await db.delete(wikiPage).where(eq(wikiPage.id, id));
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
