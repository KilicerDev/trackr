import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const next = url.pathname + url.search;
		redirect(302, `/login?next=${encodeURIComponent(next)}`);
	}

	const impersonatedBy = (locals.session as { impersonatedBy?: string | null } | undefined)
		?.impersonatedBy;
	let impersonator: { id: string; name: string | null; email: string } | null = null;
	if (impersonatedBy) {
		const [admin] = await db
			.select({ id: userTable.id, name: userTable.name, email: userTable.email })
			.from(userTable)
			.where(eq(userTable.id, impersonatedBy))
			.limit(1);
		impersonator = admin ?? null;
	}

	return { user: locals.user, impersonator };
};
