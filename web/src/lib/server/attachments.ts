/**
 * Attachments service — the database + storage + sharp logic behind the upload,
 * serve, and delete endpoints.
 *
 * Attachments are polymorphic (see the `attachment` table): a row points at one
 * of several parent kinds via `entity_type` + `entity_id`. This module owns:
 *   - storing/serving the bytes (delegating to the storage layer),
 *   - generating image niceties (thumbnail + thumbhash) when the file decodes
 *     as a non-SVG raster image,
 *   - resolving the parent's permission scope and authorizing access.
 *
 * Permission rules live here (not in the routes) because they require parent
 * lookups; every route calls `authorizeAttachmentAccess` before touching bytes.
 */

import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';
import { db } from '$lib/server/db';
import {
	attachment,
	ticket,
	ticketAssignee,
	ticketMessage,
	task,
	projectActivity,
	note,
	message,
	thread,
	type Attachment
} from '$lib/server/db/app.schema';
import { storage } from '$lib/server/storage';
import { can, isTrackrTeam } from '$lib/server/permissions';
import {
	MAX_UPLOAD_BYTES,
	THUMBNAIL_FORMATS,
	THUMBNAIL_WIDTH,
	type AttachmentEntityType,
	type ThumbnailFormat
} from '$lib/config/attachments';

// ─── Storage keys ────────────────────────────────────────────────────────────

const baseKey = (id: string) => `attachments/${id}`;
export const originalKey = (a: Pick<Attachment, 'storageKey'>) => `${a.storageKey}/original`;
export const thumbKey = (a: Pick<Attachment, 'storageKey'>) => `${a.storageKey}/thumb`;

// ─── Public projection (strips the binary thumbhash) ─────────────────────────

/** An `Attachment` as exposed to consumers — raw thumbhash bytes stripped. */
export type AttachmentPublic = Omit<Attachment, 'thumbhash'>;

