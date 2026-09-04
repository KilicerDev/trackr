// Log time on a task. `id` is the task UUID. Mirrors the web timeLogAdd
// action: any user who can read the task may log time; entry = minutes +
// calendar date + optional note. Logic lives in $lib/server/tasks logTaskTime
// (shared with the MCP server).
import { logTaskTime } from '$lib/server/tasks';
import { json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	requireUser(locals);
	const body = await readJson<{ minutes?: number; date?: string; note?: string }>(request);
	await logTaskTime(
		locals,
		params.id,
		{ minutes: Number(body.minutes ?? 0), date: String(body.date ?? ''), note: body.note },
		{ origin: url.origin, via: 'api.v1' }
	);
	return json({ ok: true }, { status: 201 });
};
