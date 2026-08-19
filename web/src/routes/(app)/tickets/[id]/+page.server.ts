import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	project,
	task,
	ticketFavorite,
	ticket as ticketTable,
	thread
} from '$lib/server/db/app.schema';
import { user as userTable } from '$lib/server/db/auth.schema';
import { assertCan, can, canViewTicket, isPortalUser, isTrackrTeam } from '$lib/server/permissions';
import {
	addTicketMessage,
	getTicket,
	loadAssignableUsers,
	loadTicketMentionUsers,
	loadTicketMessages
} from '$lib/server/tickets';
import { createTask } from '$lib/server/tasks';
import { recordAudit } from '$lib/server/audit';
import { notifyTaskAssigned } from '$lib/server/notify/events/task';
import { listAttachments, listAttachmentsForMany } from '$lib/server/attachments';
import { m } from '$lib/paraglide/messages';

const ALLOWED_TASK_TYPE = new Set(['task', 'bug', 'improvement', 'feature', 'chore']);
const ALLOWED_TASK_STATUS = new Set([
	'backlog',
	'todo',
	'in_progress',
	'paused',
	'in_review',
	'done'
]);
const ALLOWED_TASK_PRIORITY = new Set(['none', 'low', 'medium', 'high', 'urgent']);

function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase();
}
function userColor(id: string): string {
	let h = 0;
	for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return `hsl(${h % 360} 55% 60%)`;
}

export const load: ServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(303, '/sign-in');
	const id = params.id;
	if (!id) throw error(404, m.tickets_not_found_404());

	const ticket = await getTicket(id);
	if (!ticket) throw error(404, m.tickets_not_found_404());

	const isAgent = await can(locals, 'org.tickets.edit.any', { orgId: ticket.orgId });
	const canUseInternalNotes = isTrackrTeam(locals);
	if (!(await canViewTicket(locals, ticket))) throw error(403, m.tickets_no_access());

	// Checklist is the shared, participant-editable surface: agents plus anyone
	// who can comment (the org.client admin and the owning org.member).
	const canEditChecklist =
		isAgent || (await can(locals, 'org.tickets.comment', { orgId: ticket.orgId }));

	// Assignee candidates: this ticket's org members (clients/agents/members) plus
	// internal platform agents. Only loaded for editors — others can't reassign.
	const assignableUsers = isAgent ? await loadAssignableUsers([ticket.orgId]) : [];

	// @-mention candidates for the reply composer: the ticket's notify audience —
	// org agents, internal platform staff, the customer, and the assignee — so an
	// agent can mention the org user (and vice versa), not just the global list.
	const mentionUsers = await loadTicketMentionUsers({
		orgId: ticket.orgId,
		customerId: ticket.customerId,
		assigneeIds: ticket.assignees
	});
	const tagRows = isAgent
		? await db
				.select({ tags: ticketTable.tags })
				.from(ticketTable)
				.where(and(eq(ticketTable.orgId, ticket.orgId), isNull(ticketTable.deletedAt)))
		: [];
	const tagSuggestions = [...new Set(tagRows.flatMap((row) => row.tags))].sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: 'base' })
	);

	const messages = await loadTicketMessages(id, { includeInternal: canUseInternalNotes });

	// Attachments: ticket-level, plus those on each message (keyed by message id).
	const [attachments, messageAttachmentMap] = await Promise.all([
		listAttachments('ticket', id),
		listAttachmentsForMany(
			'message',
			messages.map((m) => m.id)
		)
	]);
	const messageAttachments = Object.fromEntries(messageAttachmentMap);

	const [pin] = await db
		.select({ ticketId: ticketFavorite.ticketId })
		.from(ticketFavorite)
		.where(and(eq(ticketFavorite.userId, locals.user.id), eq(ticketFavorite.ticketId, id)))
		.limit(1);

	// Resolve display names for everyone involved in THIS ticket — assignee,
	// customer, creator, and message authors. Needed because the layout's global
	// `users` lookup is filtered to a client's own org, so an assigned internal
	// agent would otherwise render as "Unassigned"/"Unknown". Scoped to the
	// ticket's participants, so it doesn't leak the wider staff directory.
	const participantIds = [
		...new Set(
			[
				ticket.customerId,
				...ticket.assignees,
				ticket.createdBy,
				...messages.map((m) => m.authorId)
			].filter((v): v is string => !!v)
		)
	];
	const participantRows = participantIds.length
		? await db
				.select({ id: userTable.id, name: userTable.name, email: userTable.email })
				.from(userTable)
				.where(inArray(userTable.id, participantIds))
		: [];
	const participants = participantRows.map((u) => {
		const name = u.name ?? u.email;
		return { id: u.id, name, initials: initials(name), color: userColor(u.id) };
	});

	// Tasks spun up from this ticket — surfaced so agents see existing links
	// (and don't blindly create duplicates). Team-only feature, so only query
	// when the user can actually convert.
	const canCreateTask = isTrackrTeam(locals);
	const linkedTaskRows = await db
		.select({
			id: task.id,
			number: task.number,
			title: task.title,
			status: task.status,
			projectKey: project.key
		})
		.from(task)
		.innerJoin(project, eq(project.id, task.projectId))
		.where(and(eq(task.sourceTicketId, id), isNull(task.deletedAt)));
	const linkedTasks = linkedTaskRows.map((r) => ({
		id: r.id,
		displayId: `${r.projectKey}-${r.number}`,
		title: r.title,
		status: r.status
	}));

	// Source chat thread this ticket was created from (create-ticket-from-thread
	// flow). Surfaced as a "Created from chat" back-link. Only shown when the
	// thread still exists (soft-delete aware). subjectId of an org thread is the
	// orgId, which the /chat switcher expects.
	const [src] = await db
		.select({
			threadId: thread.id,
			title: thread.title,
			orgId: thread.subjectId,
			deletedAt: thread.deletedAt
		})
		.from(ticketTable)
		.innerJoin(thread, eq(thread.id, ticketTable.sourceThreadId))
		.where(eq(ticketTable.id, id))
		.limit(1);
	const sourceChat =
		src && !src.deletedAt ? { threadId: src.threadId, orgId: src.orgId, title: src.title } : null;

	// NOTE: marking notifications read is intentionally NOT done here. A `load`
	// runs during hover-preloading (data-sveltekit-preload-data="hover"), so
	// clearing read-state here would fire just by hovering a ticket link. The
	// client marks the ticket read on mount instead (see +page.svelte).

	return {
		ticket,
		messages,
		isAgent,
		canUseInternalNotes,
		assignableUsers,
		mentionUsers,
		tagSuggestions,
		attachments,
		messageAttachments,
		currentUserId: locals.user.id,
		isPinned: !!pin,
		isPortalUser: isPortalUser(locals),
		participants,
		canCreateTask,
		canEditChecklist,
		linkedTasks,
		sourceChat
	};
};

