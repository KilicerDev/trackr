// Schema + markdown bridge for the message/description WYSIWYG editor
// (RichTextInput). Editors edit rich ProseMirror docs, but the wire/storage
// format stays markdown with `@[Name](id)` mention tokens — the same strings
// the plain composers always produced — so the server, notifications, search,
// mobile API, and old messages all keep working unchanged.
//
// Distinct from the wiki's collab schema (src/lib/editor/extensions.ts): no
// Collaboration/Yjs, StarterKit history stays on, mentions are a first-class
// atom node, and there are no images or task lists (they don't exist in the
// markdown message format).

import StarterKit from '@tiptap/starter-kit';
import { Node, type Extensions } from '@tiptap/core';
import {
	MarkdownSerializer,
	defaultMarkdownSerializer,
	type MarkdownSerializerState
} from 'prosemirror-markdown';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Marked } from 'marked';
import { buildMentionToken } from '$lib/utils/mentions';
import { buildRefToken, type RefType } from '$lib/utils/refs';
import {
	guardMentions,
	MENTION_SENTINEL_RE,
	REF_SENTINEL_RE,
	type EntityRef,
	type MentionRef
} from '$lib/utils/markdown';

/** Pill styling shared with the read-side renderer (MentionText). */
export const MENTION_PILL_CLASS =
	'inline-flex items-center rounded bg-accent/10 px-1 align-baseline font-medium text-accent';

/** Atomic inline mention: `@[Name](id)` in markdown, a pill in the editor. */
export const MessageMention = Node.create({
	name: 'mention',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: false,

	addAttributes() {
		return {
			id: { default: '' },
			name: { default: '' }
		};
	},

	parseHTML() {
		return [
			{
				tag: 'span[data-mention-id]',
				getAttrs: (el) => ({
					id: (el as HTMLElement).getAttribute('data-mention-id') ?? '',
					name: (el as HTMLElement).getAttribute('data-mention-name') ?? ''
				})
			}
		];
	},

	renderHTML({ node }) {
		return [
			'span',
			{
				'data-mention-id': node.attrs.id as string,
				'data-mention-name': node.attrs.name as string,
				class: MENTION_PILL_CLASS
			},
			`@${node.attrs.name}`
		];
	},

	renderText({ node }) {
		return buildMentionToken(node.attrs.name as string, node.attrs.id as string);
	}
});

/** Atomic inline entity ref: `~[SIWEB-15](task:id)` in markdown, a pill here. */
export const MessageEntityRef = Node.create({
	name: 'entityRef',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: false,

	addAttributes() {
		return {
			id: { default: '' },
			type: { default: 'ticket' },
			display: { default: '' }
		};
	},

	parseHTML() {
		return [
			{
				tag: 'span[data-ref-id]',
				getAttrs: (el) => ({
					id: (el as HTMLElement).getAttribute('data-ref-id') ?? '',
					type: (el as HTMLElement).getAttribute('data-ref-type') ?? 'ticket',
					display: (el as HTMLElement).getAttribute('data-ref-display') ?? ''
				})
			}
		];
	},

	renderHTML({ node }) {
		return [
			'span',
			{
				'data-ref-id': node.attrs.id as string,
				'data-ref-type': node.attrs.type as string,
				'data-ref-display': node.attrs.display as string,
				class: MENTION_PILL_CLASS
			},
			node.attrs.display as string
		];
	},

	renderText({ node }) {
		return buildRefToken(
			node.attrs.display as string,
			node.attrs.type as RefType,
			node.attrs.id as string
		);
	}
});

export interface MessageSchemaOptions {
	/** `document` allows headings (descriptions); chat has none. */
	flavor?: 'chat' | 'document';
	/** Omit the mention node for surfaces without @-mentions (descriptions). */
	mentions?: boolean;
}

export function messageSchemaExtensions(opts: MessageSchemaOptions = {}): Extensions {
	const { flavor = 'chat', mentions = true } = opts;
	return [
		// StarterKit v3 bundles Link — configured here to avoid a duplicate
		// extension (mirrors the wiki schema's reasoning).
		StarterKit.configure({
			heading: flavor === 'document' ? { levels: [1, 2, 3] } : false,
			link: {
				openOnClick: false,
				autolink: true,
				HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
			}
		}),
		// Entity refs ride the same gate: surfaces without mentions (descriptions)
		// don't parse either token server-side, so neither node belongs there.
		...(mentions ? [MessageMention, MessageEntityRef] : [])
	];
}