function toPublic(row: Attachment): AttachmentPublic {
	// Strip the binary thumbhash — it should never round-trip through JSON/SSR.
	const rest = { ...row };
	delete (rest as Partial<Attachment>).thumbhash;
	return rest;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/** Raised for caller-fixable upload problems (mapped to 4xx by the route). */
export class AttachmentError extends Error {
	constructor(
		message: string,
		public readonly code: 'too_large' | 'empty'
	) {
		super(message);
		this.name = 'AttachmentError';
	}
}

// ─── Image helpers ─────────────────────────────────────────────────────────--

const MIME_BY_FORMAT: Record<ThumbnailFormat, string> = {
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	avif: 'image/avif',
	gif: 'image/gif',
	heif: 'image/heif'
};

/**
 * EXIF orientation tags 5-8 store the image rotated a quarter turn, so the
 * decoded pixel width/height are swapped relative to how it should display.
 */
function appliesQuarterTurn(orientation: number | undefined): boolean {
	return orientation !== undefined && orientation >= 5 && orientation <= 8;
}

interface ImageInfo {
	format: ThumbnailFormat;
	width: number | null;
	height: number | null;
}

/**
 * Probe bytes with sharp. Returns image info if the file decodes as a raster
 * image in an allow-listed format, else null (treated as a generic file). SVG
 * decodes via sharp but is excluded by the allow-list — it can carry script.
 */
async function probeImage(bytes: Buffer): Promise<ImageInfo | null> {
	let metadata: sharp.Metadata;
	try {
		metadata = await sharp(bytes).metadata();
	} catch {
		return null;
	}
	const format = metadata.format as ThumbnailFormat | undefined;
	if (!format || !(THUMBNAIL_FORMATS as readonly string[]).includes(format)) return null;
	const quarterTurn = appliesQuarterTurn(metadata.orientation);
	return {
		format,
		width: (quarterTurn ? metadata.height : metadata.width) ?? null,
		height: (quarterTurn ? metadata.width : metadata.height) ?? null
	};
}

/**
 * Generate a ThumbHash — a tiny (~25 byte) blurred preview painted as a
 * placeholder before the real thumbnail loads. Non-fatal: failure stores null.
 * thumbhash caps inputs at 100×100, so we downscale inside that box.
 */
async function computeThumbhash(bytes: Buffer): Promise<Uint8Array | null> {
	try {
		const { data, info } = await sharp(bytes)
			.rotate()
			.resize(100, 100, { fit: 'inside', withoutEnlargement: true })
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		return rgbaToThumbHash(info.width, info.height, data);
	} catch (err) {
		console.error('[attachments] failed to compute thumbhash', err);
		return null;
	}
}

// ─── Create ────────────────────────────────────────────────────────────────--

export interface CreateAttachmentInput {
	entityType: AttachmentEntityType;
	entityId: string;
	/** Resolved parent scope — denormalized onto the row for fast authz. */
	orgId: string | null;
	projectId: string | null;
	bytes: Buffer;
	filename: string;
	/** Client-declared MIME; trusted only for non-images. */
	mimeType: string;
	uploadedBy?: string | null;
}

/**
 * Validate, store, and record an uploaded file. Images additionally get a
 * thumbnail + thumbhash. The entity row is expected to already exist; we store
 * the original first, then the thumbnail, then insert the metadata row.
 */
export async function createAttachment(input: CreateAttachmentInput): Promise<AttachmentPublic> {
	if (input.bytes.length === 0) throw new AttachmentError('File is empty.', 'empty');
	if (input.bytes.length > MAX_UPLOAD_BYTES) {
		throw new AttachmentError('File exceeds the maximum upload size.', 'too_large');
	}

	const id = randomUUID();
	const storageKey = baseKey(id);

	await storage.put(`${storageKey}/original`, input.bytes);

	const image = await probeImage(input.bytes);
	let hasThumbnail = false;
	let thumbhash: Uint8Array | null = null;
	if (image) {
		try {
			const thumb = await sharp(input.bytes)
				.rotate()
				.resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
				.webp({ quality: 80 })
				.toBuffer();
			await storage.put(`${storageKey}/thumb`, thumb);
			hasThumbnail = true;
		} catch (err) {
			console.error('[attachments] failed to generate thumbnail', err);
		}
		thumbhash = await computeThumbhash(input.bytes);
	}

	// For images, trust the decoded format over the client MIME; otherwise keep
	// the declared type (falling back to a safe default).
	const mimeType = image
		? MIME_BY_FORMAT[image.format]
		: input.mimeType || 'application/octet-stream';

	const [row] = await db
		.insert(attachment)
		.values({
			id,
			entityType: input.entityType,
			entityId: input.entityId,
			orgId: input.orgId,
			projectId: input.projectId,
			uploadedBy: input.uploadedBy ?? null,
			storageKey,
			filename: input.filename,
			mimeType,
			sizeBytes: input.bytes.length,
			width: image?.width ?? null,
			height: image?.height ?? null,
			hasThumbnail,
			thumbhash: thumbhash ?? null
		})
		.returning();
	return toPublic(row);
}

/**
 * Attach a batch of already-uploaded form files to an entity that was just
 * created. Best-effort: each file is independent, failures are logged and
 * counted but never abort the others (the parent entity already exists — a
 * failed attachment must not roll it back). Returns success/failure counts.
 *
 * `files` typically comes from `formData.getAll('attachments')`; non-File and
 * empty entries are skipped.
 */
export async function attachFormFiles(opts: {
	files: FormDataEntryValue[];
	entityType: AttachmentEntityType;
	entityId: string;
	orgId: string | null;
	projectId: string | null;
	uploadedBy?: string | null;
}): Promise<{ ok: number; failed: number }> {
	let ok = 0;
	let failed = 0;
	for (const entry of opts.files) {
		if (!(entry instanceof File) || entry.size === 0) continue;
		try {
			await createAttachment({
				entityType: opts.entityType,
				entityId: opts.entityId,
				orgId: opts.orgId,
				projectId: opts.projectId,
				bytes: Buffer.from(await entry.arrayBuffer()),
				filename: entry.name || 'file',
				mimeType: entry.type,
				uploadedBy: opts.uploadedBy ?? null
			});
			ok++;
		} catch (err) {
			console.error('[attachments] failed to attach staged file', entry.name, err);
			failed++;
		}
	}
	return { ok, failed };
}

// ─── Read ────────────────────────────────────────────────────────────────────

/** List non-deleted attachments for one entity, newest first. */
export async function listAttachments(
	entityType: AttachmentEntityType,
	entityId: string
): Promise<AttachmentPublic[]> {
	const rows = await db
		.select()
		.from(attachment)
		.where(
			and(
				eq(attachment.entityType, entityType),
				eq(attachment.entityId, entityId),
				isNull(attachment.deletedAt)
			)
		)
		.orderBy(desc(attachment.createdAt));
	return rows.map(toPublic);
}

/** List attachments for many entities of one kind, grouped by entity id. */
export async function listAttachmentsForMany(
	entityType: AttachmentEntityType,
	entityIds: string[]
): Promise<Map<string, AttachmentPublic[]>> {
	const out = new Map<string, AttachmentPublic[]>();
	if (entityIds.length === 0) return out;
	const rows = await db
		.select()
		.from(attachment)
		.where(
			and(
				eq(attachment.entityType, entityType),
				inArray(attachment.entityId, entityIds),
				isNull(attachment.deletedAt)
			)
		)
		.orderBy(desc(attachment.createdAt));
	for (const row of rows) {
		const list = out.get(row.entityId);
		if (list) list.push(toPublic(row));
		else out.set(row.entityId, [toPublic(row)]);
	}
	return out;
}

/** Load a single non-deleted attachment row (with thumbhash for the placeholder). */
export async function getAttachment(id: string): Promise<Attachment | null> {
	const [row] = await db
		.select()
		.from(attachment)
		.where(and(eq(attachment.id, id), isNull(attachment.deletedAt)))
		.limit(1);
	return row ?? null;
}

// ─── Delete ────────────────────────────────────────────────────────────────--

/**
 * Soft-delete one attachment and remove its files. The row is marked deleted
 * first (it stops being served immediately); files go after (an orphaned file
 * is harmless). Idempotent.
 */
export async function deleteAttachment(
	row: Pick<Attachment, 'id' | 'storageKey' | 'hasThumbnail'>
) {
	await db.update(attachment).set({ deletedAt: new Date() }).where(eq(attachment.id, row.id));
	await storage.delete(originalKey(row));
	if (row.hasThumbnail) await storage.delete(thumbKey(row));
}

/**
 * Cleanup hook for parent deletions: soft-delete every attachment on an entity
 * and remove their files. Called from the ticket/task/wiki/comment delete paths.
 */
export async function deleteAttachmentsFor(
	entityType: AttachmentEntityType,
	entityId: string
): Promise<void> {
	const rows = await db
		.select()
		.from(attachment)
		.where(
			and(
				eq(attachment.entityType, entityType),
				eq(attachment.entityId, entityId),
				isNull(attachment.deletedAt)
			)
		);
	for (const row of rows) await deleteAttachment(row);
}

// ─── Authorization ─────────────────────────────────────────────────────────--

type Locals = Parameters<typeof can>[0];

interface EntityContext {
	orgId: string | null;
	projectId: string | null;
	/** Owner user ids, for ticket `read.own` checks. */
	ticketOwners: string[];
	/** For a `message` attachment: which permission model applies (the thread's
	 * subject). Lets one polymorphic type carry chat / ticket / task semantics. */
	messageSubject?: 'org' | 'ticket' | 'task';
}

/**
 * Resolve a parent entity's permission scope, proving it exists. Returns null
 * if the parent (or its grandparent) is missing — the route turns that into 404.
 */
async function ticketAssigneeIds(ticketId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: ticketAssignee.userId })
		.from(ticketAssignee)
		.where(eq(ticketAssignee.ticketId, ticketId));
	return rows.map((r) => r.userId);
}

