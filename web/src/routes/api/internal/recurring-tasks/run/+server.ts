// Called by the Go worker's `tasks.recur` job (services/worker/internal/jobs/recur.go)
// when a recurring series is due. Authenticated by the worker secret from
// `internal_secret` (Bearer), not a user session: the runner acts as each
// series' owner. Answers 404 on a bad token so the endpoint doesn't advertise
// itself.
import { error, json } from '@sveltejs/kit';
import { isWorkerToken, runDueRecurrences } from '$lib/server/recurring-tasks';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!(await isWorkerToken(request.headers.get('authorization')))) error(404, 'Not found');
	return json(await runDueRecurrences());
};