// ─── Doc → markdown ──────────────────────────────────────────────────────────
// prosemirror-markdown's default serializer speaks snake_case schema names;
// this maps Tiptap's camelCase names onto the same battle-tested writers.

const d = defaultMarkdownSerializer;

const serializer = new MarkdownSerializer(
	{
		paragraph: d.nodes.paragraph,
		heading: d.nodes.heading,
		codeBlock: d.nodes.code_block,
		blockquote: d.nodes.blockquote,
		horizontalRule: d.nodes.horizontal_rule,
		bulletList: d.nodes.bullet_list,
		listItem: d.nodes.list_item,
		text: d.nodes.text,
		orderedList(state: MarkdownSerializerState, node: PMNode) {
			// Tiptap stores the start index as `start` (pm-markdown expects `order`).
			const start = (node.attrs.start as number) || 1;
			const maxW = String(start + node.childCount - 1).length;
			const space = ' '.repeat(maxW + 2);
			state.renderList(node, space, (i) => {
				const nStr = String(start + i);
				return ' '.repeat(maxW - nStr.length) + nStr + '. ';
			});
		},
		// Plain newline: the renderers parse with `breaks: true`, and it keeps
		// stored messages looking like what people typed.
		hardBreak(state: MarkdownSerializerState, node: PMNode, parent: PMNode, index: number) {
			for (let i = index + 1; i < parent.childCount; i++) {
				if (parent.child(i).type !== node.type) {
					state.write('\n');
					return;
				}
			}
		},
		mention(state: MarkdownSerializerState, node: PMNode) {
			state.write(buildMentionToken(node.attrs.name as string, node.attrs.id as string));
		},
		entityRef(state: MarkdownSerializerState, node: PMNode) {
			state.write(
				buildRefToken(
					node.attrs.display as string,
					node.attrs.type as RefType,
					node.attrs.id as string
				)
			);
		}
	},
	{
		bold: d.marks.strong,
		italic: d.marks.em,
		code: d.marks.code,
		link: d.marks.link,
		strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true }
	}
);

/** Serialize an editor doc to the stored markdown string. */
export function docToMarkdown(doc: PMNode): string {
	// `tightLists`: no blank lines between items — matches how chat lists read.
	return serializer.serialize(doc, { tightLists: true }).trim();
}

// ─── Markdown → editor HTML ──────────────────────────────────────────────────

const mdParser = new Marked({ gfm: true, breaks: true });
// Raw HTML in stored text must stay literal text (the read-side renderer does
// the same) — otherwise the editor would parse and silently drop it on save.
mdParser.use({
	renderer: {
		html(token) {
			return escAttr(token.text ?? token.raw ?? '').replaceAll('\n', '<br>');
		}
	}
});

function escAttr(s: string): string {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

/**
 * Render stored markdown to HTML for `generateJSON` (editor hydration).
 * Mentions become `span[data-mention-id]` for the Mention node's parse rule.
 */
export function markdownToEditorHtml(text: string): string {
	const { guarded, mentions, refs } = guardMentions(text);
	let html = mdParser.parse(guarded, { async: false }) as string;
	html = html.replace(MENTION_SENTINEL_RE, (_m, idx: string) => {
		const ref: MentionRef | undefined = mentions[Number(idx)];
		if (!ref) return '';
		return `<span data-mention-id="${escAttr(ref.id)}" data-mention-name="${escAttr(ref.name)}">@${escAttr(ref.name)}</span>`;
	});
	html = html.replace(REF_SENTINEL_RE, (_m, idx: string) => {
		const ref: EntityRef | undefined = refs[Number(idx)];
		if (!ref) return '';
		return `<span data-ref-id="${escAttr(ref.id)}" data-ref-type="${escAttr(ref.type)}" data-ref-display="${escAttr(ref.display)}">${escAttr(ref.display)}</span>`;
	});
	return html;
}
