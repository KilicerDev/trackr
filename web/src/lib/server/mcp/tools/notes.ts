// Notes tools — internal team only, then `resolveNoteRole` (own quick notes
// + share grants; meeting notes team-wide). Bodies are markdown on the wire,
// converted at the edge like the wiki tools; body writes go through
// `updateNoteBody` (collab-aware).

import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { project, task } from '$lib/server/db/app.schema';
import { isTrackrTeam } from '$lib/server/permissions';
import {
	createNote,
	deleteNote,
	getNote,
	getNoteWithBody,
	listMeetingNotes,
	listProjectMeetings,
	listQuickNotes,
	resolveNoteRole,
	updateNote,
	updateNoteBody,
	type NoteListItem
} from '$lib/server/notes'; // W2: getNoteWithBody, updateNoteBody
import { docHtmlToMarkdown, markdownToDocHtml } from '$lib/server/content/markdown'; // W2
import { resolveTaskByDisplayId } from '$lib/server/tasks'; // W2
import { day, iso, listMd } from '../format';
import { isUuid, normalizeDisplayId, normalizeKey } from '../ids';
import {
	DESTRUCTIVE,
	fail,
	guarded,
	limitSchema,
	parseDateInput,
	READ_ONLY,
	text,
	WRITE,
	WRITE_IDEMPOTENT,
	type McpContext
} from './shared';
import { loadAccessibleProject } from './tasks';

const noteIdSchema = z.string().describe('Note uuid (from `list_notes` or `search`).');

function requireStaff(ctx: McpContext): void {
	if (!isTrackrTeam(ctx.locals)) fail(403, 'Notes are restricted to the internal team.');
}

function requireUuid(id: string): string {
	const v = id.trim();
	if (!isUuid(v)) fail(400, 'Note id must be a uuid.');
	return v;
}

function noteLine(n: NoteListItem): string {
	const bits = [
		`**${n.title || 'Untitled'}**`,
		n.kind === 'meeting' ? `meeting${n.meetingDate ? ` ${day(n.meetingDate)}` : ''}` : 'quick note',
		n.pinned ? 'pinned' : null,
		`updated ${iso(n.updatedAt)}`,
		`id \`${n.id}\``
	].filter((b): b is string => !!b);
	return `- ${bits.join(' · ')}`;
}

export type NoteMarkdown = {
	id: string;
	kind: string;
	title: string;
	role: 'read' | 'write';
	meetingDate: string | null;
	projectId: string | null;
	taskId: string | null;
	updatedAt: string | null;
	markdown: string;
};

/** Note as markdown after the owner/share/meeting access check. */
export async function loadNoteMarkdown(ctx: McpContext, id: string): Promise<NoteMarkdown> {
	requireStaff(ctx);
	const noteId = requireUuid(id);
	const note = await getNoteWithBody(noteId);
	if (!note) fail(404, 'Note not found.');
	const role = await resolveNoteRole(note, ctx.locals.user.id, ctx.locals.memberships);
	if (!role) fail(403, 'You do not have access to this note.');
	const body = note.bodyHtml ? docHtmlToMarkdown(note.bodyHtml) : '';
	const head = [`# ${note.title || 'Untitled'}`];
	if (note.kind === 'meeting') {
		// Show keys the model can pass back to other tools, not raw uuids.
		const [proj] = note.projectId
			? await db
					.select({ key: project.key })
					.from(project)
					.where(eq(project.id, note.projectId))
					.limit(1)
			: [];
		const [linked] = note.taskId
			? await db
					.select({ key: project.key, number: task.number })
					.from(task)
					.innerJoin(project, eq(project.id, task.projectId))
					.where(eq(task.id, note.taskId))
					.limit(1)
			: [];
		head.push(
			`_Meeting note${note.meetingDate ? ` · ${day(note.meetingDate)}` : ''}${note.projectId ? ` · project ${proj?.key ?? note.projectId}` : ''}${note.taskId ? ` · task ${linked ? `${linked.key}-${linked.number}` : note.taskId}` : ''}_`
		);
	}
	return {
		id: note.id,
		kind: note.kind,
		title: note.title,
		role,
		meetingDate: iso(note.meetingDate),
		projectId: note.projectId,
		taskId: note.taskId,
		updatedAt: iso(note.updatedAt),
		markdown: [...head, '', body.trim() || '_empty note_'].join('\n')
	};
}

