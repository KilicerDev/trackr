import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	organization,
	ticket,
	message,
	thread,
	ticketFavorite,
	task,
	project
} from '$lib/server/db/app.schema';
import { assertCan, can, canViewTicket, isTrackrTeam } from '$lib/server/permissions';
import { attachFormFiles, deleteAttachmentsFor } from '$lib/server/attachments';
import {
	addTicketMessage,
	addTicketSystemEvents,
	createTicket,
	getTicket,
	loadAssignableUsers,
	loadTicketDisplayUsers,
	loadTickets,
	sanitizeTicketChecklist,
	softDeleteTicket,
	updateTicket,
	type TicketEventMeta,
	TICKET_CATEGORY_SET,
	TICKET_CHANNEL_SET,
	TICKET_PRIORITY_SET,
	TICKET_STATUS_SET,
	type TicketCategory,
	type TicketChannel,
	type TicketPriority,
	type TicketRow,
	type TicketStatus
} from '$lib/server/tickets';
import {
	notifyTicketCreated,
	notifyTicketMessage,
	notifyTicketUpdated
} from '$lib/server/notify/events/ticket';
import { recordAudit } from '$lib/server/audit';
import { getPreferences } from '$lib/server/preferences';
import { m } from '$lib/paraglide/messages';

// Order-insensitive equality for id lists (assignees, tags).
function sameIdSet(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const bs = new Set(b);
	return a.every((x) => bs.has(x));
}

export const load: ServerLoad = async ({ locals, depends }) => {
	if (!locals.user) throw redirect(303, '/sign-in');
	// Ticket mutations call `invalidate('app:tickets')` to refresh just this list.
	depends('app:tickets');

	const trackrTeam = isTrackrTeam(locals);
	const myOrgIds = (locals.memberships?.orgs ?? []).map((o) => o.orgId);

	// Orgs where the viewer can edit tickets (status/priority/assignee/…). Drives
	// the Inspector's per-ticket `canEdit` gate. Trackr team edits everything, so
	// they short-circuit via `isAgent` and don't need the per-org list.
	const editableOrgIds: string[] = [];

	let tickets: TicketRow[];
	if (trackrTeam) {
		tickets = await loadTickets({ includeInternalMessages: true });
	} else if (myOrgIds.length === 0) {
		tickets = [];
	} else {
		// Split orgs by access level: orgs where I can read all tickets vs.
		// orgs where I can only read my own (client role). Also record which orgs
		// the viewer can edit, in the same pass.
		const anyOrgIds: string[] = [];
		const ownOrgIds: string[] = [];
		for (const orgId of myOrgIds) {
			if (await can(locals, 'org.tickets.read.any', { orgId })) {
				anyOrgIds.push(orgId);
			} else if (await can(locals, 'org.tickets.read.own', { orgId })) {
				ownOrgIds.push(orgId);
			}
			if (await can(locals, 'org.tickets.edit.any', { orgId })) editableOrgIds.push(orgId);
		}
		const [anyRows, ownRows] = await Promise.all([
			anyOrgIds.length ? loadTickets({ orgIds: anyOrgIds }) : Promise.resolve([]),
			ownOrgIds.length
				? loadTickets({ orgIds: ownOrgIds, ownerUserId: locals.user.id })
				: Promise.resolve([])
		]);
		tickets = [...anyRows, ...ownRows];
	}

	const isAgent = trackrTeam || editableOrgIds.length > 0;

	// Tasks spun up from these tickets, grouped by ticket, so the Inspector can
	// surface existing links. Team-only (mirrors the detail page gating) and a
	// single grouped query over the loaded ticket set — no per-ticket round trips.
	const linkedTasksByTicket: Record<
		string,
		{ id: string; displayId: string; title: string; status: string }[]
	> = {};
	const ticketIds = tickets.map((t) => t.id);
	if (trackrTeam && ticketIds.length) {
		const rows = await db
			.select({
				ticketId: task.sourceTicketId,
				id: task.id,
				number: task.number,
				title: task.title,
				status: task.status,
				projectKey: project.key
			})
			.from(task)
			.innerJoin(project, eq(project.id, task.projectId))
			.where(and(inArray(task.sourceTicketId, ticketIds), isNull(task.deletedAt)));
		for (const r of rows) {
			if (!r.ticketId) continue;
			(linkedTasksByTicket[r.ticketId] ??= []).push({
				id: r.id,
				displayId: `${r.projectKey}-${r.number}`,
				title: r.title,
				status: r.status
			});
		}
	}

	const preferences = locals.preferences ?? (await getPreferences(locals.user.id));
	const savedView = (preferences.viewState?.tickets ?? {}) as Record<string, unknown>;

	// Assignee candidates for the Inspector and the create modal: members of
	// every org whose tickets the viewer can edit (team → every active org, so a
	// ticket can be assigned at creation even for an org with no tickets yet;
	// client-side editor → their editable orgs), plus internal platform agents.
	// The pickers scope this to one org via each row's `orgIds` / `internal` flags.
	const assignOrgIds = trackrTeam
		? (
				await db
					.select({ id: organization.id })
					.from(organization)
					.where(isNull(organization.archivedAt))
			).map((o) => o.id)
		: editableOrgIds;
	const pickerUsers = isAgent ? await loadAssignableUsers(assignOrgIds) : [];
	// Resolution directory for the assignee/customer/creator names referenced by
	// this page of tickets. Non-agent clients get no `assignableUsers` picker set
	// and their app-wide `users` directory omits internally-assigned platform
	// agents, so without this the Inspector/cards render a real assignee as
	// "Unassigned". Merged behind the picker set (which carries full metadata) so
	// picker candidates win; display-only rows only fill resolution gaps —
	// including cross-org / former-member assignees an agent's picker set misses.
	const displayUsers = await loadTicketDisplayUsers(
		tickets.flatMap((t) => [...t.assignees, t.customerId, t.createdBy])
	);
	const pickerIds = new Set(pickerUsers.map((u) => u.id));
	const assignableUsers = [...pickerUsers, ...displayUsers.filter((u) => !pickerIds.has(u.id))];

	return {
		tickets,
		canCreateTicket: await anyCreatePerm(locals, myOrgIds, trackrTeam),
		isAgent,
		editableOrgIds,
		assignableUsers,
		linkedTasksByTicket,
		savedView
	};
};

