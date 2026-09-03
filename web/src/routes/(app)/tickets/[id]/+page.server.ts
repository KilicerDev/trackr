import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ticketFavorite, ticket as ticketTable, thread } from '$lib/server/db/app.schema';
import { user as userTable } from '$lib/server/db/auth.schema';
import { can, canViewTicket, isPortalUser, isTrackrTeam } from '$lib/server/permissions';
import {
	getTicket,
	loadAssignableUsers,
	loadTicketMentionUsers,
	loadTicketMessages
} from '$lib/server/tickets';
import { convertTicketToTask, TicketConvertError } from '$lib/server/ticket-convert';
import { listLinkedTasks } from '$lib/server/tasks';
import { listAttachments, listAttachmentsForMany } from '$lib/server/attachments';
import { m } from '$lib/paraglide/messages';

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
	const linkedTasks = await listLinkedTasks(id);

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
	// Convert a ticket into a linked project task — shared flow, see
	// $lib/server/ticket-convert.ts (also used by POST /api/v1/tickets/[id]/tasks).
	createTask: async ({ request, params, locals, url }) => {
		const ticketId = params.id;
		if (!ticketId) return fail(404, { message: m.tickets_not_found() });

		const form = await request.formData();
		const due = String(form.get('due') ?? '').trim();
		const estimateRaw = String(form.get('estimate') ?? '').trim();

		try {
			const created = await convertTicketToTask(locals, {
				ticketId,
				title: String(form.get('title') ?? ''),
				description: String(form.get('description') ?? ''),
				projectKey: String(form.get('project') ?? '').trim() || undefined,
				type: String(form.get('type') ?? 'task'),
				status: String(form.get('status') ?? 'todo'),
				priority: String(form.get('priority') ?? 'medium'),
				dueDate: due ? new Date(due) : null,
				estimateMinutes: estimateRaw ? Number(estimateRaw) : null,
				tags: form.getAll('tags').map((v) => String(v)),
				assigneeIds: form
					.getAll('assignees')
					.map((v) => String(v))
					.filter(Boolean),
				attachments: form.getAll('attachments'),
				origin: url.origin
			});
			return { ok: true, displayId: created.displayId };
		} catch (err) {
			if (err instanceof TicketConvertError) {
				if (err.status === 401 || err.status === 403) throw error(err.status, err.message);
				return fail(err.status, { message: err.message });
			}
			throw err;
		}
	}
};
