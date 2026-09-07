// Convert a ticket into a linked project task (team-only) — the mobile app's
// counterpart of the web tickets/[id] `createTask` action. Both delegate to
// $lib/server/ticket-convert, which carries the checklist, shares attachments,
// drops an internal breadcrumb note, notifies assignees, and audits.
//
//   POST { title, projectKey, description?, status?, priority?, type?,
//          due?, estimate?, assigneeIds? } → { id, displayId }
import { convertTicketToTask, TicketConvertError } from '$lib/server/ticket-convert';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	requireUser(locals);
	const body = await readJson<{
		title?: unknown;
		projectKey?: unknown;
		description?: unknown;
		status?: unknown;
		priority?: unknown;
		type?: unknown;
		due?: unknown;
		estimate?: unknown;
		tags?: unknown;
		assigneeIds?: unknown;
	}>(request);

	let dueDate: Date | null = null;
	if (typeof body.due === 'string' && body.due) {
		dueDate = new Date(body.due);
		if (Number.isNaN(dueDate.getTime())) apiError(400, 'Invalid due date.');
	}

	try {
		const created = await convertTicketToTask(locals, {
			channel: 'api',
			ticketId: params.id,
			title: typeof body.title === 'string' ? body.title : '',
			description: typeof body.description === 'string' ? body.description : null,
			projectKey:
				typeof body.projectKey === 'string' && body.projectKey ? body.projectKey : undefined,
			status: typeof body.status === 'string' ? body.status : undefined,
			priority: typeof body.priority === 'string' ? body.priority : undefined,
			type: typeof body.type === 'string' ? body.type : undefined,
			dueDate,
			estimateMinutes:
				typeof body.estimate === 'number' && Number.isFinite(body.estimate) ? body.estimate : null,
			tags: Array.isArray(body.tags)
				? body.tags.filter((v): v is string => typeof v === 'string')
				: [],
			assigneeIds: Array.isArray(body.assigneeIds)
				? body.assigneeIds.filter((v): v is string => typeof v === 'string')
				: [],
			origin: url.origin
		});
		return json({ id: created.id, displayId: created.displayId });
	} catch (err) {
		if (err instanceof TicketConvertError) apiError(err.status, err.message);
		throw err;
	}
};
