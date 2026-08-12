// Inbox feed for the app's default tab — the user's notification rows,
// newest first, cursor-paged. Mirrors /me/notifications on the web.
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/app.schema';
import { json, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

const MAX_LIMIT = 100;

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireUser(locals);
	const unreadOnly = url.searchParams.get('filter') === 'unread';
	const limitRaw = Number(url.searchParams.get('limit') ?? 30);
	const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), MAX_LIMIT) : 30;
	// Cursor = createdAt ISO of the last row of the previous page.
	const cursor = url.searchParams.get('cursor');
	const cursorDate = cursor ? new Date(cursor) : null;

	const conditions = [eq(notification.recipientId, user.id)];
	if (unreadOnly) conditions.push(isNull(notification.readAt));
	if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
		conditions.push(lt(notification.createdAt, cursorDate));
	}

	const rows = await db
		.select({
			id: notification.id,
			kind: notification.kind,
			title: notification.title,
			body: notification.body,
			url: notification.url,
			actorId: notification.actorId,
			entityType: notification.entityType,
			entityId: notification.entityId,
			readAt: notification.readAt,
			createdAt: notification.createdAt
		})
		.from(notification)
		.where(and(...conditions))
		.orderBy(desc(notification.createdAt))
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	return json({
		items: page.map((n) => ({
			...n,
			readAt: n.readAt?.toISOString() ?? null,
			createdAt: n.createdAt.toISOString()
		})),
		nextCursor: rows.length > limit ? page[page.length - 1].createdAt.toISOString() : null
	});
};
