import { error } from '@sveltejs/kit';
import { asc, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { task } from '$lib/server/db/app.schema';
import { isTrackrTeam } from '$lib/server/permissions';
import {
	listMeetingNotes,
	listQuickNotes,
	listSharedWithMe,
	listTemplates
} from '$lib/server/notes';
import { getPreferences } from '$lib/server/preferences';
import { m } from '$lib/paraglide/messages';
import type { LayoutServerLoad } from './$types';

// Notes are internal-team only (same gate as wiki). One check here cascades to
// every child route. The lists drive the persistent left sidebar, so they load
// once at the layout and stay live across note navigation.
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!isTrackrTeam(locals)) error(403, m.notes_err_restricted());
	const userId = locals.user!.id;
	const [mine, shared, meetings, templates, tasks] = await Promise.all([
		listQuickNotes(userId),
		listSharedWithMe(userId),
		listMeetingNotes(),
		listTemplates(),
		// Tasks feed the meeting-note task picker (filtered client-side by the
		// chosen project) and the task chip on a meeting note's header. Team-only
		// feature, so all live tasks are in scope.
		db
			.select({
				id: task.id,
				number: task.number,
				title: task.title,
				projectId: task.projectId
			})
			.from(task)
			.where(isNull(task.deletedAt))
			.orderBy(asc(task.projectId), asc(task.number))
	]);
	// Persisted sidebar tab — seeded into the sidebar so SSR renders the right
	// tab (no client-side notes→meetings flicker on reload).
	const prefs = locals.preferences ?? (await getPreferences(userId));
	const notesView = (prefs.viewState?.notes ?? {}) as { tab?: string };
	const viewTab: 'notes' | 'meetings' = notesView.tab === 'meetings' ? 'meetings' : 'notes';

	return {
		mine,
		shared,
		meetings,
		templates: templates.map((t) => ({ id: t.id, name: t.name, icon: t.icon })),
		tasks,
		viewTab
	};
};
