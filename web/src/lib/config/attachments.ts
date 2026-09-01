/**
 * Shared attachment constants — safe to import from both client and server.
 *
 * The server enforces these (size cap, format probing); the client uses them
 * to pre-reject obviously-bad files and to render the right UI. Keeping them
 * here means the limits never drift between the two sides.
 */

/** Maximum size of a single uploaded file, in bytes (25 MiB). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Maximum number of files that may be staged in one create/upload batch. */
export const MAX_FILES_PER_BATCH = 20;

/**
 * Image formats we generate a thumbnail + blur placeholder for. SVG is
 * deliberately excluded — it can carry embedded script (stored XSS), so SVGs
 * are kept as plain downloadable files with no image processing.
 */
export const THUMBNAIL_FORMATS = ['jpeg', 'png', 'webp', 'avif', 'gif', 'heif'] as const;
export type ThumbnailFormat = (typeof THUMBNAIL_FORMATS)[number];

/** Width (px) of the generated WebP thumbnail. Images are never upscaled. */
export const THUMBNAIL_WIDTH = 480;

/**
 * File types a note accepts — document formats meant to be downloaded, not
 * previewed: PDF, XML, Excel, ZIP, plain text. Matched by extension (browsers
 * report inconsistent MIME values for these formats); the upload endpoint
 * enforces the same list server-side.
 */
export const NOTE_FILE_EXTENSIONS = ['pdf', 'xml', 'xls', 'xlsx', 'zip', 'txt'] as const;

/** `accept` attribute value for note file pickers. */
export const NOTE_FILE_ACCEPT = NOTE_FILE_EXTENSIONS.map((e) => `.${e}`).join(',');

/** Whether `filename` is one of the formats notes accept. */
export function isAllowedNoteFile(filename: string): boolean {
	const dot = filename.lastIndexOf('.');
	if (dot < 0) return false;
	const ext = filename.slice(dot + 1).toLowerCase();
	return (NOTE_FILE_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * The kinds of entity an attachment can hang off. Mirrors the column strings
 * stored in `attachment.entity_type`. Heterogeneous parents (org-scoped
 * tickets, project-scoped tasks, team-only wiki pages, two comment tables) is
 * exactly why the table is polymorphic rather than one FK column per parent.
 */
export const ATTACHMENT_ENTITY_TYPES = [
	'ticket',
	'task',
	'wiki_page',
	'note',
	'ticket_message',
	'project_activity',
	'message'
] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

/**
 * An attachment as exposed to the client (matches the server's `AttachmentPublic`
 * projection, minus the binary thumbhash). Defined here so client components can
 * type their props without importing server-only modules. `createdAt` arrives as
 * a Date through SvelteKit's load serialization but may be a string elsewhere.
 */
export interface AttachmentDTO {
	id: string;
	entityType: AttachmentEntityType;
	entityId: string;
	filename: string;
	mimeType: string;
	sizeBytes: number;
	width: number | null;
	height: number | null;
	hasThumbnail: boolean;
	uploadedBy: string | null;
	createdAt: string | Date;
}

/**
 * Partition incoming files into those that can be staged and human-readable
 * rejection reasons (oversize, or over the per-batch count). Pure — the caller
 * decides how to surface the errors (toast, inline, …).
 */
export function selectStageable(
	incoming: File[],
	currentCount: number
): { accepted: File[]; errors: string[] } {
	const accepted: File[] = [];
	const errors: string[] = [];
	let room = MAX_FILES_PER_BATCH - currentCount;
	for (const file of incoming) {
		if (file.size > MAX_UPLOAD_BYTES) {
			errors.push(`"${file.name}" exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`);
			continue;
		}
		if (room <= 0) {
			errors.push(`You can attach at most ${MAX_FILES_PER_BATCH} files at once.`);
			break;
		}
		accepted.push(file);
		room--;
	}
	return { accepted, errors };
}

/** Format a byte count as a short human string (e.g. "1.2 MB"). */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
