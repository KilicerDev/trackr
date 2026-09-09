import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pushToken } from '$lib/server/db/app.schema';
import { user as userTable } from '$lib/server/db/auth.schema';
import { assertCan, can } from '$lib/server/permissions';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

function fmt(d: Date | null): string {
	if (!d) return '';
	const p = (n: number) => String(n).padStart(2, '0');
	return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function initials(name: string): string {
	return (
		name
			.split(/\s+/)
			.map((p) => p[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase() || '·'
	);
}
function userColor(id: string): string {
	let h = 0;
	for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return `hsl(${h % 360} 55% 60%)`;
}

// One row per registered device token. The token itself is a credential for
// sending to that device — only a short fingerprint leaves the server.
export const load: PageServerLoad = async ({ locals }) => {
	await assertCan(locals, 'admin.settings.manage');
	const rows = await db
		.select({
			id: pushToken.id,
			token: pushToken.token,
			platform: pushToken.platform,
			deviceName: pushToken.deviceName,
			createdAt: pushToken.createdAt,
			lastSeenAt: pushToken.lastSeenAt,
			userId: userTable.id,
			userName: userTable.name,
			userEmail: userTable.email
		})
		.from(pushToken)
		.innerJoin(userTable, eq(userTable.id, pushToken.userId))
		.orderBy(desc(pushToken.lastSeenAt));

	return {
		devices: rows.map((r) => ({
			id: r.id,
			tokenPrefix: r.token.slice(0, 8),
			platform: r.platform,
			deviceName: r.deviceName,
			createdAt: fmt(r.createdAt),
			lastSeenAt: fmt(r.lastSeenAt),
			user: {
				id: r.userId,
				name: r.userName,
				email: r.userEmail,
				initials: initials(r.userName),
				color: userColor(r.userId)
			}
		}))
	};
};

export const actions: Actions = {
	// Drop a device registration. The device re-registers on next app launch
	// (the app re-posts its token every start), so this is safe to use for
	// clearing stale or wrongly-owned rows.
	remove: async (event) => {
		if (!(await can(event.locals, 'admin.settings.manage'))) {
			return fail(403, { message: m.devices_action_error() });
		}
		const fd = await event.request.formData();
		const id = fd.get('id')?.toString();
		if (!id) return fail(400, { message: m.devices_action_error() });
		try {
			await db.delete(pushToken).where(eq(pushToken.id, id));
		} catch {
			return fail(500, { message: m.devices_action_error() });
		}
		return { success: true };
	}
};
