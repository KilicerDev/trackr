// In-process Hocuspocus (Yjs) server. Feature-agnostic: it only ever deals with
// the `document` table by id (the Hocuspocus `documentName` IS `document.id`).
//
// - onAuthenticate: validate the short-lived collab token + Trackr-team access,
//   and that the document is linked to a real wiki page.
// - Database.fetch/store: load/persist the Yjs binary; on store, derive the
//   `body_html` read-model so SSR/no-JS rendering stays correct.
// - onLoadDocument: lazily seed a never-edited doc from its `body_html`.

import { Hocuspocus } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { generateHTML } from '@tiptap/html';
import { getSchema } from '@tiptap/core';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { JSDOM } from 'jsdom';
import * as Y from 'yjs';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { document, wikiPage } from '$lib/server/db/app.schema';
import { collabSchemaExtensions, COLLAB_FIELD } from '$lib/collab/extensions';
import { resolveCollabSession } from './auth';

declare global {
	var __hocuspocus: Hocuspocus | undefined;
}

function deriveHtml(state: Uint8Array): string {
	const ydoc = new Y.Doc();
	Y.applyUpdate(ydoc, state);
	const json = TiptapTransformer.fromYdoc(ydoc, COLLAB_FIELD);
	ydoc.destroy();
	return generateHTML(json, collabSchemaExtensions);
}

// Parse stored HTML into ProseMirror JSON. We don't use @tiptap/html's
// generateJSON here: its server DOM (zeed-dom) can't handle the Link extension's
// case-insensitive `:not()` parse selector under Bun. jsdom parses it correctly.
function htmlToProseMirrorJSON(html: string): Record<string, unknown> {
	const schema = getSchema(collabSchemaExtensions);
	const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
	const node = PMDOMParser.fromSchema(schema).parse(dom.window.document.body);
	return node.toJSON();
}

function build(): Hocuspocus {
	return new Hocuspocus({
		name: 'trackr-collab',

		async onAuthenticate({ token, documentName, context }) {
			const session = await resolveCollabSession(token);
			if (!session.isTrackrTeam) throw new Error('forbidden');
			// documentName === document.id — confirm a wiki page references it.
			const [link] = await db
				.select({ pageId: wikiPage.id })
				.from(wikiPage)
				.where(eq(wikiPage.documentId, documentName))
				.limit(1);
			if (!link) throw new Error('not found');
			// Stash for store() so we can attribute the edit.
			context.userId = session.userId;
			context.pageId = link.pageId;
			return { userId: session.userId, pageId: link.pageId };
		},

		extensions: [
			new Database({
				fetch: async ({ documentName }) => {
					const [row] = await db
						.select({ ydoc: document.ydoc })
						.from(document)
						.where(eq(document.id, documentName))
						.limit(1);
					return row?.ydoc ?? null;
				},
				store: async ({ documentName, state, lastContext }) => {
					const html = deriveHtml(state);
					await db
						.update(document)
						.set({ ydoc: state, bodyHtml: html, updatedAt: new Date() })
						.where(eq(document.id, documentName));
					// Keep the wiki row's "edited" signal fresh for list/recent views,
					// attributed to the most recent editor.
					const userId = (lastContext as { userId?: string } | undefined)?.userId;
					await db
						.update(wikiPage)
						.set({ body: html, ...(userId ? { updatedById: userId } : {}) })
						.where(eq(wikiPage.documentId, documentName));
				}
			})
		],

		// Seed a fresh Y.Doc from the existing HTML the first time a legacy page
		// is opened (the Database extension applies stored state before this, so
		// only act when nothing was loaded).
		async onLoadDocument({ documentName, document: ydoc }) {
			if (ydoc.get(COLLAB_FIELD, Y.XmlFragment).length > 0) return;
			const [row] = await db
				.select({ bodyHtml: document.bodyHtml })
				.from(document)
				.where(eq(document.id, documentName))
				.limit(1);
			if (!row?.bodyHtml) return;
			// toYdoc expects ProseMirror JSON, so parse the stored HTML first.
			const json = htmlToProseMirrorJSON(row.bodyHtml);
			const seeded = TiptapTransformer.toYdoc(json, COLLAB_FIELD, collabSchemaExtensions);
			Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seeded));
			seeded.destroy();
			return ydoc;
		},

		debounce: 2000,
		maxDebounce: 10000
	});
}

/** Process-wide singleton; guarded on globalThis so HMR doesn't spin up duplicates. */
export function getHocuspocus(): Hocuspocus {
	return (globalThis.__hocuspocus ??= build());
}