export async function resolveEntityContext(
	entityType: AttachmentEntityType,
	entityId: string
): Promise<EntityContext | null> {
	switch (entityType) {
		case 'ticket': {
			const [row] = await db
				.select({
					orgId: ticket.orgId,
					customerId: ticket.customerId,
					createdBy: ticket.createdBy
				})
				.from(ticket)
				.where(and(eq(ticket.id, entityId), isNull(ticket.deletedAt)))
				.limit(1);
			if (!row) return null;
			const assignees = await ticketAssigneeIds(entityId);
			return {
				orgId: row.orgId,
				projectId: null,
				ticketOwners: [row.customerId, row.createdBy, ...assignees].filter((v): v is string => !!v)
			};
		}
		case 'ticket_message': {
			const [row] = await db
				.select({
					ticketId: ticket.id,
					orgId: ticket.orgId,
					customerId: ticket.customerId,
					createdBy: ticket.createdBy
				})
				.from(ticketMessage)
				.innerJoin(ticket, eq(ticket.id, ticketMessage.ticketId))
				.where(and(eq(ticketMessage.id, entityId), isNull(ticket.deletedAt)))
				.limit(1);
			if (!row) return null;
			const assignees = await ticketAssigneeIds(row.ticketId);
			return {
				orgId: row.orgId,
				projectId: null,
				ticketOwners: [row.customerId, row.createdBy, ...assignees].filter((v): v is string => !!v)
			};
		}
		case 'task': {
			const [row] = await db
				.select({ projectId: task.projectId })
				.from(task)
				.where(and(eq(task.id, entityId), isNull(task.deletedAt)))
				.limit(1);
			if (!row) return null;
			return { orgId: null, projectId: row.projectId, ticketOwners: [] };
		}
		case 'project_activity': {
			const [row] = await db
				.select({ projectId: projectActivity.projectId })
				.from(projectActivity)
				.where(eq(projectActivity.id, entityId))
				.limit(1);
			if (!row) return null;
			return { orgId: null, projectId: row.projectId, ticketOwners: [] };
		}
		case 'wiki_page':
			// Wiki is Trackr-team-only; no org/project scope.
			return { orgId: null, projectId: null, ticketOwners: [] };
		case 'note': {
			// Notes are Trackr-team-only (like wiki); just prove existence.
			const [row] = await db
				.select({ id: note.id })
				.from(note)
				.where(eq(note.id, entityId))
				.limit(1);
			if (!row) return null;
			return { orgId: null, projectId: null, ticketOwners: [] };
		}
		case 'message': {
			// A message's scope comes from its thread's subject: org chat, a ticket,
			// or a task. Resolve it so the right permission model applies below.
			const [row] = await db
				.select({ subjectType: thread.subjectType, subjectId: thread.subjectId })
				.from(message)
				.innerJoin(thread, eq(thread.id, message.threadId))
				.where(and(eq(message.id, entityId), isNull(message.deletedAt), isNull(thread.deletedAt)))
				.limit(1);
			if (!row) return null;
			if (row.subjectType === 'org') {
				return { orgId: row.subjectId, projectId: null, ticketOwners: [], messageSubject: 'org' };
			}
			if (row.subjectType === 'ticket') {
				const [t] = await db
					.select({
						orgId: ticket.orgId,
						customerId: ticket.customerId,
						createdBy: ticket.createdBy
					})
					.from(ticket)
					.where(and(eq(ticket.id, row.subjectId), isNull(ticket.deletedAt)))
					.limit(1);
				if (!t) return null;
				const assignees = await ticketAssigneeIds(row.subjectId);
				return {
					orgId: t.orgId,
					projectId: null,
					ticketOwners: [t.customerId, t.createdBy, ...assignees].filter((v): v is string => !!v),
					messageSubject: 'ticket'
				};
			}
			if (row.subjectType === 'task') {
				const [tk] = await db
					.select({ projectId: task.projectId })
					.from(task)
					.where(and(eq(task.id, row.subjectId), isNull(task.deletedAt)))
					.limit(1);
				if (!tk) return null;
				return { orgId: null, projectId: tk.projectId, ticketOwners: [], messageSubject: 'task' };
			}
			return null;
		}
	}
}

