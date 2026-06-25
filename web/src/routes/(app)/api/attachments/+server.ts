import { json } from '@sveltejs/kit';
import {
	authorizeAttachmentAccess,
	createAttachment,
	resolveEntityContext,
	AttachmentError
} from '$lib/server/attachments';
import { ATTACHMENT_ENTITY_TYPES, type AttachmentEntityType } from '$lib/config/attachments';
import type { RequestHandler } from './$types';

const ENTITY_TYPES = new Set<string>(ATTACHMENT_ENTITY_TYPES);

/**
 * Upload one file and attach it to an entity.
 *
 * Body: multipart/form-data with `file` (File), `entityType`, `entityId`.
 * The parent must already exist; the client-supplied scope is never trusted —
 * we resolve org/project from the parent and authorize against it.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ message: 'Not authenticated' }, { status: 401 });

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json({ message: 'Invalid form data' }, { status: 400 });
	}

	const entityType = form.get('entityType');
	const entityId = form.get('entityId');
	const file = form.get('file');

	if (typeof entityType !== 'string' || !ENTITY_TYPES.has(entityType)) {
		return json({ message: 'Invalid entityType' }, { status: 400 });
	}
	if (typeof entityId !== 'string' || !entityId) {
		return json({ message: 'Missing entityId' }, { status: 400 });
	}
	if (!(file instanceof File)) {
		return json({ message: 'Missing file' }, { status: 400 });
	}

	const ctx = await resolveEntityContext(entityType as AttachmentEntityType, entityId);
	if (!ctx) return json({ message: 'Parent not found' }, { status: 404 });
	if (
		!(await authorizeAttachmentAccess(locals, entityType as AttachmentEntityType, ctx, 'write'))
	) {
		return json({ message: 'You do not have permission to attach files here.' }, { status: 403 });
	}

	const bytes = Buffer.from(await file.arrayBuffer());
	try {
		const attachment = await createAttachment({
			entityType: entityType as AttachmentEntityType,
			entityId,
			orgId: ctx.orgId,
			projectId: ctx.projectId,
			bytes,
			filename: file.name || 'file',
			mimeType: file.type,
			uploadedBy: locals.user.id
		});
		return json({ attachment }, { status: 201 });
	} catch (err) {
		if (err instanceof AttachmentError) {
			return json({ message: err.message }, { status: err.code === 'too_large' ? 413 : 400 });
		}
		throw err;
	}
};