async function anyCreatePerm(
	locals: Parameters<typeof can>[0],
	orgIds: string[],
	trackrTeam: boolean
): Promise<boolean> {
	if (trackrTeam) return true;
	for (const orgId of orgIds) {
		if (await can(locals, 'org.tickets.create', { orgId })) return true;
	}
	return false;
}

export const actions: Actions = {
	create: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());
		const me = locals.user;

		const form = await request.formData();
		const orgId = String(form.get('orgId') ?? '').trim();
		const subject = String(form.get('subject') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		const priority = String(form.get('priority') ?? 'medium');
		const category = String(form.get('category') ?? 'general');
		const channel = String(form.get('channel') ?? 'web_form');
		const customerIdRaw = String(form.get('customerId') ?? '').trim();
		const assigneeIdsRaw = form
			.getAll('assignees')
			.map((v) => String(v))
			.filter(Boolean);
		const tags = form
			.getAll('tags')
			.map((v) => String(v))
			.filter(Boolean);

		if (!orgId) return fail(400, { message: m.tickets_org_required() });
		if (!subject) return fail(400, { message: m.tickets_subject_required() });
		if (!TICKET_PRIORITY_SET.has(priority))
			return fail(400, { message: m.tickets_invalid_priority() });
		if (!TICKET_CATEGORY_SET.has(category))
			return fail(400, { message: m.tickets_invalid_category() });
		if (!TICKET_CHANNEL_SET.has(channel))
			return fail(400, { message: m.tickets_invalid_channel() });

		await assertCan(locals, 'org.tickets.create', { orgId });

		// Verify the org exists (and isn't archived) before incrementing its
		// counter — failing the FK after the bump would leave a gap.
		const [orgRow] = await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.id, orgId))
			.limit(1);
		if (!orgRow) return fail(400, { message: m.tickets_org_not_found() });

		// Agents may set customer + assignee; clients always get customerId=self
		// and no assignee.
		const isAgent = await can(locals, 'org.tickets.edit.any', { orgId });
		const customerId = isAgent ? customerIdRaw || me.id : me.id;
		const assigneeIds = isAgent ? [...new Set(assigneeIdsRaw)] : [];
		// Same boundary as the update action: only this org's members or internal
		// platform agents may be assigned. The modal scopes its picker, but never
		// trust the posted ids.
		if (assigneeIds.length) {
			const allowed = new Set((await loadAssignableUsers([orgId])).map((u) => u.id));
			if (!assigneeIds.every((aid) => allowed.has(aid))) {
				return fail(400, { message: m.tickets_invalid_assignee() });
			}
		}

		try {
			const { id, displayId, assignedIds } = await createTicket({
				orgId,
				subject,
				description,
				priority: priority as TicketPriority,
				category: category as TicketCategory,
				channel: channel as TicketChannel,
				customerId,
				assigneeIds,
				tags,
				createdBy: me.id
			});

			// Attach any files dropped on the create modal. Best-effort: the
			// ticket already exists, so a failed attachment is warned, not fatal.
			// Runs before the fan-out so the `ticket.created` webhook lists them.
			const { failed, attachments } = await attachFormFiles({
				files: form.getAll('attachments'),
				entityType: 'ticket',
				entityId: id,
				orgId,
				projectId: null,
				uploadedBy: me.id
			});

			// Fan out: a `ticketCreated` notification to everyone allowed to see
			// the new ticket, and a separate `ticketAssigned` to each assignee set
			// on create. Recipient scoping lives in the event helper — clients of
			// other orgs cannot appear in the set.
			await notifyTicketCreated({
				ticket: {
					id,
					displayId,
					orgId,
					subject,
					customerId,
					creatorId: me.id,
					assigneeIds: assignedIds,
					status: 'open',
					priority,
					category
				},
				description,
				actor: { id: me.id, name: me.name },
				origin: url.origin,
				attachments
			});

			void recordAudit({
				type: 'ticket.create',
				actorId: me.id,
				targetType: 'ticket',
				targetId: id,
				targetLabel: `${displayId} · ${subject}`,
				orgId,
				meta: { priority, category, channel }
			});

			return { ok: true, id, displayId, attachmentsFailed: failed };
		} catch (err) {
			const msg = err instanceof Error ? err.message : m.tickets_create_failed_server();
			return fail(500, { message: msg });
		}
	},

	update: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		if (!id) return fail(400, { message: m.tickets_id_required() });

		const orgId = await getTicketOrgId(id);
		if (!orgId) return fail(404, { message: m.tickets_not_found() });

		// Only agents can edit any. (read.own users could only edit own fields
		// before first response; v1 omits self-edit to keep scope tight.)
		await assertCan(locals, 'org.tickets.edit.any', { orgId });

		const patch: Parameters<typeof updateTicket>[1] = {};
		const subject = form.get('subject');
		if (typeof subject === 'string' && subject.trim()) patch.subject = subject.trim();
		const status = form.get('status');
		if (typeof status === 'string' && TICKET_STATUS_SET.has(status)) {
			patch.status = status as TicketStatus;
		}
		const priority = form.get('priority');
		if (typeof priority === 'string' && TICKET_PRIORITY_SET.has(priority)) {
			patch.priority = priority as TicketPriority;
		}
		const category = form.get('category');
		if (typeof category === 'string' && TICKET_CATEGORY_SET.has(category)) {
			patch.category = category as TicketCategory;
		}
		if (form.has('assignees')) {
			const raw = form
				.getAll('assignees')
				.map((v) => String(v).trim())
				.filter(Boolean);
			// Empty selection posts the `__clear__` sentinel (mirrors tasks).
			const wanted = raw.length === 1 && raw[0] === '__clear__' ? [] : [...new Set(raw)];
			// Validate every target: only org members (clients/agents/members of this
			// ticket's org) or internal platform agents may be assigned. The picker
			// already scopes candidates, but the action is the real boundary — never
			// trust the posted ids. An empty set clears all assignments.
			if (wanted.length) {
				const allowed = await loadAssignableUsers([orgId]);
				const allowedSet = new Set(allowed.map((u) => u.id));
				if (!wanted.every((wid) => allowedSet.has(wid))) {
					return fail(400, { message: m.tickets_invalid_assignee() });
				}
			}
			patch.assigneeIds = wanted;
		}
		const tags = form.getAll('tags');
		if (tags.length > 0) {
			patch.tags = tags.map((t) => String(t)).filter(Boolean);
		}

		const before = await getTicket(id);
		const actorId = locals.user.id;
		const targetLabel = before ? `${before.displayId} · ${before.subject}` : id;

		// What actually changed vs. `before` — drives first-response stamping,
		// notifications and the audit trail below. Assignees/tags compared as sets.
		const priorAssignees = before ? new Set(before.assignees) : new Set<string>();
		const nextAssignees = patch.assigneeIds ? new Set(patch.assigneeIds) : priorAssignees;
		const statusChanged = !!before && patch.status !== undefined && patch.status !== before.status;
		const priorityChanged =
			!!before && patch.priority !== undefined && patch.priority !== before.priority;
		const categoryChanged =
			!!before && patch.category !== undefined && patch.category !== before.category;
		const subjectChanged =
			!!before && patch.subject !== undefined && patch.subject !== before.subject;
		const assigneesChanged =
			!!before &&
			patch.assigneeIds !== undefined &&
			!sameIdSet(patch.assigneeIds, before.assignees);
		const tagsChanged = !!before && patch.tags !== undefined && !sameIdSet(patch.tags, before.tags);
		const added = before ? [...nextAssignees].filter((aid) => !priorAssignees.has(aid)) : [];
		const removed = before ? before.assignees.filter((aid) => !nextAssignees.has(aid)) : [];

		// First agent response: the actor here always holds edit.any (asserted
		// above), so any of these substantive changes is the first agent touch.
		// Stamp once, only if not already set (mirrors addTicketMessage).
		if (
			before &&
			!before.firstResponseAt &&
			(statusChanged || priorityChanged || categoryChanged || assigneesChanged)
		) {
			patch.firstResponseAt = new Date();
		}

		try {
			await updateTicket(id, patch);

			// ── Audit trail: log every substantive change so ticket activity is
			// fully traceable in the system logs. Fire-and-forget (never blocks).
			if (before && statusChanged) {
				void recordAudit({
					type: 'ticket.update',
					actorId,
					targetType: 'ticket',
					targetId: id,
					targetLabel,
					orgId,
					meta: { from: before.status, to: patch.status }
				});
			}
			if (before && priorityChanged) {
				void recordAudit({
					type: 'ticket.priority',
					actorId,
					targetType: 'ticket',
					targetId: id,
					targetLabel,
					orgId,
					meta: { from: before.priority, to: patch.priority }
				});
			}
			if (before && categoryChanged) {
				void recordAudit({
					type: 'ticket.category',
					actorId,
					targetType: 'ticket',
					targetId: id,
					targetLabel,
					orgId,
					meta: { from: before.category, to: patch.category }
				});
			}
			if (before && assigneesChanged) {
				void recordAudit({
					type: 'ticket.assign',
					actorId,
					targetType: 'ticket',
					targetId: id,
					targetLabel,
					orgId,
					meta: { added, removed }
				});
			}
			if (before && (subjectChanged || tagsChanged)) {
				void recordAudit({
					type: 'ticket.edit',
					actorId,
					targetType: 'ticket',
					targetId: id,
					targetLabel,
					orgId,
					meta: {
						...(subjectChanged ? { subject: { from: before.subject, to: patch.subject } } : {}),
						...(tagsChanged ? { tags: { from: before.tags, to: patch.tags } } : {})
					}
				});
			}

			// ── Activity timeline: fold the same changes into the ticket thread as
			// `kind='system'` messages so they render inline with the conversation.
			// Status, assignment, priority and category changes are customer-visible.
			// Only subject/tag edits stay agent-only (`internal: true`) — they're
			// bookkeeping the customer has no stake in.
			if (before) {
				const events: { meta: TicketEventMeta; internal: boolean }[] = [];
				if (statusChanged) {
					events.push({
						meta: { event: 'status_changed', from: before.status, to: patch.status! },
						internal: false
					});
				}
				if (priorityChanged) {
					events.push({
						meta: { event: 'priority_changed', from: before.priority, to: patch.priority! },
						internal: false
					});
				}
				if (categoryChanged) {
					events.push({
						meta: { event: 'category_changed', from: before.category, to: patch.category! },
						internal: false
					});
				}
				if (assigneesChanged) {
					events.push({ meta: { event: 'assigned', added, removed }, internal: false });
				}
				if (subjectChanged || tagsChanged) {
					events.push({
						meta: {
							event: 'edited',
							...(subjectChanged ? { subject: { from: before.subject, to: patch.subject! } } : {}),
							...(tagsChanged ? { tags: { from: before.tags, to: patch.tags! } } : {})
						},
						internal: true
					});
				}
				await addTicketSystemEvents(id, actorId, events);
			}

			// ── Notifications: newly-added assignees, status change (full
			// audience), priority change (internal only). Audience scoping and the
			// per-kind fan-out live in the event helper.
			if (before) {
				await notifyTicketUpdated({
					ticket: {
						id,
						displayId: before.displayId,
						orgId: before.orgId,
						subject: before.subject,
						customerId: before.customerId,
						creatorId: before.createdBy,
						assigneeIds: patch.assigneeIds ?? before.assignees,
						status: patch.status ?? before.status,
						priority: patch.priority ?? before.priority
					},
					addedAssigneeIds: added,
					newStatus: statusChanged ? (patch.status as TicketStatus) : null,
					previousStatus: before.status,
					newPriority: priorityChanged ? (patch.priority as TicketPriority) : null,
					actor: { id: actorId, name: locals.user.name },
					origin: url.origin
				});
			}
			return { ok: true };
		} catch (err) {
			const msg = err instanceof Error ? err.message : m.tickets_update_failed_server();
			return fail(500, { message: msg });
		}
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		if (!id) return fail(400, { message: m.tickets_id_required() });

		const orgId = await getTicketOrgId(id);
		if (!orgId) return fail(404, { message: m.tickets_not_found() });

		// Administrational: only the internal admin roles hold this grant.
		await assertCan(locals, 'org.tickets.delete.any', { orgId });

		// Snapshot for the audit label before the ticket drops out of read paths.
		const snapshot = await getTicket(id);

		try {
			await softDeleteTicket(id);
			void recordAudit({
				type: 'ticket.delete',
				actorId: locals.user.id,
				targetType: 'ticket',
				targetId: id,
				targetLabel: snapshot ? `${snapshot.displayId} · ${snapshot.subject}` : id,
				orgId
			});
			// The ticket's read paths are now closed, so its attachments are
			// already unreachable; remove their files (ticket-level + per-message)
			// to reclaim disk.
			await deleteAttachmentsFor('ticket', id);
			const msgs = await db
				.select({ id: message.id })
				.from(message)
				.innerJoin(thread, eq(thread.id, message.threadId))
				.where(and(eq(thread.subjectType, 'ticket'), eq(thread.subjectId, id)));
			for (const msg of msgs) await deleteAttachmentsFor('message', msg.id);
			return { ok: true };
		} catch (err) {
			const msg = err instanceof Error ? err.message : m.tickets_delete_failed_server();
			return fail(500, { message: msg });
		}
	},

	message: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());
		const me = locals.user;

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const internal = form.get('internal') === '1';

		if (!id) return fail(400, { message: m.tickets_id_required() });
		if (!body) return fail(400, { message: m.tickets_message_required() });

		const t = await getTicket(id);
		if (!t) return fail(404, { message: m.tickets_not_found() });
		const orgId = t.orgId;

		// The comment grant is org-wide, but posting must additionally be scoped
		// to tickets the author can actually see — otherwise an org.member could
		// reply into any org ticket by id (mirrors the checklist action).
		if (!(await canViewTicket(locals, t))) throw error(403, m.tickets_no_access());

		if (internal) {
			// Internal notes are restricted to the internal Trackr team. External
			// org agents may manage tickets, but must use public replies.
			if (!isTrackrTeam(locals)) throw error(403, m.tickets_no_access());
		} else {
			await assertCan(locals, 'org.tickets.comment', { orgId });
		}

		const authorIsAgent = await can(locals, 'org.tickets.edit.any', { orgId });

		try {
			const { id: messageId } = await addTicketMessage({
				ticketId: id,
				authorId: me.id,
				body,
				isInternalNote: internal,
				authorIsAgent
			});

			// Attach any files staged on the composer to the new message.
			const { attachments } = await attachFormFiles({
				files: form.getAll('attachments'),
				entityType: 'message',
				entityId: messageId,
				orgId,
				projectId: null,
				uploadedBy: me.id
			});

			{
				// Fan-out (incl. @-mentions, which are intersected with the scoped
				// audience so an internal note's mention can never reach the customer)
				// lives in the event helper.
				await notifyTicketMessage({
					ticket: {
						id,
						displayId: t.displayId,
						orgId: t.orgId,
						subject: t.subject,
						customerId: t.customerId,
						creatorId: t.createdBy,
						assigneeIds: t.assignees,
						status: t.status,
						priority: t.priority
					},
					body,
					internal,
					actor: { id: me.id, name: me.name },
					messageId,
					origin: url.origin,
					attachments
				});

				void recordAudit({
					type: 'ticket.message',
					actorId: me.id,
					targetType: 'ticket',
					targetId: id,
					targetLabel: `${t.displayId} · ${t.subject}`,
					orgId: t.orgId,
					meta: { internal, body: body.slice(0, 280) }
				});
			}

			return { ok: true };
		} catch (err) {
			const msg = err instanceof Error ? err.message : m.tickets_post_message_failed();
			return fail(500, { message: msg });
		}
	},

	pinAdd: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		if (!id) return fail(400, { message: m.tickets_id_required() });
		// Only pin tickets the user can actually see.
		const orgId = await getTicketOrgId(id);
		if (!orgId) return fail(404, { message: m.tickets_not_found() });
		const allowed =
			(await can(locals, 'org.tickets.read.any', { orgId })) ||
			(await can(locals, 'org.tickets.read.own', { orgId }));
		if (!allowed) return fail(403, { message: m.tickets_cannot_pin() });
		await db
			.insert(ticketFavorite)
			.values({ userId: locals.user.id, ticketId: id })
			.onConflictDoNothing();
		return { ok: true };
	},

	pinRemove: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		if (!id) return fail(400, { message: m.tickets_id_required() });
		// Deliberately no read-check (unlike pinAdd): the delete is scoped to the
		// caller's own favorite row, and a user must be able to unpin a ticket
		// they have since lost access to.
		await db
			.delete(ticketFavorite)
			.where(and(eq(ticketFavorite.userId, locals.user.id), eq(ticketFavorite.ticketId, id)));
		return { ok: true };
	},

	// Shared checklist. Unlike `update` (agent-only), this is open to every
	// ticket participant — agents, the org.client admin, and the owning
	// org.member — gated on `canViewTicket`. Whole array replaced + sanitized,
	// mirroring the task checklist action.
	checklist: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.tickets_not_authenticated());
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		if (!id) return fail(400, { message: m.tickets_id_required() });

		const t = await getTicket(id);
		if (!t) return fail(404, { message: m.tickets_not_found() });
		if (!(await canViewTicket(locals, t))) return fail(403, { message: m.tickets_no_access() });

		let checklist: { id: string; text: string; done: boolean }[] | null;
		try {
			checklist = sanitizeTicketChecklist(JSON.parse(String(form.get('checklist') ?? '[]')));
		} catch {
			checklist = null;
		}
		if (!checklist) return fail(400, { message: m.tasks_err_invalid_checklist() });

		await updateTicket(id, { checklist });
		return { ok: true };
	}
};

async function getTicketOrgId(ticketId: string): Promise<string | null> {
	const [row] = await db
		.select({ orgId: ticket.orgId })
		.from(ticket)
		.where(and(eq(ticket.id, ticketId), isNull(ticket.deletedAt)))
		.limit(1);
	return row?.orgId ?? null;
}
