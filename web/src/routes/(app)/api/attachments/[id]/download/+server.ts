import { error } from '@sveltejs/kit';
import {
	authorizeAttachmentAccess,
	getAttachment,
	originalKey,
	resolveEntityContext
} from '$lib/server/attachments';
import { storage, StorageObjectNotFoundError } from '$lib/server/storage';
import type { RequestHandler } from './$types';

function contentDisposition(filename: string): string {
	const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Serve the original bytes as a forced download (Content-Disposition: attachment). */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Not authenticated');

	const row = await getAttachment(params.id);
	if (!row) error(404, 'Attachment not found');

	const ctx = await resolveEntityContext(row.entityType, row.entityId);
	if (!ctx) error(404, 'Attachment not found');
	if (!(await authorizeAttachmentAccess(locals, row.entityType, ctx, 'read'))) {
		error(403, 'You do not have permission to download this file.');
	}

	let stream: ReadableStream<Uint8Array>;
	try {
		stream = await storage.getStream(originalKey(row));
	} catch (err) {
		if (err instanceof StorageObjectNotFoundError) error(404, 'File not found');
		throw err;
	}

	return new Response(stream, {
		headers: {
			'content-type': row.mimeType,
			'content-disposition': contentDisposition(row.filename),
			'cache-control': 'private, max-age=31536000, immutable'
		}
	});
};
