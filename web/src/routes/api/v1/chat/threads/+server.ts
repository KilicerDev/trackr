// Org chat for the app.
//   GET  ?orgId=  — the org's whole feed (threads with messages inlined),
//                   same shape as the web chat page.
//   POST { orgId, title, body } — start a thread.
import { assertCan } from '$lib/server/permissions';
import { createThread, loadOrgFeed, markThreadRead } from '$lib/server/chat';
import { notifyChatMessage } from '$lib/server/notify/chat';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	requireUser(locals);
	const orgId = url.searchParams.get('orgId');
	if (!orgId) apiError(400, m.chat_err_org_required());
	await assertCan(locals, 'org.chat.read', { orgId });
	const feed = await loadOrgFeed(orgId);
	return json({ threads: feed });
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
	const user = requireUser(locals);
	const body = await readJson<{ orgId?: string; title?: string; body?: string }>(request);
	const orgId = body.orgId?.trim();
	const title = body.title?.trim();
	const text = body.body?.trim();
	if (!orgId) apiError(400, m.chat_err_org_required());
	if (!title) apiError(400, m.chat_err_title_required());
	if (!text) apiError(400, m.chat_err_message_required());
	await assertCan(locals, 'org.chat.post', { orgId });

	const { threadId } = await createThread({ orgId, title, body: text, createdBy: user.id });
	await markThreadRead(threadId, user.id);
	await notifyChatMessage({
		threadId,
		orgId,
		threadTitle: title,
		actorId: user.id,
		body: text,
		origin: url.origin
	});
	return json({ threadId }, { status: 201 });
};
