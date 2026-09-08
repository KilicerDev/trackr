import { json, error } from '@sveltejs/kit';
import {
	authorizeAttachmentAccess,
	authorizeAttachmentDelete,
	deleteAttachment,
	getAttachment,
	originalKey,
	resolveEntityContext,
	thumbKey
} from '$lib/server/attachments';
import { storage, StorageObjectNotFoundError } from '$lib/server/storage';
import type { RequestHandler } from './$types';

/** Build a Content-Disposition header with a UTF-8 filename and ASCII fallback. */
function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
	const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Serve an attachment's bytes.
 *
 * `?thumb` serves the generated WebP thumbnail (images only); otherwise the
 * original. Gated by the parent's read permission. Content is immutable
 * (id-keyed), so it is cacheable — but `private`, since attachments are not
 * public. SVGs are always sent as a download to avoid inline script execution.
 */
export const GET: RequestHandler = async ({ params, url, request, locals }) => {
	if (!locals.user) error(401, 'Not authenticated');

	const row = await getAttachment(params.id);
	if (!row) error(404, 'Attachment not found');

	const ctx = await resolveEntityContext(row.entityType, row.entityId);
	if (!ctx) error(404, 'Attachment not found');
	if (!(await authorizeAttachmentAccess(locals, row.entityType, ctx, 'read'))) {
		error(403, 'You do not have permission to view this file.');
	}

	const wantThumb = url.searchParams.has('thumb') && row.hasThumbnail;
	const etag = `"${row.id}-${wantThumb ? 'thumb' : 'original'}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag } });
	}

	const isSvg = row.mimeType === 'image/svg+xml';
	const key = wantThumb ? thumbKey(row) : originalKey(row);
	const contentType = wantThumb ? 'image/webp' : row.mimeType;
	// Render thumbnails/raster images inline; force SVG to download.
	const disposition = isSvg && !wantThumb ? 'attachment' : 'inline';

	let stream: ReadableStream<Uint8Array>;
	try {
		stream = await storage.getStream(key);
	} catch (err) {
		if (err instanceof StorageObjectNotFoundError) error(404, 'File not found');
		throw err;
	}

	return new Response(stream, {
		headers: {
			'content-type': contentType,
			'content-disposition': contentDisposition(disposition, row.filename),
			'cache-control': 'private, max-age=31536000, immutable',
			etag
		}
	});
};

/**
 * Delete an attachment. Allowed for anyone who can contribute to the parent
 * (write access), plus the original uploader.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ message: 'Not authenticated' }, { status: 401 });

	const row = await getAttachment(params.id);
	if (!row) return json({ message: 'Attachment not found' }, { status: 404 });

	const ctx = await resolveEntityContext(row.entityType, row.entityId);
	if (!ctx) return json({ message: 'Attachment not found' }, { status: 404 });

	if (!(await authorizeAttachmentDelete(locals, row, ctx))) {
		return json({ message: 'You do not have permission to delete this file.' }, { status: 403 });
	}

	await deleteAttachment(row, locals.user.id);
	return new Response(null, { status: 204 });
};
