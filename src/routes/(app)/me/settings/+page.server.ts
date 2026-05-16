import { fail } from '@sveltejs/kit';
import {
	ALLOWED_DENSITIES,
	ALLOWED_LANDINGS,
	ALLOWED_THEMES,
	upsertPreferences
} from '$lib/server/preferences';
import type { Actions } from './$types';

export const actions: Actions = {
	update: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not authenticated' });

		const form = await request.formData();
		const theme = String(form.get('theme') ?? '');
		const accent = String(form.get('accent') ?? '');
		const density = String(form.get('density') ?? '');
		const defaultLanding = String(form.get('defaultLanding') ?? '');
		const weekStartsOn = Number(form.get('weekStartsOn') ?? '');

		if (!ALLOWED_THEMES.has(theme)) return fail(400, { message: 'Invalid theme.' });
		if (!ALLOWED_DENSITIES.has(density)) return fail(400, { message: 'Invalid density.' });
		if (!ALLOWED_LANDINGS.has(defaultLanding)) return fail(400, { message: 'Invalid landing page.' });
		if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return fail(400, { message: 'Invalid accent color.' });
		if (![0, 1].includes(weekStartsOn)) return fail(400, { message: 'Invalid week start.' });

		await upsertPreferences(locals.user.id, {
			theme,
			accent,
			density,
			defaultLanding,
			weekStartsOn
		});

		return { success: true };
	}
};
