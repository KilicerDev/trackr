// Replace a collaborative document's content from HTML — the server-side
// write path for wiki pages and notes (MCP tools). The Yjs doc is the source
// of truth once it exists, so:
//   - no `ydoc` yet → write `body_html` only; Hocuspocus seeds the Y.Doc from
//     it on first open (onLoadDocument).
//   - `ydoc` present and a Hocuspocus instance is running in this process →
//     open a direct connection and swap the `default` fragment's content in
//     a transaction. Connected editors receive the update live; the Database
//     extension persists (immediately, on disconnect) and re-derives
//     `body_html` + touches the owning row via the store hook.
//   - `ydoc` present but no instance (worker context) → build a fresh Y.Doc
//     from the HTML and overwrite `ydoc` + `body_html` directly.
// In every case `body_html` and the owning wiki_page/note row are updated
// here too, so a read straight after the write is consistent regardless of
// the store hook's timing.

import { TiptapTransformer } from '@hocuspocus/transformer';
import { getSchema } from '@tiptap/core';
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { document, note, wikiPage } from '$lib/server/db/app.schema';
import { collabSchemaExtensions, COLLAB_FIELD } from '$lib/editor/extensions';
import { touchNoteByDocument } from '$lib/server/notes';
import { getRunningHocuspocus, htmlToProseMirrorJSON } from './hocuspocus';

type Owner = { entityType: 'wiki_page' | 'note'; entityId: string } | null;

async function resolveOwner(documentId: string): Promise<Owner> {
	const [page] = await db
		.select({ id: wikiPage.id })
		.from(wikiPage)
		.where(eq(wikiPage.documentId, documentId))
		.limit(1);
	if (page) return { entityType: 'wiki_page', entityId: page.id };
	const [n] = await db
		.select({ id: note.id })
		.from(note)
		.where(eq(note.documentId, documentId))
		.limit(1);
	if (n) return { entityType: 'note', entityId: n.id };
	return null;
}

/**
 * Replace the whole content of `documentId` with `html` (already sanitized
 * document HTML, e.g. from `markdownToDocHtml`), attributed to `userId`.
 * Throws if the document row does not exist.
 */
export async function replaceDocumentHtml(
	documentId: string,
	html: string,
	userId: string
): Promise<void> {
	const [row] = await db
		.select({ ydoc: document.ydoc })
		.from(document)
		.where(eq(document.id, documentId))
		.limit(1);
	if (!row) throw new Error('Document not found.');
	const owner = await resolveOwner(documentId);

	if (row.ydoc && row.ydoc.length > 0) {
		const json = htmlToProseMirrorJSON(html);
		const hocuspocus = getRunningHocuspocus();
		if (hocuspocus) {
			const conn = await hocuspocus.openDirectConnection(documentId, {
				userId,
				entityType: owner?.entityType ?? 'wiki_page',
				entityId: owner?.entityId ?? null
			});
			try {
				const schema = getSchema(collabSchemaExtensions);
				await conn.transact((doc) => {
					// Diffs the new ProseMirror tree into the existing fragment in
					// place (y-prosemirror's updateYFragment), so the change is a
					// normal collaborative edit rather than a wholesale reset.
					prosemirrorJSONToYXmlFragment(schema, json, doc.getXmlFragment(COLLAB_FIELD));
				});
			} finally {
				// Stores immediately (Database extension) and unloads when no
				// editor is connected.
				await conn.disconnect();
			}
		} else {
			const fresh = TiptapTransformer.toYdoc(json, COLLAB_FIELD, collabSchemaExtensions);
			const state = Y.encodeStateAsUpdate(fresh);
			fresh.destroy();
			await db
				.update(document)
				.set({ ydoc: state, bodyHtml: html, updatedAt: new Date() })
				.where(eq(document.id, documentId));
		}
	}

	// Read model + owner bookkeeping, mirroring the Hocuspocus store hook.
	await db
		.update(document)
		.set({ bodyHtml: html, updatedAt: new Date() })
		.where(eq(document.id, documentId));
	if (owner?.entityType === 'note') {
		await touchNoteByDocument(documentId, userId);
	} else if (owner?.entityType === 'wiki_page') {
		await db
			.update(wikiPage)
			.set({ body: html, updatedById: userId })
			.where(eq(wikiPage.documentId, documentId));
	}
}
