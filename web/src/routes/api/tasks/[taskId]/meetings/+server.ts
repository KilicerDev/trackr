import { error, json } from '@sveltejs/kit';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { note, task } from '$lib/server/db/app.schema';
import { isTrackrTeam } from '$lib/server/permissions';
import { listTemplates } from '$lib/server/notes';
import type { RequestHandler } from './$types';

// Meeting notes linked to a task + the templates available for creating a new
// one inline from the task panel. Notes are internal-team only. A meeting is
// linked when it names the task (note.task_id) or the task was created from it
// (task.source_note_id).
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || !isTrackrTeam(locals)) error(403, 'forbidden');
	const [notes, templates] = await Promise.all([
		db
			.select({ id: note.id, title: note.title, meetingDate: note.meetingDate })
			.from(note)
			.where(
				and(
					eq(note.kind, 'meeting'),
					or(
						eq(note.taskId, params.taskId),
						sql`${note.id} = (select ${task.sourceNoteId} from ${task} where ${task.id} = ${params.taskId})`
					)
				)
			)
			.orderBy(desc(note.meetingDate)),
		listTemplates()
	]);
	return json({
		notes,
		templates: templates.map((t) => ({ id: t.id, name: t.name, icon: t.icon }))
	});
};