export type AccessMode = 'read' | 'write';

/**
 * Authorize a user for an entity's attachments. Returns false on denial (the
 * route turns that into 403). Read = may view the parent; write = may
 * contribute to it (upload/delete). Deletion additionally allows the uploader
 * (checked by the caller).
 */
export async function authorizeAttachmentAccess(
	locals: Locals,
	entityType: AttachmentEntityType,
	ctx: EntityContext,
	mode: AccessMode
): Promise<boolean> {
	switch (entityType) {
		case 'ticket':
		case 'ticket_message': {
			const orgId = ctx.orgId;
			if (!orgId) return false;
			if (mode === 'write') {
				return (
					(await can(locals, 'org.tickets.edit.any', { orgId })) ||
					(await can(locals, 'org.tickets.comment', { orgId }))
				);
			}
			if (await can(locals, 'org.tickets.read.any', { orgId })) return true;
			const uid = locals.user?.id;
			if (uid && ctx.ticketOwners.includes(uid)) {
				return can(locals, 'org.tickets.read.own', { orgId });
			}
			return false;
		}
		case 'task':
		case 'project_activity': {
			const projectId = ctx.projectId;
			if (!projectId) return false;
			if (mode === 'write') {
				return (
					(await can(locals, 'project.tasks.edit.any', { projectId })) ||
					(await can(locals, 'project.tasks.comment', { projectId }))
				);
			}
			return can(locals, 'project.tasks.read', { projectId });
		}
		case 'wiki_page':
		case 'note':
			// Both read and write require Trackr-team membership.
			return isTrackrTeam(locals);
		case 'message': {
			// Dispatch to the same model as the message's thread subject.
			if (ctx.messageSubject === 'ticket') {
				const orgId = ctx.orgId;
				if (!orgId) return false;
				if (mode === 'write') {
					return (
						(await can(locals, 'org.tickets.edit.any', { orgId })) ||
						(await can(locals, 'org.tickets.comment', { orgId }))
					);
				}
				if (await can(locals, 'org.tickets.read.any', { orgId })) return true;
				const uid = locals.user?.id;
				if (uid && ctx.ticketOwners.includes(uid)) {
					return can(locals, 'org.tickets.read.own', { orgId });
				}
				return false;
			}
			if (ctx.messageSubject === 'task') {
				const projectId = ctx.projectId;
				if (!projectId) return false;
				if (mode === 'write') {
					return (
						(await can(locals, 'project.tasks.edit.any', { projectId })) ||
						(await can(locals, 'project.tasks.comment', { projectId }))
					);
				}
				return can(locals, 'project.tasks.read', { projectId });
			}
			// org chat
			const orgId = ctx.orgId;
			if (!orgId) return false;
			return can(locals, mode === 'write' ? 'org.chat.post' : 'org.chat.read', { orgId });
		}
	}
}

