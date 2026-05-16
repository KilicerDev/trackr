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
