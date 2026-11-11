// The recurring series of one task, for the inspector's Repeat row.
//   GET     → { series } (null when the task doesn't repeat)
//   PUT     { schedule, dueOffsetDays, refreshTemplate? } → set up or edit
//   PATCH   { paused: boolean } → pause / resume
//   DELETE  → stop repeating (created tasks stay)
// `taskId` is the task uuid. Session-only (no API keys: not under /api/v1).
import { error, json } from '@sveltejs/kit';
import { parseSchedule } from '$lib/recurrence';
import {
	getTaskRecurrence,
	setTaskRecurrence,
	setTaskRecurrencePaused,
	stopTaskRecurrence
} from '$lib/server/recurring-tasks';
import type { RequestHandler } from './$types';

function requireUser(locals: App.Locals) {
	if (!locals.user) error(401, 'Not authenticated.');
}

export const GET: RequestHandler = async ({ locals, params }) => {
	requireUser(locals);
	return json({ series: await getTaskRecurrence(locals, params.taskId) });
};

export const PUT: RequestHandler = async ({ locals, params, request, url }) => {
	requireUser(locals);
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) error(400, 'Expected a JSON body.');
	const parsed = parseSchedule(body.schedule);
	if (!parsed.ok) error(400, parsed.error);
	let dueOffsetDays: number | null = null;
	if (body.dueOffsetDays !== null && body.dueOffsetDays !== undefined) {
		dueOffsetDays = Number(body.dueOffsetDays);
		if (!Number.isInteger(dueOffsetDays) || dueOffsetDays < 0 || dueOffsetDays > 365) {
			error(400, 'dueOffsetDays must be 0–365 or null.');
		}
	}
	const series = await setTaskRecurrence(
		locals,
		params.taskId,
		{ schedule: parsed.value, dueOffsetDays, refreshTemplate: body.refreshTemplate === true },
		url.origin
	);
	return json({ series });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	requireUser(locals);
	const body = (await request.json().catch(() => null)) as { paused?: unknown } | null;
	if (typeof body?.paused !== 'boolean') error(400, 'Expected { paused: boolean }.');
	return json({ series: await setTaskRecurrencePaused(locals, params.taskId, body.paused) });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	requireUser(locals);
	await stopTaskRecurrence(locals, params.taskId);
	return json({ series: null });
};
