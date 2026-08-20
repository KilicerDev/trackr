// Org chat for the app.
//   GET  ?orgId=  — the org's whole feed (threads with messages inlined),
//                   plus the org's tag directory, an author display map, and
//                   the caller's unread thread ids.
//   POST { orgId, title, body } — start a thread.
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { threadRead } from '$lib/server/db/app.schema';
import { assertCan } from '$lib/server/permissions';
import { createThread, listOrgTags, loadOrgFeed, markThreadRead } from '$lib/server/chat';
import { loadTicketDisplayUsers } from '$lib/server/tickets';
import { notifyChatMessage } from '$lib/server/notify/events/chat';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireUser(locals);
	const orgId = url.searchParams.get('orgId');
	if (!orgId) apiError(400, m.chat_err_org_required());
	await assertCan(locals, 'org.chat.read', { orgId });
	const [feed, tags] = await Promise.all([loadOrgFeed(orgId), listOrgTags(orgId)]);

	// Display directory (name + color only, emails stripped) — same contract as
	// the thread detail's `authors` map, so the app can label previews.
	const displayUsers = await loadTicketDisplayUsers(
		feed.flatMap((t) => [t.createdBy, ...t.messages.map((msg) => msg.authorId)])
	);
	const authors = Object.fromEntries(
		displayUsers.map((u) => [u.id, { name: u.name, color: u.color }])
	);

	// Unread = any message newer than the caller's read cursor (or no cursor
	// at all). Own messages bump the cursor on POST, so they don't count.
	const threadIds = feed.map((t) => t.id);
	const readRows = threadIds.length
		? await db
				.select({ threadId: threadRead.threadId, lastReadAt: threadRead.lastReadAt })
				.from(threadRead)
				.where(and(eq(threadRead.userId, user.id), inArray(threadRead.threadId, threadIds)))
		: [];
	const lastReadByThread = new Map(readRows.map((r) => [r.threadId, r.lastReadAt.toISOString()]));
	const unreadThreadIds = feed
		.filter((t) => {
			const last = t.messages.at(-1);
			if (!last) return false;
			const cursor = lastReadByThread.get(t.id);
			return !cursor || last.createdAt > cursor;
		})
		.map((t) => t.id);

	return json({ threads: feed, tags, authors, unreadThreadIds });
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
		actor: { id: user.id, name: user.name },
		body: text,
		origin: url.origin
	});
	return json({ threadId }, { status: 201 });
};
