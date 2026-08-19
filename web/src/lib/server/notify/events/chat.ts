// Event fan-out for the org support chat. One function = the complete
// notification set for one user action, shared by the web action and the
// /api/v1 chat endpoints: broad audience minus muters, tag followers as
// participants, mentions scoped to the deliverable audience.
import { notify } from '../index';
import { orgChatRecipients, orgMentionRecipients, tagFollowers, tagMuters } from '../recipients';
import { parseMentionIds } from '$lib/utils/mentions';
import { m } from '$lib/paraglide/messages';

export async function notifyChatMessage(opts: {
	threadId: string;
	orgId: string;
	threadTitle: string | null;
	actorId: string;
	body: string;
	origin: string;
}): Promise<void> {
	const chatUrl = `/chat?org=${opts.orgId}&thread=${opts.threadId}`;
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

	await notify({
		kind: 'chatMessage',
		recipients,
		actorId: opts.actorId,
		orgId: opts.orgId,
		// "Participating" in a thread = explicitly following its tags.
		participants: [...followers],
		render: (locale) => ({
			title: m.notify_chat_message({ thread: opts.threadTitle ?? m.chat_untitled() }, { locale }),
			body: opts.body.slice(0, 280)
		}),
		url: chatUrl,
		entity: { type: 'thread', id: opts.threadId },
		baseUrl: opts.origin
	}).catch((err) => console.error('chat message notify failed', err));

	if (mentioned.size > 0) {
		await notify({
			kind: 'chatMentioned',
			recipients: mentioned,
			actorId: opts.actorId,
			orgId: opts.orgId,
			render: (locale) => ({
				title: m.notify_mentioned({ label: opts.threadTitle ?? m.chat_untitled() }, { locale }),
				body: opts.body.slice(0, 280)
			}),
			url: chatUrl,
			entity: { type: 'thread', id: opts.threadId },
			baseUrl: opts.origin
		}).catch((err) => console.error('chat mention notify failed', err));
	}
}
