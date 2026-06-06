import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { profile: null };
	const [row] = await db
		.select({
			id: userTable.id,
			name: userTable.name,
			email: userTable.email,
			image: userTable.image,
			createdAt: userTable.createdAt
		})
		.from(userTable)
		.where(eq(userTable.id, locals.user.id))
		.limit(1);
	return { profile: row ?? null };
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: m.profile_err_not_authenticated() });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const image = String(form.get('image') ?? '').trim() || null;
		if (!name) return fail(400, { message: m.profile_err_name_required() });
		if (name.length > 80) return fail(400, { message: m.profile_err_name_too_long() });

		await db
			.update(userTable)
			.set({ name, image })
			.where(eq(userTable.id, locals.user.id));

		return { success: true };
	}
};