/**
 * Authorize *deletion* of an attachment — stricter than upload. External org
 * users (member/client) may attach files but never delete them; only agents
 * (org.tickets.edit.any) can remove ticket attachments. For internal task work
 * the original uploader or a project editor may delete; wiki is team-only.
 */
export async function authorizeAttachmentDelete(
	locals: Locals,
	row: Pick<Attachment, 'entityType' | 'uploadedBy'>,
	ctx: EntityContext
): Promise<boolean> {
	switch (row.entityType) {
		case 'ticket':
		case 'ticket_message':
			return ctx.orgId ? can(locals, 'org.tickets.edit.any', { orgId: ctx.orgId }) : false;
		case 'task':
		case 'project_activity': {
			if (locals.user?.id && row.uploadedBy === locals.user.id) return true;
			return ctx.projectId
				? can(locals, 'project.tasks.edit.any', { projectId: ctx.projectId })
				: false;
		}
		case 'wiki_page':
		case 'note':
			return isTrackrTeam(locals);
		case 'message': {
			if (ctx.messageSubject === 'ticket') {
				return ctx.orgId ? can(locals, 'org.tickets.edit.any', { orgId: ctx.orgId }) : false;
			}
			// Task and org-chat: the uploader may remove their own file; otherwise
			// requires edit/post rights on the project / org.
			if (locals.user?.id && row.uploadedBy === locals.user.id) return true;
			if (ctx.messageSubject === 'task') {
				return ctx.projectId
					? can(locals, 'project.tasks.edit.any', { projectId: ctx.projectId })
					: false;
			}
			return ctx.orgId ? can(locals, 'org.chat.post', { orgId: ctx.orgId }) : false;
		}
	}
}
