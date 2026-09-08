import { fail } from '@sveltejs/kit';
import { isTrackrTeam } from '$lib/server/permissions';
import { createNote, getNote, setPinned } from '$lib/server/notes';
import { m } from '$lib/paraglide/messages';
import type { Actions } from './$types';

export const actions: Actions = {
	// Instant blank quick note — no title prompt; the caller redirects to the
	// editor on success. `parentId` nests it under one of the caller's notes.
	create: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: m.notes_err_not_authenticated() });
		if (!isTrackrTeam(locals)) return fail(403, { message: m.notes_err_restricted_short() });
		const form = await request.formData();
		const parentRaw = form.get('parentId');
		const parentId = typeof parentRaw === 'string' && parentRaw ? parentRaw : null;
		try {
			const id = await createNote({ kind: 'quick', ownerId: locals.user.id, parentId });
			return { success: true, id };
		} catch {
			return fail(400, { message: m.notes_err_parent_not_found() });
		}
	},

	createMeeting: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: m.notes_err_not_authenticated() });
		if (!isTrackrTeam(locals)) return fail(403, { message: m.notes_err_restricted_short() });
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const projectId = String(form.get('projectId') ?? '');
		const taskRaw = form.get('taskId');
		const templateRaw = form.get('templateId');
		const dateRaw = String(form.get('meetingDate') ?? '');

		// Meeting notes are REQUIRED to link a project (the organizing key); the
		// task is optional and scoped to that project.
		if (!projectId) return fail(400, { message: m.notes_err_project_required() });
		if (title.length > 120) return fail(400, { message: m.notes_err_title_too_long() });

		const meetingDate = dateRaw ? new Date(dateRaw) : new Date();
		const id = await createNote({
			kind: 'meeting',
			ownerId: locals.user.id,
			title,
			projectId,
			taskId: typeof taskRaw === 'string' && taskRaw ? taskRaw : null,
			templateId: typeof templateRaw === 'string' && templateRaw ? templateRaw : null,
			meetingDate: isNaN(meetingDate.getTime()) ? new Date() : meetingDate
		});
		return { success: true, id };
	},

	pin: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: m.notes_err_not_authenticated() });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const pinned = String(form.get('pinned') ?? '') === 'true';
		const target = await getNote(id);
		if (!target || target.ownerId !== locals.user.id)
			return fail(403, { message: m.notes_err_restricted_short() });
		await setPinned(id, pinned, locals.user.id);
		return { success: true };
	}
};