export const actions: Actions = {
	// Convert a ticket into a linked project task. Team-only: org members and
	// portal clients never see the entry point and are rejected here too. The
	// ticket is never deleted — it's flipped out of triage and linked.
	createTask: async ({ request, params, locals, url }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());
		const me = locals.user;
		const ticketId = params.id;
		if (!ticketId) return fail(404, { message: m.tickets_not_found() });
		if (!isTrackrTeam(locals)) throw error(403, m.tickets_no_access());

		const t = await getTicket(ticketId);
		if (!t) return fail(404, { message: m.tickets_not_found() });

		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		const projectKey = String(form.get('project') ?? '').trim();
		const typeRaw = String(form.get('type') ?? 'task');
		const statusRaw = String(form.get('status') ?? 'todo');
		const priorityRaw = String(form.get('priority') ?? 'medium');
		const due = String(form.get('due') ?? '').trim();
		const estimateRaw = String(form.get('estimate') ?? '').trim();
		const assigneeIds = form
			.getAll('assignees')
			.map((v) => String(v))
			.filter(Boolean);

		if (!title) return fail(400, { message: m.tasks_err_title_required() });
		if (!projectKey) return fail(400, { message: m.tasks_err_project_required() });

		// Clamp enums to defaults rather than failing — the modal sends valid
		// values, this just guards against tampering / drift.
		const type = ALLOWED_TASK_TYPE.has(typeRaw) ? typeRaw : 'task';
		const status = ALLOWED_TASK_STATUS.has(statusRaw) ? statusRaw : 'todo';
		const priority = ALLOWED_TASK_PRIORITY.has(priorityRaw) ? priorityRaw : 'medium';

		const [p] = await db
			.select({ id: project.id, key: project.key, orgId: project.orgId })
			.from(project)
			.where(eq(project.key, projectKey))
			.limit(1);
		if (!p) return fail(400, { message: m.tasks_err_project_not_found({ key: projectKey }) });

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
				description,
				status,
				priority,
				type,
				dueDate: due ? new Date(due) : null,
				estimateMinutes: estimateRaw ? Number(estimateRaw) : null,
				checklist: carriedChecklist,
				assigneeIds,
				createdBy: me.id,
				sourceTicketId: ticketId
			});
		} catch (err) {
			console.error('ticket→task create failed', err);
			return fail(500, { message: m.tickets_create_task_failed() });
		}

		// Leave an agents-only breadcrumb linking the new task. Best-effort: the
		// task already exists, so a failure here is logged, not surfaced as a
		// failed conversion. (The ticket's status is left untouched — agents move
		// it manually.)
		try {
			await addTicketMessage({
				ticketId,
				authorId: me.id,
				body: m.tickets_note_linked_task({ ref: created.displayId }),
				isInternalNote: true,
				authorIsAgent: true
			});
		} catch (err) {
			console.error('ticket post-convert update failed', err);
		}

		// Notify newly-assigned users (mirrors the /tasks create action).
		void notifyTaskAssigned({
			task: { id: created.id, displayId: created.displayId, title, orgId: p.orgId },
			assigneeIds: created.assignedIds,
			actor: { id: me.id, name: me.name },
			origin: url.origin
		}).catch((err) => console.error('ticket→task notify failed', err));

		void recordAudit({
			type: 'ticket.convert',
			actorId: me.id,
			targetType: 'ticket',
			targetId: ticketId,
			targetLabel: `${t.displayId} · ${t.subject}`,
			orgId: t.orgId,
			meta: { taskRef: created.displayId, taskId: created.id, projectId: p.id }
		});

		return { ok: true, displayId: created.displayId };
	}
};
