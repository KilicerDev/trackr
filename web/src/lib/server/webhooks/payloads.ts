/**
 * Compact entity snapshots for the payload `data` object. Ids are bare UUIDs
 * (trackr has no prefixed ids); `ref` is the human id (ACME-T-142, TRACK-91)
 * and `url` the absolute app link. No user emails, ever.
 */

import { absoluteUrl, truncateBody } from './emit';

export type TicketSnapshotInput = {
	id: string;
	displayId: string;
	orgId: string;
	subject: string;
	status?: string | null;
	priority?: string | null;
	category?: string | null;
	assigneeIds: string[];
	customerId?: string | null;
};

export function ticketSnapshot(t: TicketSnapshotInput, origin?: string | null) {
	return {
		id: t.id,
		ref: t.displayId,
		organizationId: t.orgId,
		subject: t.subject,
		status: t.status ?? null,
		priority: t.priority ?? null,
		category: t.category ?? null,
		assigneeIds: t.assigneeIds,
		customerId: t.customerId ?? null,
		url: absoluteUrl(`/tickets/${t.id}`, origin)
	};
}

export type TaskSnapshotInput = {
	id: string;
	displayId: string;
	projectId: string;
	title: string;
	status?: string | null;
	priority?: string | null;
	type?: string | null;
	assigneeIds?: string[];
	dueDate?: Date | string | null;
};

export function taskSnapshot(t: TaskSnapshotInput, origin?: string | null) {
	return {
		id: t.id,
		ref: t.displayId,
		projectId: t.projectId,
		title: t.title,
		status: t.status ?? null,
		priority: t.priority ?? null,
		type: t.type ?? null,
		assigneeIds: t.assigneeIds ?? [],
		dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : null,
		url: absoluteUrl(`/tasks?task=${encodeURIComponent(t.displayId)}`, origin)
	};
}

export type ProjectSnapshotInput = {
	id: string;
	key: string;
	name: string;
	orgId: string | null;
	status?: string | null;
	tags?: string[] | null;
};

export function projectSnapshot(p: ProjectSnapshotInput, origin?: string | null) {
	return {
		id: p.id,
		key: p.key,
		name: p.name,
		organizationId: p.orgId,
		status: p.status ?? null,
		tags: p.tags ?? [],
		url: absoluteUrl(`/projects/${p.id}`, origin)
	};
}

export function userRef(u: { id: string; name: string | null }) {
	return { id: u.id, name: u.name ?? null };
}

/** The slice of an attachment row the snapshot needs (`AttachmentPublic` fits). */
export type AttachmentSnapshotInput = {
	id: string;
	filename: string;
	mimeType: string;
	sizeBytes: number;
	width?: number | null;
	height?: number | null;
	hasThumbnail?: boolean;
};

/**
 * A file attached to the entity/message the event is about. `url` serves the
 * bytes inline, `downloadUrl` forces a download, `thumbnailUrl` is a 480px
 * WebP for images that got one. All three sit behind the app's session/bearer
 * auth — the receiver needs a Trackr credential to fetch them.
 */
export function attachmentSnapshot(a: AttachmentSnapshotInput, origin?: string | null) {
	const base = `/api/attachments/${a.id}`;
	return {
		id: a.id,
		filename: a.filename,
		mimeType: a.mimeType,
		sizeBytes: a.sizeBytes,
		isImage: a.mimeType.startsWith('image/'),
		width: a.width ?? null,
		height: a.height ?? null,
		url: absoluteUrl(base, origin),
		downloadUrl: absoluteUrl(`${base}/download`, origin),
		thumbnailUrl: a.hasThumbnail ? absoluteUrl(`${base}?thumb`, origin) : null
	};
}

export function attachmentSnapshots(
	list: readonly AttachmentSnapshotInput[] | null | undefined,
	origin?: string | null
) {
	return (list ?? []).map((a) => attachmentSnapshot(a, origin));
}

export function messageSnapshot(
	msg: {
		id: string;
		body: string;
		internal?: boolean;
		authorId?: string | null;
		createdAt?: Date | null;
		attachments?: readonly AttachmentSnapshotInput[] | null;
	},
	origin?: string | null
) {
	return {
		id: msg.id,
		body: truncateBody(msg.body),
		internal: msg.internal ?? false,
		authorId: msg.authorId ?? null,
		createdAt: (msg.createdAt ?? new Date()).toISOString(),
		attachments: attachmentSnapshots(msg.attachments, origin)
	};
}

export function threadSnapshot(
	t: { id: string; orgId: string; title: string | null; status?: string | null },
	origin?: string | null
) {
	return {
		id: t.id,
		organizationId: t.orgId,
		title: t.title,
		status: t.status ?? null,
		url: absoluteUrl(`/chat?org=${t.orgId}&thread=${t.id}`, origin)
	};
}
