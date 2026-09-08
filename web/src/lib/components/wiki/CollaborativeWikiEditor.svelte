<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Editor } from '@tiptap/core';
	import Placeholder from '@tiptap/extension-placeholder';
	import Collaboration from '@tiptap/extension-collaboration';
	import CollaborationCaret from '@tiptap/extension-collaboration-caret';
	import { HocuspocusProvider, type WebSocketStatus } from '@hocuspocus/provider';
	import * as Y from 'yjs';
	import { collabSchemaExtensions, COLLAB_FIELD } from '$lib/editor/extensions';
	import { SlashCommand } from './slash-command.svelte';
	import { WikiImageUpload } from './image-upload';
	import { WikiFileUpload } from './file-upload';
	import { FileAttachmentWithControls, WikiImageWithControls } from './media-node-views';
	import { MarkdownPaste } from './markdown-paste';
	import { BlockGutter } from './block-gutter';
	import { ClipboardTaskLists } from './clipboard-tasks';
	import { NOTE_FILE_EXTENSIONS, type AttachmentEntityType } from '$lib/config/attachments';
	import { m } from '$lib/paraglide/messages';
	import './wiki-editor.css';

	export type PresenceUser = { clientId: number; isSelf: boolean; name: string; color: string };

	interface Props {
		/** The collaborative document id (wiki_page.documentId / note.documentId). */
		documentId: string;
		/** The parent entity id — used to scope uploaded image attachments. */
		pageId: string;
		/** Polymorphic attachment parent kind. Defaults to wiki pages. */
		entityType?: AttachmentEntityType;
		/** Identity shown on this user's remote caret. */
		user: { name: string; color: string };
		editable?: boolean;
		placeholder?: string;
		onUpdate?: (editor: Editor) => void;
		onReady?: (editor: Editor) => void;
		onStatus?: (status: WebSocketStatus) => void;
		/** Live collaborators currently connected to this document (incl. self). */
		onPresence?: (users: PresenceUser[]) => void;
	}
	let {
		documentId,
		pageId,
		entityType = 'wiki_page',
		user,
		editable = true,
		placeholder = m.wiki_editor_placeholder_commands(),
		onUpdate,
		onReady,
		onStatus,
		onPresence
	}: Props = $props();

	let host: HTMLDivElement | undefined = $state();
	let editor: Editor | undefined;
	let provider: HocuspocusProvider | undefined;
	let ydoc: Y.Doc | undefined;

	function collabUrl(): string {
		const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
		return `${proto}//${location.host}/collab`;
	}

	// The session cookie is httpOnly, so the provider fetches a short-lived collab
	// token from a cookie-authenticated endpoint. Returning a function lets the
	// provider re-fetch on every (re)connect, so expiry is handled transparently.
	async function fetchToken(): Promise<string> {
		const res = await fetch('/collab-token');
		if (!res.ok) throw new Error(m.wiki_collab_token_error());
		return (await res.json()).token as string;
	}

	onMount(() => {
		if (!host) return;
		ydoc = new Y.Doc();
		provider = new HocuspocusProvider({
			url: collabUrl(),
			name: documentId,
			document: ydoc,
			token: fetchToken
		});
		provider.on('status', (e: { status: WebSocketStatus }) => onStatus?.(e.status));

		if (onPresence) {
			const awareness = provider.awareness;
			const emit = () => {
				const self = awareness?.clientID;
				const users: PresenceUser[] = [];
				awareness?.getStates().forEach((state, clientId) => {
					const u = (state as { user?: { name?: string; color?: string } }).user;
					if (!u) return;
					users.push({
						clientId,
						isSelf: clientId === self,
						name: u.name ?? m.wiki_presence_someone(),
						color: u.color ?? '#888'
					});
				});
				onPresence(users);
			};
			awareness?.on('change', emit);
			emit();
		}

		editor = new Editor({
			element: host,
			editable,
			editorProps: {
				// Suppress the browser's native red-squiggle spellcheck in the editor.
				attributes: { spellcheck: 'false' },
				// Links use openOnClick:false (so their text stays editable), which
				// means a plain click only moves the caret. Intercept it: navigate
				// internal app links in-place via the SPA router, open external links
				// (and any ⌘/Ctrl-click) in a new tab.
				handleClick: (_view, _pos, event) => {
					const anchor = (event.target as HTMLElement | null)?.closest?.('a');
					const href = anchor?.getAttribute('href');
					if (!href) return false;
					if (/^https?:\/\//i.test(href) || event.metaKey || event.ctrlKey) {
						window.open(href, '_blank', 'noopener,noreferrer');
					} else {
						void goto(href);
					}
					return true;
				}
			},
			extensions: [
				// The media nodes are swapped for versions with hover-control node
				// views (same schema — addNodeView is view-only, so the server-side
				// Yjs transformer stays in lockstep).
				...collabSchemaExtensions.filter((e) => e.name !== 'image' && e.name !== 'fileAttachment'),
				WikiImageWithControls,
				FileAttachmentWithControls,
				Collaboration.configure({ document: ydoc, field: COLLAB_FIELD }),
				CollaborationCaret.configure({ provider, user }),
				Placeholder.configure({
					// The empty first line carries the page's own prompt; any other empty
					// block the caret sits in hints at its type / the slash menu, like
					// Notion. Children included so items inside lists get one too.
					includeChildren: true,
					placeholder: ({ editor, node, pos }) => {
						if (node.type.name === 'heading') {
							return m.editor_placeholder_heading({ level: String(node.attrs.level) });
						}
						if (editor.isEmpty) return placeholder;
						const parent = editor.state.doc.resolve(pos).parent;
						if (parent.type.name === 'taskItem') return m.editor_placeholder_todo();
						if (parent.type.name === 'listItem') return m.editor_placeholder_list();
						return m.wiki_editor_placeholder_commands();
					}
				}),
				SlashCommand,
				BlockGutter.configure({ addLabel: m.editor_gutter_add() }),
				ClipboardTaskLists,
				WikiImageUpload.configure({ entityId: pageId, entityType }),
				WikiFileUpload.configure({
					entityId: pageId,
					entityType,
					// Notes restrict document formats (server enforces the same list);
					// wiki pages accept any file type, like ticket/task attachments.
					allowedExtensions: entityType === 'note' ? NOTE_FILE_EXTENSIONS : undefined
				}),
				MarkdownPaste
			],
			onUpdate: ({ editor }) => onUpdate?.(editor),
			onCreate: ({ editor }) => onReady?.(editor)
		});
	});

	$effect(() => {
		if (editor && editor.isEditable !== editable) editor.setEditable(editable);
	});

	$effect(() => {
		// Keep the caret label/color in sync if the user identity changes.
		if (editor && provider) editor.commands.updateUser(user);
	});

	onDestroy(() => {
		editor?.destroy();
		editor = undefined;
		provider?.destroy();
		provider = undefined;
		ydoc?.destroy();
		ydoc = undefined;
	});
</script>

<div bind:this={host} class="wiki-editor"></div>
