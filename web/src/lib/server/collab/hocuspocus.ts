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
import { getSchema } from '@tiptap/core';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { JSDOM } from 'jsdom';
import * as Y from 'yjs';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { document, note, wikiPage } from '$lib/server/db/app.schema';
import { collabSchemaExtensions, COLLAB_FIELD } from '$lib/editor/extensions';
import { resolveCollabSession } from './auth';
import { deriveHtml } from './derive';
import { resolveNoteRole, touchNoteByDocument } from '$lib/server/notes';

declare global {
	var __hocuspocus: Hocuspocus | undefined;
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

		async onAuthenticate({ token, documentName, context, connectionConfig }) {
			const session = await resolveCollabSession(token);
			// The whole collab surface (wiki + notes) is internal-team gated.
			if (!session.isTrackrTeam) throw new Error('forbidden');
			// documentName === document.id — confirm a wiki page references it.
			// documentName === document.id. It belongs to exactly one feature row:
			// a wiki page (team-wide) or a note (owner / shared / project-scoped).
			const [page] = await db
				.select({ id: wikiPage.id })
				.from(wikiPage)
				.where(eq(wikiPage.documentId, documentName))
				.limit(1);
			if (page) {
				context.userId = session.userId;
				context.entityType = 'wiki_page';
				context.entityId = page.id;
				return { userId: session.userId };
			}

			const [n] = await db
				.select({
					id: note.id,
					kind: note.kind,
					ownerId: note.ownerId,
					projectId: note.projectId
				})
				.from(note)
				.where(eq(note.documentId, documentName))
				.limit(1);
			if (n) {
				const role = await resolveNoteRole(n, session.userId, session.memberships);
				if (!role) throw new Error('forbidden');
				// Read-only grants connect but can't mutate — Hocuspocus enforces it.
				if (role === 'read') connectionConfig.readOnly = true;
				context.userId = session.userId;
				context.entityType = 'note';
				context.entityId = n.id;
				return { userId: session.userId };
			}

			throw new Error('not found');
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
					// `ydoc` is the source of truth and MUST always persist. The HTML
					// read-model is derived best-effort: deriving it can throw in the
					// bundled prod runtime (tiptap/prosemirror dual-package), and that
					// must never block saving the actual document state.
					let html: string | null = null;
					try {
						html = deriveHtml(state);
					} catch (e) {
						console.warn(`[collab] deriveHtml failed for ${documentName}; saving ydoc only:`, e);
					}
					await db
						.update(document)
						.set({
							ydoc: state,
							...(html !== null ? { bodyHtml: html } : {}),
							updatedAt: new Date()
						})
						.where(eq(document.id, documentName));
					// Keep the owning row's "edited" signal fresh for list/recent views,
					// attributed to the most recent editor. The document belongs to either
					// a wiki page or a note (resolved at auth time, stashed in context).
					const ctx = lastContext as { userId?: string; entityType?: string } | undefined;
					const userId = ctx?.userId;
					if (ctx?.entityType === 'note') {
						if (userId) await touchNoteByDocument(documentName, userId);
					} else {
						const wikiPatch = {
							...(html !== null ? { body: html } : {}),
							...(userId ? { updatedById: userId } : {})
						};
						if (Object.keys(wikiPatch).length)
							await db.update(wikiPage).set(wikiPatch).where(eq(wikiPage.documentId, documentName));
					}
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
			// Seeding legacy HTML can throw (tiptap/prosemirror dual-package under the
			// bundled prod runtime). A seed failure must NOT abort the load — that
			// aborts the whole document and blocks all saving. Fall back to an empty
			// doc; once anything is typed and stored, this path is skipped.
			try {
				// toYdoc expects ProseMirror JSON, so parse the stored HTML first.
				const json = htmlToProseMirrorJSON(row.bodyHtml);
				const seeded = TiptapTransformer.toYdoc(json, COLLAB_FIELD, collabSchemaExtensions);
				Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seeded));
				seeded.destroy();
			} catch (e) {
				console.warn(`[collab] seed from HTML failed for ${documentName}; starting empty:`, e);
			}
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
