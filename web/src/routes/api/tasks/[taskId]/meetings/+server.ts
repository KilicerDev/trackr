import { error, json } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { note } from '$lib/server/db/app.schema';
import { isTrackrTeam } from '$lib/server/permissions';
import { listTemplates } from '$lib/server/notes';
import type { RequestHandler } from './$types';

// Meeting notes linked to a task + the templates available for creating a new
// one inline from the task panel. Notes are internal-team only.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || !isTrackrTeam(locals)) error(403, 'forbidden');
	const [notes, templates] = await Promise.all([
		db
			.select({ id: note.id, title: note.title, meetingDate: note.meetingDate })
			.from(note)
			.where(and(eq(note.kind, 'meeting'), eq(note.taskId, params.taskId)))
			.orderBy(desc(note.meetingDate)),
		listTemplates()
	]);
	return json({
		notes,
		templates: templates.map((t) => ({ id: t.id, name: t.name, icon: t.icon }))
	});
};