async function requireWritable(ctx: McpContext, id: string) {
	requireStaff(ctx);
	const noteId = requireUuid(id);
	const note = await getNote(noteId);
	if (!note) fail(404, 'Note not found.');
	const role = await resolveNoteRole(note, ctx.locals.user.id, ctx.locals.memberships);
	if (role !== 'write') fail(403, 'You cannot edit this note.');
	return note;
}

export function registerNoteTools(server: McpServer, ctx: McpContext): void {
	server.registerTool(
		'list_notes',
		{
			title: 'List notes',
			description:
				'Your quick notes and the team’s meeting notes (staff only). `kind`: `quick`, `meeting` or `all` (default). `projectKey` narrows meeting notes to one project (linked directly or via its tasks). Rows carry the uuid to pass to `get_note`.',
			inputSchema: z.object({
				kind: z
					.enum(['quick', 'meeting', 'all'])
					.default('all')
					.describe('Which notes (default `all`).'),
				projectKey: z.string().optional().describe('Only meeting notes of this project.'),
				limit: limitSchema
			}),
			annotations: READ_ONLY
		},
		guarded(async ({ kind, projectKey, limit }) => {
			requireStaff(ctx);
			const uid = ctx.locals.user.id;
			let rows: NoteListItem[] = [];
			if (kind !== 'meeting' && !projectKey) rows.push(...(await listQuickNotes(uid)));
			if (kind !== 'quick') {
				if (projectKey) {
					const project = await loadAccessibleProject(ctx, projectKey);
					const taskIds = (
						await db
							.select({ id: task.id })
							.from(task)
							.where(and(eq(task.projectId, project.id), isNull(task.deletedAt)))
					).map((r) => r.id);
					rows.push(...(await listProjectMeetings(project.id, taskIds)));
				} else {
					rows.push(...(await listMeetingNotes()));
				}
			}
			rows = rows.filter((n, i, all) => all.findIndex((o) => o.id === n.id) === i);
			const total = rows.length;
			const page = rows.slice(0, limit);
			return text(
				listMd(
					`Notes (${kind}${projectKey ? `, ${normalizeKey(projectKey)}` : ''})`,
					page.map(noteLine),
					total
				),
				{
					total,
					notes: page.map((n) => ({
						id: n.id,
						kind: n.kind,
						title: n.title,
						pinned: n.pinned,
						meetingDate: iso(n.meetingDate),
						projectId: n.projectId,
						taskId: n.taskId,
						updatedAt: iso(n.updatedAt)
					}))
				}
			);
		})
	);

	server.registerTool(
		'get_note',
		{
			title: 'Get note',
			description:
				'Read a note by uuid as markdown. Access: your own quick notes, quick notes shared with you, and every meeting note (staff). The result says whether you may edit it.',
			inputSchema: z.object({ id: noteIdSchema }),
			annotations: READ_ONLY
		},
		guarded(async ({ id }) => {
			const n = await loadNoteMarkdown(ctx, id);
			return text(n.markdown, { ...n, markdown: undefined });
		})
	);

	server.registerTool(
		'create_note',
		{
			title: 'Create quick note',
			description:
				'Create a personal quick note owned by you (staff only) with a markdown `body`. Returns the note id. For project-bound meeting notes use `create_meeting_note`.',
			inputSchema: z.object({
				title: z.string().min(1).max(200).describe('Note title.'),
				body: z.string().default('').describe('Body in markdown.')
			}),
			annotations: WRITE
		},
		guarded(async ({ title, body }) => {
			requireStaff(ctx);
			const uid = ctx.locals.user.id;
			const id = await createNote({ kind: 'quick', title: title.trim(), ownerId: uid });
			if (body.trim()) await updateNoteBody(id, markdownToDocHtml(body), uid);
			return text(`Created quick note **${title.trim()}** — id \`${id}\`.`, {
				id,
				title: title.trim()
			});
		})
	);

	server.registerTool(
		'create_meeting_note',
		{
			title: 'Create meeting note',
			description:
				'Create a meeting note linked to a project (`projectKey`, required) and optionally a task (`taskKey`), with a markdown `body` and `date` (default now). Visible to the whole team. Returns the note id.',
			inputSchema: z.object({
				projectKey: z.string().describe('Project key the meeting belongs to.'),
				title: z.string().min(1).max(200).describe('Meeting title.'),
				body: z
					.string()
					.default('')
					.describe('Body in markdown (agenda, decisions, action items as `- [ ]`).'),
				date: z.string().optional().describe('Meeting date (YYYY-MM-DD or ISO 8601; default now).'),
				taskKey: z.string().optional().describe('Optional task display id to link (e.g. `WEB-12`).')
			}),
			annotations: WRITE
		},
		guarded(async ({ projectKey, title, body, date, taskKey }) => {
			requireStaff(ctx);
			const uid = ctx.locals.user.id;
			const project = await loadAccessibleProject(ctx, projectKey);
			let taskId: string | null = null;
			if (taskKey) {
				const ref = await resolveTaskByDisplayId(normalizeDisplayId(taskKey));
				if (!ref) fail(404, `Task ${normalizeDisplayId(taskKey)} not found.`);
				if (ref.projectId !== project.id) {
					fail(400, `Task ${normalizeDisplayId(taskKey)} is not in project ${project.key}.`);
				}
				taskId = ref.id;
			}
			const meetingDate = date ? parseDateInput(date, 'date') : new Date();
			const id = await createNote({
				kind: 'meeting',
				title: title.trim(),
				ownerId: uid,
				meetingDate,
				projectId: project.id,
				taskId
			});
			if (body.trim()) await updateNoteBody(id, markdownToDocHtml(body), uid);
			return text(
				`Created meeting note **${title.trim()}** (${meetingDate.toISOString().slice(0, 10)}, project ${project.key}${taskKey ? `, task ${normalizeDisplayId(taskKey)}` : ''}) — id \`${id}\`.`,
				{
					id,
					title: title.trim(),
					projectKey: project.key,
					taskId,
					meetingDate: meetingDate.toISOString()
				}
			);
		})
	);

	server.registerTool(
		'update_note',
		{
			title: 'Update note',
			description:
				'Update a note you may edit: `title`, `body` (markdown — REPLACES the whole note, also while someone has it open), and for meeting notes `date`. Pass only the fields to change.',
			inputSchema: z.object({
				id: noteIdSchema,
				title: z.string().min(1).max(200).optional().describe('New title.'),
				body: z.string().optional().describe('New body in markdown (full replace).'),
				date: z.string().optional().describe('New meeting date (meeting notes only).')
			}),
			annotations: WRITE_IDEMPOTENT
		},
		guarded(async ({ id, title, body, date }) => {
			const note = await requireWritable(ctx, id);
			const uid = ctx.locals.user.id;
			const changed: string[] = [];
			const meta: Parameters<typeof updateNote>[1] = {};
			if (title !== undefined) meta.title = title.trim();
			if (date !== undefined) {
				if (note.kind !== 'meeting') fail(400, 'Only meeting notes have a date.');
				meta.meetingDate = parseDateInput(date, 'date');
			}
			if (Object.keys(meta).length) {
				await updateNote(note.id, meta, uid);
				changed.push(...Object.keys(meta));
			}
			if (body !== undefined) {
				await updateNoteBody(note.id, markdownToDocHtml(body), uid);
				changed.push('body');
			}
			if (changed.length === 0) fail(400, 'Nothing to update — pass at least one field.');
			return text(
				`Updated note **${meta.title ?? (note.title || 'Untitled')}** (${changed.join(', ')}).`,
				{
					id: note.id,
					fields: changed
				}
			);
		})
	);

	server.registerTool(
		'delete_note',
		{
			title: 'Delete note',
			description: 'Permanently delete a note you own (owner only). Cannot be undone.',
			inputSchema: z.object({ id: noteIdSchema }),
			annotations: DESTRUCTIVE
		},
		guarded(async ({ id }) => {
			requireStaff(ctx);
			const noteId = requireUuid(id);
			const note = await getNote(noteId);
			if (!note) fail(404, 'Note not found.');
			if (note.ownerId !== ctx.locals.user.id) fail(403, 'Only the owner can delete a note.');
			await deleteNote(noteId);
			return text(`Deleted note **${note.title || 'Untitled'}**.`, { id: noteId, deleted: true });
		})
	);
}
