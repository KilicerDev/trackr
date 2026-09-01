// Client-only wiki image upload: paste, drop, and a slash-command picker.
//
// The `image` *node* lives in the shared collab schema (extensions.ts) so the
// Yjs<->ProseMirror conversion and server-side HTML derivation both know it.
// THIS extension is presentation-only (commands + paste/drop plugins) and is
// therefore added client-side alongside SlashCommand — never in the shared
// schema, which would drag DOM/fetch code into the Node server bundle.
//
// Uploaded images are stored as normal attachments (entity_type='wiki_page')
// and referenced by their stable `/api/attachments/<id>` URL — never inline
// data: URIs, which would bloat the CRDT and the derived body_html.

import { Extension, type Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { showToast } from '$lib/stores/toast.svelte';
import { MAX_UPLOAD_BYTES, formatBytes, type AttachmentEntityType } from '$lib/config/attachments';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		wikiImageUpload: {
			/** Open a file picker and insert the chosen image(s). */
			openWikiImagePicker: () => ReturnType;
		};
	}
}

export interface WikiImageUploadOptions {
	/** The id these uploads attach to (wiki_page id, note id, …). */
	entityId: string;
	/** Polymorphic parent kind; defaults to wiki pages. */
	entityType: AttachmentEntityType;
}

/** Upload one image file and insert it at the current selection. */
async function uploadAndInsert(
	editor: Editor,
	entityType: AttachmentEntityType,
	entityId: string,
	file: File
): Promise<void> {
	if (!file.type.startsWith('image/')) {
		showToast('err', 'Only images can be embedded here.');
		return;
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		showToast('err', `"${file.name}" exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`);
		return;
	}
	const form = new FormData();
	form.set('entityType', entityType);
	form.set('entityId', entityId);
	form.set('file', file);
	const res = await fetch('/api/attachments', { method: 'POST', body: form });
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { message?: string } | null;
		showToast('err', body?.message ?? `Failed to upload "${file.name}".`);
		return;
	}
	const { attachment } = (await res.json()) as { attachment: { id: string; filename: string } };
	editor
		.chain()
		.focus()
		.setImage({ src: `/api/attachments/${attachment.id}`, alt: attachment.filename })
		.run();
}

/** Pull image files out of a paste/drop payload. */
function imageFiles(list: FileList | null | undefined): File[] {
	if (!list) return [];
	return Array.from(list).filter((f) => f.type.startsWith('image/'));
}

export const WikiImageUpload = Extension.create<WikiImageUploadOptions>({
	name: 'wikiImageUpload',

	addOptions() {
		return { entityId: '', entityType: 'wiki_page' as AttachmentEntityType };
	},

	addCommands() {
		return {
			openWikiImagePicker:
				() =>
				({ editor }) => {
					const { entityId, entityType } = this.options;
					const input = document.createElement('input');
					input.type = 'file';
					input.accept = 'image/*';
					input.multiple = true;
					input.style.display = 'none';
					input.addEventListener('change', () => {
						for (const file of imageFiles(input.files))
							void uploadAndInsert(editor, entityType, entityId, file);
						input.remove();
					});
					document.body.appendChild(input);
					input.click();
					return true;
				}
		};
	},

	addProseMirrorPlugins() {
		const editor = this.editor;
		const { entityId, entityType } = this.options;
		return [
			new Plugin({
				props: {
					handlePaste: (_view, event) => {
						const files = imageFiles(event.clipboardData?.files);
						if (!files.length) return false; // let normal paste proceed
						event.preventDefault();
						for (const file of files) void uploadAndInsert(editor, entityType, entityId, file);
						return true;
					},
					handleDrop: (_view, event, _slice, moved) => {
						// An internal node move is never an upload — Chrome puts the
						// dragged image's FILE into the dataTransfer, so without this
						// guard moving an embedded image would re-upload a duplicate.
						if (moved) return false;
						const dt = (event as DragEvent).dataTransfer;
						const files = imageFiles(dt?.files);
						if (!files.length) return false;
						event.preventDefault();
						for (const file of files) void uploadAndInsert(editor, entityType, entityId, file);
						return true;
					}
				}
			})
		];
	}
});
