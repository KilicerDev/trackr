import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { document } from '$lib/server/db/app.schema';
import { user as userTable } from '$lib/server/db/auth.schema';
import { isTrackrTeam } from '$lib/server/permissions';
import {
	createShareLink,
	createTemplate,
	deleteNote,
	ensureDocumentForNote,
	getNote,
	listShareLinks,
	resolveNoteRole,
	revokeShareLink,
	updateNote
} from '$lib/server/notes';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	let note = await getNote(params.id);
	if (!note) error(404, m.notes_err_not_found());

	const role = await resolveNoteRole(note, locals.user!.id, locals.memberships!);
	if (!role) error(403, m.notes_err_no_access());

	if (!note.documentId) {
		await ensureDocumentForNote(note.id);
		note = (await getNote(params.id)) ?? note;
	}

	const isOwner = note.ownerId === locals.user!.id;
	const me = locals.user ? { id: locals.user.id, name: locals.user.name } : null;

	// Owner manages share links; others never see them.
	const shareLinks = isOwner ? await listShareLinks(note.id) : [];

	const updatedBy = note.updatedById
		? (
				await db
					.select({ id: userTable.id, name: userTable.name })
					.from(userTable)
					.where(eq(userTable.id, note.updatedById))
					.limit(1)
			)[0] ?? null
		: null;

	return { note, role, isOwner, me, shareLinks, updatedBy };
};

async function requireWrite(params: { id: string }, locals: App.Locals) {
	const note = await getNote(params.id);
	if (!note) return { note: null, role: null };
	const role = await resolveNoteRole(note, locals.user!.id, locals.memberships!);
	return { note, role };
}

export const actions: Actions = {
	update: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { message: m.notes_err_not_authenticated() });
		const { note, role } = await requireWrite(params, locals);
		if (!note) return fail(404, { message: m.notes_err_not_found() });
		if (role !== 'write') return fail(403, { message: m.notes_err_no_access() });

		const form = await request.formData();
		const title = form.get('title');
		const patch: { title?: string } = {};
		if (typeof title === 'string') {
			const t = title.trim();
			if (t.length > 120) return fail(400, { message: m.notes_err_title_too_long() });
			patch.title = t;
		}
		await updateNote(params.id, patch, locals.user.id);
		return { success: true };
	},

	delete: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { message: m.notes_err_not_authenticated() });
		const note = await getNote(params.id);
		if (!note) return fail(404, { message: m.notes_err_not_found() });
		// Only the owner can delete a note.
		if (note.ownerId !== locals.user.id) return fail(403, { message: m.notes_err_no_access() });
		await deleteNote(params.id);
		redirect(303, '/notes');
	},

	share: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { message: m.notes_err_not_authenticated() });
		const note = await getNote(params.id);
		if (!note) return fail(404, { message: m.notes_err_not_found() });
		if (note.ownerId !== locals.user.id) return fail(403, { message: m.notes_err_no_access() });
		const form = await request.formData();
		const role = String(form.get('role') ?? 'read') === 'write' ? 'write' : 'read';
		const token = await createShareLink(params.id, role, locals.user.id);
		return { success: true, token, role };
	},

	revokeShare: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { message: m.notes_err_not_authenticated() });
		const note = await getNote(params.id);
		if (!note || note.ownerId !== locals.user.id)
			return fail(403, { message: m.notes_err_no_access() });
		const form = await request.formData();
		const linkId = String(form.get('linkId') ?? '');
		await revokeShareLink(linkId);
		return { success: true };
	},

	saveAsTemplate: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { message: m.notes_err_not_authenticated() });
		if (!isTrackrTeam(locals)) return fail(403, { message: m.notes_err_restricted_short() });
		const note = await getNote(params.id);
		if (!note?.documentId) return fail(404, { message: m.notes_err_not_found() });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: m.notes_err_template_name_required() });

		// Capture the note's current derived HTML as the template skeleton.
		const [doc] = await db
			.select({ bodyHtml: document.bodyHtml })
			.from(document)
			.where(eq(document.id, note.documentId))
			.limit(1);
		await createTemplate({
			name,
			icon: note.icon,
			bodyHtml: doc?.bodyHtml ?? '',
			ownerId: locals.user.id
		});
		return { success: true };
	}
};
