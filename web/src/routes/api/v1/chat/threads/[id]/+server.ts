// One chat thread: messages, plus the read-cursor bump (opening a thread in
// the app marks it read, mirroring the web feed's behavior).
import { assertCan } from '$lib/server/permissions';
import { getThreadContext, loadMessages, markThreadRead } from '$lib/server/chat';
import { loadTicketDisplayUsers } from '$lib/server/tickets';
import { m } from '$lib/paraglide/messages';
import { apiError, json, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const user = requireUser(locals);
	const ctx = await getThreadContext(params.id);
	if (!ctx) apiError(404, m.chat_err_thread_not_found());
	await assertCan(locals, 'org.chat.read', { orgId: ctx.orgId });
	const messages = await loadMessages(params.id);
	await markThreadRead(params.id, user.id);
	// Display directory (name + color only) so the app can label message
	// authors — same contract as the ticket detail's `authors` map.
	const users = await loadTicketDisplayUsers(messages.map((msg) => msg.authorId));
	const authors = Object.fromEntries(users.map((u) => [u.id, { name: u.name, color: u.color }]));
	return json({ thread: { id: params.id, title: ctx.title, orgId: ctx.orgId }, messages, authors });
};
