// Derive the `body_html` read model from a document's Yjs binary.
//
// The store-time derivation in hocuspocus.ts is best-effort — it has failed
// in bundled prod runtimes (tiptap/prosemirror dual-package hazard), leaving
// documents whose only content is the Yjs state while `body_html` stays ''.
// `loadBodyHtml` is the rescue path: read endpoints call it instead of
// selecting `body_html` directly, so an empty read model is re-derived
// lazily and persisted for the next read.

import { TiptapTransformer } from '@hocuspocus/transformer';
import { generateHTML } from '@tiptap/html';
import * as Y from 'yjs';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { document } from '$lib/server/db/app.schema';
import { collabSchemaExtensions, COLLAB_FIELD } from '$lib/editor/extensions';

export function deriveHtml(state: Uint8Array): string {
	const ydoc = new Y.Doc();
	Y.applyUpdate(ydoc, state);
	const json = TiptapTransformer.fromYdoc(ydoc, COLLAB_FIELD);
	ydoc.destroy();
	return generateHTML(json, collabSchemaExtensions);
}

/**
 * Load a document's body_html; when it's empty but a Yjs state exists,
 * derive it now and persist the result so the next read is cheap. Returns
 * '' when the document is missing, genuinely empty, or derivation fails.
 */
export async function loadBodyHtml(documentId: string): Promise<string> {
	const [doc] = await db
		.select({ bodyHtml: document.bodyHtml, ydoc: document.ydoc })
		.from(document)
		.where(eq(document.id, documentId))
		.limit(1);
	if (!doc) return '';
	if (doc.bodyHtml) return doc.bodyHtml;
	if (!doc.ydoc || doc.ydoc.length === 0) return '';
	try {
		const html = deriveHtml(doc.ydoc);
		if (html) {
			await db.update(document).set({ bodyHtml: html }).where(eq(document.id, documentId));
		}
		return html;
	} catch (e) {
		console.warn(`[collab] on-demand deriveHtml failed for ${documentId}:`, e);
		return '';
	}
}
