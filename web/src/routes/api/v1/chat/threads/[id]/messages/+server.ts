// Reply into a chat thread — the app's push→thread→answer path for chat.
import { assertCan } from '$lib/server/permissions';
import { addMessage, getThreadContext, markThreadRead } from '$lib/server/chat';
import { notifyChatMessage } from '$lib/server/notify/events/chat';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	const user = requireUser(locals);
	const body = await readJson<{ body?: string }>(request);
	const text = body.body?.trim();
	if (!text) apiError(400, m.chat_err_message_required());

	const ctx = await getThreadContext(params.id);
	if (!ctx) apiError(404, m.chat_err_thread_not_found());
	await assertCan(locals, 'org.chat.post', { orgId: ctx.orgId });

	const { id } = await addMessage({ threadId: params.id, authorId: user.id, body: text });
	await markThreadRead(params.id, user.id);
	await notifyChatMessage({
		threadId: params.id,
		orgId: ctx.orgId,
		threadTitle: ctx.title,
		actor: { id: user.id, name: user.name },
		body: text,
		origin: url.origin
	});
	return json({ id }, { status: 201 });
};
