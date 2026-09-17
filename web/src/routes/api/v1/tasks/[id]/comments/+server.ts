// Add a comment to a task's thread. `id` is the task UUID. Multipart
// (`payload` JSON field + `attachments` parts) can attach files to the comment.
import { addTaskComment } from '$lib/server/task-comments';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readBody, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	requireUser(locals);
	const { body: raw, files } = await readBody<{ body?: string }>(request);
	const body = raw.body?.trim();
	if (!body) apiError(400, m.tasks_err_comment_empty());
	const result = await addTaskComment(
		locals,
		params.id,
		{ body, files },
		{ origin: url.origin, via: 'api.v1' }
	);
	return json(result, { status: 201 });
};
