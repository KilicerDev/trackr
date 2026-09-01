// Client-side node views for embedded media (images + file chips): hover
// controls with a download button and a confirm-guarded delete, built with
// plain DOM plus the app's own Icon/confirm/toast — no extra dependencies.
//
// The *schema* for both nodes stays in $lib/editor/extensions.ts (shared with
// the server-side Yjs transformer); these extensions only add `addNodeView`,
// which is view-only and never runs on the server. CollaborativeWikiEditor
// swaps these in for the plain schema nodes.

import { mount, unmount } from 'svelte';
import Image from '@tiptap/extension-image';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { FileAttachment } from '$lib/editor/extensions';
import Icon from '../Icon.svelte';
import { confirm } from '../confirm.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { formatBytes } from '$lib/config/attachments';
import { m } from '$lib/paraglide/messages';

/** `/api/attachments/<id>` → id, or null for any other (external) src. */
function attachmentIdFromSrc(src: string): string | null {
	return /^\/api\/attachments\/([A-Za-z0-9-]+)$/.exec(src)?.[1] ?? null;
}

type ActionRefs = {
	root: HTMLElement;
	download: HTMLAnchorElement;
	destroy: () => void;
};

/**
 * The hover control block: a download link and a delete button. The delete
 * button carries `.wiki-media-delete` so CSS can hide it in read-only editors.
 */
function buildActions(opts: {
	filename: () => string;
	downloadHref: () => string | null;
	onDelete: () => void;
}): ActionRefs {
	const root = document.createElement('div');
	root.className = 'wiki-media-actions';
	root.contentEditable = 'false';

	const download = document.createElement('a');
	download.className = 'wiki-media-btn';
	download.setAttribute('download', '');
	download.ariaLabel = m.attach_download({ filename: opts.filename() });
	const downloadIcon = mount(Icon, { target: download, props: { name: 'download', size: 14 } });

	const del = document.createElement('button');
	del.type = 'button';
	del.className = 'wiki-media-btn wiki-media-delete';
	del.ariaLabel = m.attach_delete_file({ filename: opts.filename() });
	const trashIcon = mount(Icon, { target: del, props: { name: 'trash', size: 14 } });
	del.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		opts.onDelete();
	});

	root.append(download, del);
	return {
		root,
		download,
		destroy: () => {
			void unmount(downloadIcon);
			void unmount(trashIcon);
		}
	};
}

/**
 * Confirm, delete the stored attachment (when there is one), then remove the
 * node from the document.
 */
async function confirmAndDelete(opts: {
	editor: Editor;
	getPos: () => number | undefined;
	node: () => PMNode;
	attachmentId: string | null;
	filename: string;
}): Promise<void> {
	const ok = await confirm({
		title: m.attach_delete_title(),
		message: m.attach_delete_message({ filename: opts.filename }),
		confirmLabel: m.common_delete(),
		tone: 'danger',
		icon: 'trash'
	});
	if (!ok) return;
	if (opts.attachmentId) {
		const res = await fetch(`/api/attachments/${opts.attachmentId}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { message?: string } | null;
			showToast('err', body?.message ?? m.attach_delete_failed());
			return;
		}
	}
	const pos = opts.getPos();
	if (typeof pos !== 'number') return;
	opts.editor
		.chain()
		.focus()
		.deleteRange({ from: pos, to: pos + opts.node().nodeSize })
		.run();
}

/** Events inside the control block belong to the controls, never to PM. */
function stopActionEvents(event: Event): boolean {
	return event.target instanceof Element && !!event.target.closest('.wiki-media-actions');
}

/**
 * Clicking the media body selects the node (accent ring). Bound to `click` so
 * it runs AFTER ProseMirror's mouseup selection handling (which would replace
 * an earlier mousedown-time NodeSelection with a text caret); browsers never
 * fire click after a completed drag, so drag-to-move is unaffected.
 */
function selectOnClick(wrap: HTMLElement, editor: Editor, getPos: () => number | undefined) {
	wrap.addEventListener('click', (e) => {
		if (stopActionEvents(e)) return;
		const pos = getPos();
		if (typeof pos !== 'number') return;
		editor.chain().focus().setNodeSelection(pos).run();
	});
}

export const WikiImageWithControls = Image.extend({
	addNodeView() {
		return ({ node, editor, getPos }) => {
			let current = node;

			const wrap = document.createElement('div');
			wrap.className = 'wiki-media wiki-image-wrap';
			// The wrapper is the drag handle; the inner img must not start its own
			// native drag (Chrome puts the image FILE into that drag's dataTransfer,
			// which the upload plugin would mistake for a fresh drop).
			wrap.draggable = true;

			const img = document.createElement('img');
			img.className = 'wiki-image';
			img.draggable = false;

			const actions = buildActions({
				filename: () => (current.attrs.alt as string) || 'image',
				downloadHref: () => {
					const id = attachmentIdFromSrc(current.attrs.src as string);
					return id ? `/api/attachments/${id}/download` : null;
				},
				onDelete: () =>
					void confirmAndDelete({
						editor,
						getPos,
						node: () => current,
						attachmentId: attachmentIdFromSrc(current.attrs.src as string),
						filename: (current.attrs.alt as string) || 'image'
					})
			});

			const sync = () => {
				img.src = current.attrs.src as string;
				img.alt = (current.attrs.alt as string) ?? '';
				const href = attachmentIdFromSrc(current.attrs.src as string)
					? `/api/attachments/${attachmentIdFromSrc(current.attrs.src as string)}/download`
					: null;
				// External images have no stored attachment: nothing to download/delete.
				actions.root.hidden = !href;
				if (href) actions.download.href = href;
			};
			sync();

			selectOnClick(wrap, editor, getPos);
			wrap.append(img, actions.root);
			return {
				dom: wrap,
				update: (updated: PMNode) => {
					if (updated.type.name !== 'image') return false;
					current = updated;
					sync();
					return true;
				},
				stopEvent: stopActionEvents,
				destroy: actions.destroy
			};
		};
	}
}).configure({ allowBase64: false, HTMLAttributes: { class: 'wiki-image' } });

export const FileAttachmentWithControls = FileAttachment.extend({
	addNodeView() {
		return ({ node, editor, getPos }) => {
			let current = node;

			const wrap = document.createElement('div');
			wrap.className = 'wiki-media wiki-file';
			wrap.draggable = true;

			const clip = document.createElement('span');
			clip.className = 'wiki-file__clip';
			clip.textContent = '📎';
			const name = document.createElement('span');
			name.className = 'wiki-file__name';
			const size = document.createElement('span');
			size.className = 'wiki-file__size';

			const actions = buildActions({
				filename: () => current.attrs.filename as string,
				downloadHref: () => `/api/attachments/${current.attrs.id}/download`,
				onDelete: () =>
					void confirmAndDelete({
						editor,
						getPos,
						node: () => current,
						attachmentId: current.attrs.id as string,
						filename: current.attrs.filename as string
					})
			});

			const sync = () => {
				name.textContent = current.attrs.filename as string;
				const bytes = Number(current.attrs.size) || 0;
				size.textContent = bytes ? formatBytes(bytes) : '';
				actions.download.href = `/api/attachments/${current.attrs.id}/download`;
			};
			sync();

			selectOnClick(wrap, editor, getPos);
			wrap.append(clip, name, size, actions.root);
			return {
				dom: wrap,
				update: (updated: PMNode) => {
					if (updated.type.name !== 'fileAttachment') return false;
					current = updated;
					sync();
					return true;
				},
				stopEvent: stopActionEvents,
				destroy: actions.destroy
			};
		};
	}
});
