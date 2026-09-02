// Event fan-out for the org support chat. One function = the complete
// notification set for one user action, shared by the web action and the
// /api/v1 chat endpoints: broad audience minus muters, tag followers as
// participants, mentions scoped to the deliverable audience. Each emit also
// carries structured email content (eyebrow / meta rows / quote / CTA).
import { notify } from '../index';
import { orgChatRecipients, orgMentionRecipients, tagFollowers, tagMuters } from '../recipients';
import { parseMentionIds } from '$lib/utils/mentions';
import { m } from '$lib/paraglide/messages';
import type { Locale } from '$lib/paraglide/runtime';
import { emailDate, type NotifyActor } from './shared';
import {
	emitWebhookEvent,
	messageSnapshot,
	threadSnapshot,
	type AttachmentSnapshotInput
} from '$lib/server/webhooks';

function chatMeta(actor: NotifyActor, locale: Locale): { label: string; value: string }[] {
	return [
		{ label: m.email_meta_from(undefined, { locale }), value: actor.name },
		{ label: m.email_meta_date(undefined, { locale }), value: emailDate(locale) }
	];
}

export async function notifyChatMessage(opts: {
	threadId: string;
	orgId: string;
	threadTitle: string | null;
	actor: NotifyActor;
	body: string;
	origin: string;
	messageId?: string | null;
	/** Files attached to the message — listed in `data.message.attachments`. */
	attachments?: readonly AttachmentSnapshotInput[];
}): Promise<void> {
	const { actor } = opts;
	const chatUrl = `/chat?org=${opts.orgId}&thread=${opts.threadId}`;
	emitWebhookEvent({
		type: 'message.created',
		orgId: opts.orgId,
		actor,
		origin: opts.origin,
		data: {
			thread: threadSnapshot(
				{ id: opts.threadId, orgId: opts.orgId, title: opts.threadTitle },
				opts.origin
			),
			message: messageSnapshot(
				{
					id: opts.messageId ?? '',
					body: opts.body,
					authorId: actor.id,
					attachments: opts.attachments
				},
				opts.origin
			)
		}
	});
	const [audience, followers, muters, mentioned] = await Promise.all([
		orgChatRecipients(opts.orgId),
		tagFollowers(opts.threadId),
		tagMuters(opts.threadId),
		orgMentionRecipients(opts.orgId, parseMentionIds(opts.body))
	]);
	const recipients = new Set<string>([...audience, ...followers]);
	for (const id of muters) recipients.delete(id);
	// Mention wins: an @-mentioned user gets only `chatMentioned` (the more
	// specific kind), never a `chatMessage` duplicate for the same message.
	for (const id of mentioned) recipients.delete(id);
	const excerpt = opts.body.slice(0, 280);

	await notify({
		kind: 'chatMessage',
		recipients,
		actorId: actor.id,
		orgId: opts.orgId,
		// "Participating" in a thread = explicitly following its tags.
		participants: [...followers],
		render: (locale) => ({
			title: m.notify_chat_message({ thread: opts.threadTitle ?? m.chat_untitled() }, { locale }),
			body: excerpt
		}),
		email: (locale) => ({
			// Chat threads have no display ref, so the subject carries
			// "Chat · Neue Nachricht" instead of a ref.
			subjectLabel: `${m.email_kind_chat(undefined, { locale })} · ${m.email_ev_message(undefined, { locale })}`,
			eyebrow: `${m.email_kind_chat(undefined, { locale })} · ${m.email_ev_message(undefined, { locale })}`,
			heading: opts.threadTitle ?? m.chat_untitled(undefined, { locale }),
			meta: chatMeta(actor, locale),
			quote: excerpt,
			ctaLabel: m.email_cta_chat(undefined, { locale })
		}),
		url: chatUrl,
		entity: { type: 'thread', id: opts.threadId },
		baseUrl: opts.origin
	}).catch((err) => console.error('chat message notify failed', err));

	if (mentioned.size > 0) {
		await notify({
			kind: 'chatMentioned',
			recipients: mentioned,
			actorId: actor.id,
			orgId: opts.orgId,
			render: (locale) => ({
				title: m.notify_mentioned({ label: opts.threadTitle ?? m.chat_untitled() }, { locale }),
				body: excerpt
			}),
			email: (locale) => ({
				subjectLabel: m.email_ev_mentioned(undefined, { locale }),
				eyebrow: m.email_ev_mentioned(undefined, { locale }),
				heading: opts.threadTitle ?? m.chat_untitled(undefined, { locale }),
				meta: chatMeta(actor, locale),
				quote: excerpt,
				ctaLabel: m.email_cta_chat(undefined, { locale })
			}),
			url: chatUrl,
			entity: { type: 'thread', id: opts.threadId },
			baseUrl: opts.origin
		}).catch((err) => console.error('chat mention notify failed', err));
	}
}
