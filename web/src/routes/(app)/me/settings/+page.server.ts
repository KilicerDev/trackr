import { fail } from '@sveltejs/kit';
import {
	ALLOWED_DENSITIES,
	ALLOWED_LANDINGS,
	ALLOWED_LOCALES,
	ALLOWED_THEMES,
	upsertPreferences
} from '$lib/server/preferences';
import { cookieName } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages';
import type { Actions } from './$types';

export const actions: Actions = {
	update: async ({ request, locals, cookies }) => {
		if (!locals.user) return fail(401, { message: m.settings_err_not_authenticated() });

		const form = await request.formData();
		const theme = String(form.get('theme') ?? '');
		const density = String(form.get('density') ?? '');
		const defaultLanding = String(form.get('defaultLanding') ?? '');
		const weekStartsOn = Number(form.get('weekStartsOn') ?? '');
		const locale = String(form.get('locale') ?? '');

		if (!ALLOWED_THEMES.has(theme)) return fail(400, { message: m.settings_err_invalid_theme() });
		if (!ALLOWED_DENSITIES.has(density))
			return fail(400, { message: m.settings_err_invalid_density() });
		if (!ALLOWED_LANDINGS.has(defaultLanding))
			return fail(400, { message: m.settings_err_invalid_landing() });
		if (![0, 1].includes(weekStartsOn))
			return fail(400, { message: m.settings_err_invalid_week_start() });
		if (!ALLOWED_LOCALES.has(locale))
			return fail(400, { message: m.settings_err_invalid_language() });

		await upsertPreferences(locals.user.id, {
			theme,
			density,
			defaultLanding,
			weekStartsOn,
			locale
		});

		// Carry the new locale to the next request so SSR renders in the chosen
		// language immediately (the layout reload picks it up via the cookie).
		// httpOnly:false is REQUIRED — Paraglide's client runtime reads this
		// cookie via document.cookie to resolve the locale after hydration; an
		// httpOnly cookie would be invisible to it, so the client would fall back
		// to the browser language and the UI would silently revert on navigation.
		cookies.set(cookieName, locale, {
			path: '/',
			maxAge: 60 * 60 * 24 * 400,
			httpOnly: false,
			sameSite: 'lax'
		});

		return { success: true };
	}
};
