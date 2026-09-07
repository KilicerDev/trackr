// Ends an impersonation session (the banner's "Stop" button). Lives outside
// /admin on purpose: while impersonating a non-admin the caller has no admin
// access, so the /admin gate would 403 the very request that ends it. The
// only authorization needed is that the current session IS an impersonation.
import { json } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const session = event.locals.session as { impersonatedBy?: string | null } | undefined;
	if (!session?.impersonatedBy) {
		return json({ message: 'Not impersonating.' }, { status: 400 });
	}
	const target = event.locals.user;

	try {
		await auth.api.stopImpersonating({ headers: event.request.headers });
	} catch (err) {
		if (err instanceof APIError) {
			return json({ message: err.message || 'Failed to stop impersonation.' }, { status: 400 });
		}
		console.error('stopImpersonating failed', err);
		return json({ message: 'Something went wrong. Please try again.' }, { status: 500 });
	}

	void recordAudit(
		{
			type: 'user.impersonate_stop',
			actorId: session.impersonatedBy,
			targetType: 'user',
			targetId: target?.id ?? null,
			targetLabel: target?.email ?? null
		},
		event
	);
	return json({ ok: true });
};
