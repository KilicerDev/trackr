// Device push-token registration (groundwork for native push — see
// $lib/server/jobs/services/push.ts for the delivery story).
//   POST   { token, platform: 'ios'|'android', deviceName? } — upsert; a token
//          already registered re-homes to the current user (device changed
//          hands) and bumps lastSeenAt. Call on every app launch.
//   DELETE { token } — unregister (sign-out).
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pushToken } from '$lib/server/db/app.schema';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

const PLATFORMS = new Set(['ios', 'android']);

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = await readJson<{ token?: string; platform?: string; deviceName?: string }>(request);
	const token = body.token?.trim();
	if (!token || token.length > 4096) apiError(400, 'token is required.');
	if (!body.platform || !PLATFORMS.has(body.platform)) {
		apiError(400, "platform must be 'ios' or 'android'.");
	}

	await db
		.insert(pushToken)
		.values({
			id: crypto.randomUUID(),
			userId: user.id,
			token,
			platform: body.platform,
			deviceName: body.deviceName?.slice(0, 200) ?? null
		})
		.onConflictDoUpdate({
			target: pushToken.token,
			set: {
				userId: user.id,
				platform: body.platform,
				deviceName: body.deviceName?.slice(0, 200) ?? null,
				lastSeenAt: new Date()
			}
		});
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = await readJson<{ token?: string }>(request);
	const token = body.token?.trim();
	if (!token) apiError(400, 'token is required.');
	// Scoped to the caller — you can only unregister your own device rows.
	await db.delete(pushToken).where(and(eq(pushToken.token, token), eq(pushToken.userId, user.id)));
	return json({ ok: true });
};
