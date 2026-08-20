// Profile edit for the native app. Mirrors the web /me/profile form action:
// only `name` and `image` (an avatar URL) are user-editable — email changes,
// password changes and account deletion are deliberately absent everywhere.
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = await readJson<{ name?: unknown; image?: unknown }>(request);

	const set: { name?: string; image?: string | null } = {};

	if (body.name !== undefined) {
		if (typeof body.name !== 'string') apiError(400, 'Invalid name.');
		const name = body.name.trim();
		if (!name) apiError(400, 'Name is required.');
		if (name.length > 80) apiError(400, 'Name is too long.');
		set.name = name;
	}
	if (body.image !== undefined) {
		if (body.image !== null && typeof body.image !== 'string') apiError(400, 'Invalid image.');
		set.image = typeof body.image === 'string' ? body.image.trim() || null : null;
	}

	if (Object.keys(set).length === 0) apiError(400, 'Empty patch.');

	await db.update(userTable).set(set).where(eq(userTable.id, user.id));

	const [row] = await db
		.select({
			id: userTable.id,
			name: userTable.name,
			email: userTable.email,
			image: userTable.image
		})
		.from(userTable)
		.where(eq(userTable.id, user.id))
		.limit(1);

	return json({ ok: true, user: row });
};
