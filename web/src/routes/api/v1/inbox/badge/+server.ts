// Cheap unread count — the app's 60s foreground poll target (the push
// stand-in until FCM lands). Keep this endpoint index-only fast.
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/app.schema';
import { json, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals);
	const [row] = await db
		.select({ total: count() })
		.from(notification)
		.where(and(eq(notification.recipientId, user.id), isNull(notification.readAt)));
	return json({ unread: Number(row?.total ?? 0) });
};
