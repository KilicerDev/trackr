// Link mark shared by every Tiptap editor (messages, descriptions, wiki and
// notes). Tiptap makes Link `inclusive` whenever autolink is on, so text typed
// right after a link (spaces included) extends the link. Non-inclusive keeps a
// link to exactly what was linked; autolink still marks a URL once a space or
// punctuation follows it.
import Link from '@tiptap/extension-link';

export const EditorLink = Link.extend({
	inclusive: () => false
});

export const LINK_OPTIONS = {
	autolink: true,
	HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
} as const;
