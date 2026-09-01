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
import Image from '@tiptap/extension-image';
import { Node, type Extensions } from '@tiptap/core';
import { formatBytes } from '$lib/config/attachments';

/** The Yjs field name the document is stored under; must match Collaboration's `field`. */
export const COLLAB_FIELD = 'default';

/**
 * Inline file chip: a non-image attachment embedded in the document flow
 * (dropped/pasted into notes). Serializes to an `<a data-file-attachment>`
 * pointing at the stable download URL, so derived body_html stays a working
 * link even without editor CSS. Upload/drop handling is client-only
 * (wiki/file-upload.ts) — this node is just the schema + markup.
 */
export const FileAttachment = Node.create({
	name: 'fileAttachment',
	group: 'block',
	atom: true,
	selectable: true,
	draggable: true,

	addAttributes() {
		return {
			id: { default: '' },
			filename: { default: '' },
			size: { default: 0 }
		};
	},

	parseHTML() {
		return [
			{
				tag: 'a[data-file-attachment]',
				getAttrs: (el) => ({
					id: (el as HTMLElement).getAttribute('data-file-attachment') ?? '',
					filename: (el as HTMLElement).getAttribute('data-filename') ?? '',
					size: Number((el as HTMLElement).getAttribute('data-size') ?? 0) || 0
				})
			}
		];
	},

	renderHTML({ node }) {
		const size = Number(node.attrs.size) || 0;
		return [
			'a',
			{
				'data-file-attachment': node.attrs.id as string,
				'data-filename': node.attrs.filename as string,
				'data-size': String(size),
				href: `/api/attachments/${node.attrs.id}/download`,
				download: node.attrs.filename as string,
				class: 'wiki-file'
			},
			['span', { class: 'wiki-file__name' }, node.attrs.filename as string],
			['span', { class: 'wiki-file__size' }, size ? formatBytes(size) : '']
		];
	}
});

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
	TaskItem.configure({ nested: true }),
	// Image *node* only. Embedded images reference a stable /api/attachments/<id>
	// URL (uploaded via the client-only WikiImageUpload extension); base64 data
	// URIs are disallowed to keep the CRDT and derived HTML small.
	Image.configure({ allowBase64: false, HTMLAttributes: { class: 'wiki-image' } }),
	FileAttachment
];
