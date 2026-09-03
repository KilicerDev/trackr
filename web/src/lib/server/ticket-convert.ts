// Ticket → task conversion, shared by the web action (tickets/[id] createTask)
// and the mobile API (POST /api/v1/tickets/[id]/tasks). Lives in its own module
// so tickets.ts and tasks.ts stay import-cycle-free.
//
// The conversion is deliberately more than a task insert: open checklist items
// carry over (ids preserved so completion mirrors back), attachments are shared
// into the task's scope, an agents-only breadcrumb note lands on the ticket,
// assignees are notified, and the conversion is audited. The ticket's status is
// left untouched — agents move it manually.

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { emitWebhookEvent, taskSnapshot } from '$lib/server/webhooks';
import { project } from '$lib/server/db/app.schema';
import { assertCan, isTrackrTeam } from '$lib/server/permissions';
import { addTicketMessage, getTicket } from '$lib/server/tickets';
import {
	ALLOWED_TASK_PRIORITY,
	ALLOWED_TASK_STATUS,
	ALLOWED_TASK_TYPE,
	createTask
} from '$lib/server/tasks';
import { attachFormFiles, copyAttachments } from '$lib/server/attachments';
import { normalizeTag } from '$lib/utils/label-meta';
import { notifyTaskAssigned } from '$lib/server/notify/events/task';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';

/** Caller-fixable conversion failure; `status` maps to the HTTP response. */
export class TicketConvertError extends Error {
	constructor(
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'TicketConvertError';
	}
}

export interface ConvertTicketInput {
	ticketId: string;
	title: string;
	description?: string | null;
	/** Target project by key (web modal) or id (mobile API) — one is required. */
	projectKey?: string;
	projectId?: string;
	type?: string;
	status?: string;
	priority?: string;
	dueDate?: Date | null;
	estimateMinutes?: number | null;
	/** Raw tag values; normalized + deduped here so both callers agree. */
	tags?: string[];
	assigneeIds?: string[];
	/** Files staged on the create modal (multipart `attachments` entries). */
	attachments?: FormDataEntryValue[];
	/** Request origin for notification links. */
	origin: string;
}

export async function convertTicketToTask(
	locals: App.Locals,
	input: ConvertTicketInput
): Promise<{ id: string; displayId: string }> {
	const me = locals.user;
	if (!me) throw new TicketConvertError(m.tickets_not_authenticated(), 401);
	if (!isTrackrTeam(locals)) throw new TicketConvertError(m.tickets_no_access(), 403);

	const t = await getTicket(input.ticketId);
	if (!t) throw new TicketConvertError(m.tickets_not_found(), 404);

	const title = input.title.trim();
	if (!title) throw new TicketConvertError(m.tasks_err_title_required(), 400);
	if (!input.projectKey && !input.projectId) {
		throw new TicketConvertError(m.tasks_err_project_required(), 400);
	}

	// Clamp enums to defaults rather than failing — valid clients send valid
	// values, this just guards against tampering / drift.
	const type = ALLOWED_TASK_TYPE.has(input.type ?? '') ? input.type! : 'task';
	const status = ALLOWED_TASK_STATUS.has(input.status ?? '') ? input.status! : 'todo';
	const priority = ALLOWED_TASK_PRIORITY.has(input.priority ?? '') ? input.priority! : 'medium';
	const tags = [...new Set((input.tags ?? []).map(normalizeTag).filter(Boolean))];

	const [p] = await db
		.select({ id: project.id, key: project.key, orgId: project.orgId })
		.from(project)
		.where(input.projectId ? eq(project.id, input.projectId) : eq(project.key, input.projectKey!))
		.limit(1);
	if (!p) {
		throw new TicketConvertError(
			m.tasks_err_project_not_found({ key: input.projectKey ?? (input.projectId || '?') }),
			400
		);
	}

	await assertCan(locals, 'project.tasks.create', { projectId: p.id });

	// Carry the ticket's open checklist items into the new task. Item ids are
	// preserved so the two stay linked: completing one on the task mirrors back
	// onto the ticket (see syncTicketChecklistFromTask). Already-done items are
	// left behind — the task tracks the remaining work.
	const carriedChecklist = (t.checklist ?? [])
		.filter((it) => !it.done)
		.map((it) => ({ id: it.id, text: it.text, done: false }));

	let created: Awaited<ReturnType<typeof createTask>>;
	try {
		created = await createTask({
			projectId: p.id,
			projectKey: p.key,
			title,
			description: input.description?.trim() || null,
			status,
			priority,
			type,
			dueDate: input.dueDate ?? null,
			estimateMinutes: input.estimateMinutes ?? null,
			tags,
			checklist: carriedChecklist,
			assigneeIds: input.assigneeIds ?? [],
			createdBy: me.id,
			sourceTicketId: input.ticketId
		});
	} catch (err) {
		console.error('ticket→task create failed', err);
		throw new TicketConvertError(m.tickets_create_task_failed(), 500);
	}

	// Carry the ticket's attachments over to the new task, scoped like a
	// direct task upload (project, no org). The stored bytes are shared, not
	// duplicated — see copyAttachments. Best-effort: the task already exists,
	// so a failure is logged, not surfaced as a failed conversion.
	try {
		await copyAttachments({
			from: { entityType: 'ticket', entityId: input.ticketId },
			to: { entityType: 'task', entityId: created.id },
			orgId: null,
			projectId: p.id
		});
	} catch (err) {
		console.error('ticket→task attachment copy failed', err);
	}

	// Files dropped on the create modal itself, on top of the carried-over
	// ticket attachments. Same best-effort semantics as the /tasks create action.
	if (input.attachments?.length) {
		try {
			await attachFormFiles({
				files: input.attachments,
				entityType: 'task',
				entityId: created.id,
				orgId: null,
				projectId: p.id,
				uploadedBy: me.id
			});
		} catch (err) {
			console.error('ticket→task staged attachment failed', err);
		}
	}

	// Leave an agents-only breadcrumb linking the new task. Best-effort too.
	try {
		await addTicketMessage({
			ticketId: input.ticketId,
			authorId: me.id,
			body: m.tickets_note_linked_task({ ref: created.displayId }),
			isInternalNote: true,
			authorIsAgent: true
		});
	} catch (err) {
		console.error('ticket post-convert update failed', err);
	}

	emitWebhookEvent({
		type: 'task.created',
		orgId: p.orgId,
		projectId: p.id,
		actor: { id: me.id, name: me.name },
		assigneeIds: created.assignedIds,
		origin: input.origin,
		data: {
			task: taskSnapshot(
				{
					id: created.id,
					displayId: created.displayId,
					projectId: p.id,
					title,
					status,
					priority,
					type,
					assigneeIds: created.assignedIds,
					dueDate: input.dueDate ?? null
				},
				input.origin
			),
			description: input.description?.trim() || null,
			sourceTicketId: input.ticketId
		}
	});
	// Notify newly-assigned users (mirrors the /tasks create action).
	void notifyTaskAssigned({
		task: { id: created.id, displayId: created.displayId, title, orgId: p.orgId, projectId: p.id },
		assigneeIds: created.assignedIds,
		actor: { id: me.id, name: me.name },
		origin: input.origin
	}).catch((err) => console.error('ticket→task notify failed', err));

	void recordAudit({
		type: 'ticket.convert',
		actorId: me.id,
		targetType: 'ticket',
		targetId: input.ticketId,
		targetLabel: `${t.displayId} · ${t.subject}`,
		orgId: t.orgId,
		meta: { taskRef: created.displayId, taskId: created.id, projectId: p.id }
	});

	return { id: created.id, displayId: created.displayId };
}
