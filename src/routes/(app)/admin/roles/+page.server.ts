import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { role, rolePermission } from '$lib/server/db/app.schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [roles, perms] = await Promise.all([
		db.select().from(role).orderBy(asc(role.scope), asc(role.sortOrder)),
		db.select().from(rolePermission)
	]);

	// Build a quick lookup: roleId → Set<permission>
	const byRole: Record<string, string[]> = {};
	for (const r of perms) (byRole[r.roleId] ??= []).push(r.permission);
	return { roles, permsByRole: byRole };
};
