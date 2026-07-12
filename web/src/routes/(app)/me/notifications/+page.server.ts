import { fail } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/app.schema';
import { markAllRead } from '$lib/server/notify';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 40;
const MAX_LIMIT = 400;

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	// Shared with the bell (root layout) so a mark-read refreshes both in sync.
	depends('app:notifications');
	const userId = locals.user!.id;
	const filter = url.searchParams.get('filter') === 'unread' ? 'unread' : 'all';
	const limit = Math.min(
		MAX_LIMIT,
		Math.max(PAGE_SIZE, Number(url.searchParams.get('limit')) || PAGE_SIZE)
	);

	const where =
		filter === 'unread'
			? and(eq(notification.recipientId, userId), isNull(notification.readAt))
			: eq(notification.recipientId, userId);

	// Over-fetch by one to know whether a "load more" page exists.
	const rows = await db
		.select({
			id: notification.id,
			kind: notification.kind,
			title: notification.title,
			body: notification.body,
			url: notification.url,
			actorId: notification.actorId,
			readAt: notification.readAt,
			createdAt: notification.createdAt
		})
		.from(notification)
		.where(where)
		.orderBy(desc(notification.createdAt))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const items = (hasMore ? rows.slice(0, limit) : rows).map((n) => ({
		id: n.id,
		kind: n.kind,
		title: n.title,
		body: n.body,
		url: n.url,
		actorId: n.actorId,
		readAt: n.readAt?.toISOString() ?? null,
		createdAt: n.createdAt.toISOString()
	}));

	return { inbox: { items, hasMore, filter, limit } };
};

export const actions: Actions = {
	markAll: async ({ locals }) => {
		if (!locals.user) return fail(401, { message: m.notif_err_not_authenticated() });
		await markAllRead(locals.user.id);
		return { success: true };
	}
};
