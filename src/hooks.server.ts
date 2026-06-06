import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { deriveIsAdmin, loadMemberships } from '$lib/server/permissions';
import { getPreferences } from '$lib/server/preferences';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { cookieName, isLocale } from '$lib/paraglide/runtime';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
		const memberships = await loadMemberships(session.user.id);
		event.locals.memberships = memberships;
		event.locals.isAdmin = await deriveIsAdmin(memberships);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

// For logged-in users the DB (`user_preferences.locale`) is the durable, authoritative
// store. We reconcile the Paraglide cookie to it *before* Paraglide reads the request,
// so the first painted HTML is already in the saved language (no flash). The resolved
// preferences are stashed on `locals` so the layout loader doesn't re-query.
const handleLocale: Handle = async ({ event, resolve }) => {
	if (event.locals.user) {
		const preferences = await getPreferences(event.locals.user.id);
		event.locals.preferences = preferences;

		const desired = isLocale(preferences.locale) ? preferences.locale : 'en';
		const current = event.cookies.get(cookieName);
		if (current !== desired) {
			// Rewrite the incoming request's cookie so paraglideMiddleware (next hook)
			// resolves the DB locale on *this* request, and persist it for the next one.
			event.cookies.set(cookieName, desired, { path: '/', maxAge: 60 * 60 * 24 * 400 });
			const headers = new Headers(event.request.headers);
			const others = (headers.get('cookie') ?? '')
				.split(';')
				.map((c) => c.trim())
				.filter((c) => c && !c.startsWith(`${cookieName}=`));
			headers.set('cookie', [...others, `${cookieName}=${desired}`].join('; '));
			event.request = new Request(event.request, { headers });
		}
	}

	return resolve(event);
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%lang%', locale)
		});
	});

export const handle: Handle = sequence(handleBetterAuth, handleLocale, handleParaglide);
