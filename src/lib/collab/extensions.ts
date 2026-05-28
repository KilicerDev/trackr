// Single source of truth for the wiki document's ProseMirror schema.
//
// Imported by BOTH the client editor (CollaborativeWikiEditor) and the server
// transformer (Hocuspocus store/seed). The Yjs<->ProseMirror conversion is only
// lossless if both sides agree on the exact node/mark set, so anything that adds
// nodes or marks MUST live here — never client-only.
//
// Presentation-only extensions (Placeholder, SlashCommand, CollaborationCaret)
// are deliberately excluded: they add no schema and would pull DOM-only code
// into the Node server bundle.

import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import type { Extensions } from '@tiptap/core';

/** The Yjs field name the document is stored under; must match Collaboration's `field`. */
export const COLLAB_FIELD = 'default';

export const collabSchemaExtensions: Extensions = [
	// StarterKit v3 bundles Link, so it's configured here (not added separately)
	// to avoid a duplicate-extension schema clash. `undoRedo: false` disables
	// StarterKit's history — Collaboration provides its own Yjs-aware undo;
	// leaving both on corrupts the shared document.
	StarterKit.configure({
		heading: { levels: [1, 2, 3] },
		undoRedo: false,
		link: {
			openOnClick: false,
			autolink: true,
			HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
		}
	}),
	TaskList,
	TaskItem.configure({ nested: true })
];
