import { json } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const session = event.locals.session as { impersonatedBy?: string | null } | undefined;
	if (!session?.impersonatedBy) {
		return json({ message: 'Not impersonating.' }, { status: 400 });
	}

	try {
		await auth.api.stopImpersonating({ headers: event.request.headers });
	} catch (err) {
		if (err instanceof APIError) {
			return json({ message: err.message || 'Failed to stop impersonation.' }, { status: 400 });
		}
		console.error('stopImpersonating failed', err);
		return json({ message: 'Something went wrong. Please try again.' }, { status: 500 });
	}

	return json({ ok: true });
};
