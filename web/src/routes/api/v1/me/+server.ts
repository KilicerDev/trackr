// The app's session bootstrap: who am I, what can I reach (capability
// manifest → role-based navigation), my orgs, and the unread badge count.
// Called on launch/restore; a 401 here means the stored token is dead.
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { notification, organization } from '$lib/server/db/app.schema';
import { buildCapabilities } from '$lib/server/capabilities';
import { json, requireUser } from '$lib/server/api/guard';
import { getPreferences } from '$lib/server/preferences';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals);
	const capabilities = await buildCapabilities(locals);
	// Other trackr instances this user switches to (TRACK-140) — the phone
	// learns them from the web, so it can offer the same server picker.
	const preferences = locals.preferences ?? (await getPreferences(user.id));

	const orgIds = Object.keys(capabilities.orgs);
	const orgRows = orgIds.length
		? await db
				.select({
					id: organization.id,
					slug: organization.slug,
					name: organization.name,
					color: organization.color
				})
				.from(organization)
				.where(and(isNull(organization.archivedAt)))
		: [];
	// Non-staff only see their own orgs (leaking the org list would name every
	// other client). Staff get all active orgs for pickers.
	const orgs =
		capabilities.userType === 'staff' ? orgRows : orgRows.filter((o) => orgIds.includes(o.id));

	const [unread] = await db
		.select({ total: count() })
		.from(notification)
		.where(and(eq(notification.recipientId, user.id), isNull(notification.readAt)));

	return json({
		user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null },
		capabilities,
		orgs,
		unreadCount: Number(unread?.total ?? 0),
		instances: preferences.instances
	});
};
