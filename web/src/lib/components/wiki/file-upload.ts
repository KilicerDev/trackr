// Client-only wiki/note file upload: paste, drop, and a slash-command picker
// for NON-image files, inserted as inline `fileAttachment` chips.
//
// The `fileAttachment` *node* lives in the shared collab schema
// (extensions.ts) so the Yjs<->ProseMirror conversion and server-side HTML
// derivation both know it. THIS extension is presentation-only (commands +
// paste/drop plugins) and is added client-side — never in the shared schema.
// Images are deliberately excluded here: they belong to WikiImageUpload,
// whose plugin runs first and embeds them as pictures.

import { Extension, type Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { showToast } from '$lib/stores/toast.svelte';
import { MAX_UPLOAD_BYTES, formatBytes, type AttachmentEntityType } from '$lib/config/attachments';
import { m } from '$lib/paraglide/messages';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		wikiFileUpload: {
			/** Open a file picker and insert the chosen file(s) as chips. */
			openWikiFilePicker: () => ReturnType;
		};
	}
}

export interface WikiFileUploadOptions {
	/** The id these uploads attach to (note id, wiki_page id, …). */
	entityId: string;
	/** Polymorphic parent kind; defaults to wiki pages. */
	entityType: AttachmentEntityType;
	/** Allowed file extensions (lowercase, no dot); undefined = any type. */
	allowedExtensions?: readonly string[];
}

function extensionOf(filename: string): string {
	const dot = filename.lastIndexOf('.');
	return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

/** Upload one file and insert a chip at the current selection. */
async function uploadAndInsert(
	editor: Editor,
	opts: WikiFileUploadOptions,
	file: File
): Promise<void> {
	if (opts.allowedExtensions && !opts.allowedExtensions.includes(extensionOf(file.name))) {
		showToast('err', m.attach_type_not_allowed({ filename: file.name }));
		return;
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		showToast('err', `"${file.name}" exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`);
		return;
	}
	const form = new FormData();
	form.set('entityType', opts.entityType);
	form.set('entityId', opts.entityId);
	form.set('file', file);
	const res = await fetch('/api/attachments', { method: 'POST', body: form });
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { message?: string } | null;
		showToast('err', body?.message ?? m.attach_upload_failed({ filename: file.name }));
		return;
	}
	const { attachment } = (await res.json()) as {
		attachment: { id: string; filename: string; sizeBytes: number };
	};
	editor
		.chain()
		.focus()
		.insertContent({
			type: 'fileAttachment',
			attrs: { id: attachment.id, filename: attachment.filename, size: attachment.sizeBytes }
		})
		.run();
}

/** Pull non-image files out of a paste/drop payload (images go to WikiImageUpload). */
function nonImageFiles(list: FileList | null | undefined): File[] {
	if (!list) return [];
	return Array.from(list).filter((f) => !f.type.startsWith('image/'));
}

export const WikiFileUpload = Extension.create<WikiFileUploadOptions>({
	name: 'wikiFileUpload',

	addOptions() {
		return { entityId: '', entityType: 'wiki_page' as AttachmentEntityType };
	},

	addCommands() {
		return {
			openWikiFilePicker:
				() =>
				({ editor }) => {
					const opts = this.options;
					const input = document.createElement('input');
					input.type = 'file';
					if (opts.allowedExtensions?.length) {
						input.accept = opts.allowedExtensions.map((e) => `.${e}`).join(',');
					}
					input.multiple = true;
					input.style.display = 'none';
					input.addEventListener('change', () => {
						for (const file of nonImageFiles(input.files)) {
							void uploadAndInsert(editor, opts, file);
						}
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
		const opts = this.options;
		return [
			new Plugin({
				props: {
					handlePaste: (_view, event) => {
						const files = nonImageFiles(event.clipboardData?.files);
						if (!files.length) return false; // let normal paste proceed
						event.preventDefault();
						for (const file of files) void uploadAndInsert(editor, opts, file);
						return true;
					},
					handleDrop: (view, event, _slice, moved) => {
						// Internal node moves belong to ProseMirror, never to the uploader.
						if (moved) return false;
						const dragEvent = event as DragEvent;
						const files = nonImageFiles(dragEvent.dataTransfer?.files);
						if (!files.length) return false;
						event.preventDefault();
						// Move the caret to the drop point so the chips land where the
						// file was dropped, not wherever the selection happened to be.
						const coords = view.posAtCoords({
							left: dragEvent.clientX,
							top: dragEvent.clientY
						});
						if (coords) editor.commands.setTextSelection(coords.pos);
						for (const file of files) void uploadAndInsert(editor, opts, file);
						return true;
					}
				}
			})
		];
	}
});
