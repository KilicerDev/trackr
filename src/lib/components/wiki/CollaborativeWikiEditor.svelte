<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import Placeholder from '@tiptap/extension-placeholder';
	import Collaboration from '@tiptap/extension-collaboration';
	import CollaborationCaret from '@tiptap/extension-collaboration-caret';
	import { HocuspocusProvider, type WebSocketStatus } from '@hocuspocus/provider';
	import * as Y from 'yjs';
	import { collabSchemaExtensions, COLLAB_FIELD } from '$lib/collab/extensions';
	import { SlashCommand } from './slash-command.svelte';
	import { WikiImageUpload } from './image-upload';
	import type { AttachmentEntityType } from '$lib/attachments/config';
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
			extensions: [
				...collabSchemaExtensions,
				Collaboration.configure({ document: ydoc, field: COLLAB_FIELD }),
				CollaborationCaret.configure({ provider, user }),
				Placeholder.configure({ placeholder }),
				SlashCommand,
				WikiImageUpload.configure({ entityId: pageId, entityType })
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
