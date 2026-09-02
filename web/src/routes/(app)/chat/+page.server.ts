import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { emitWebhookEvent, threadSnapshot } from '$lib/server/webhooks';
import { organization, tag } from '$lib/server/db/app.schema';
import { assertCan, can, isPortalUser, isTrackrTeam } from '$lib/server/permissions';
import { getPreferences } from '$lib/server/preferences';
import { m } from '$lib/paraglide/messages';
import {
	addMessage,
	createTag,
	createThread,
	getThreadContext,
	insertSystemMessage,
	listOrgTags,
	listTagSubscriptions,
	loadOrgChatMentionUsers,
	loadOrgFeed,
	markThreadRead,
	setTagSubscription,
	setThreadTags
} from '$lib/server/chat';
import {
	createTicket,
	TICKET_CATEGORY_SET,
	TICKET_PRIORITY_SET,
	type TicketCategory,
	type TicketPriority
} from '$lib/server/tickets';
import { attachFormFiles } from '$lib/server/attachments';
import { notifyChatMessage } from '$lib/server/notify/events/chat';
import { notifyTicketCreated } from '$lib/server/notify/events/ticket';
import { recordAudit } from '$lib/server/audit';

type ChatOrg = { id: string; name: string; color: string };

// The orgs whose support chat this user may read: their org memberships (plus
// every org for internal Trackr staff), filtered by `org.chat.read`. Access is
// derived here — never stored.
async function chatableOrgs(locals: App.Locals): Promise<ChatOrg[]> {
	const myOrgIds = (locals.memberships?.orgs ?? []).map((o) => o.orgId);
	const base = db
		.select({ id: organization.id, name: organization.name, color: organization.color })
		.from(organization)
		.$dynamic();
	const candidates = isTrackrTeam(locals)
		? await base.where(isNull(organization.archivedAt)).orderBy(organization.name)
		: myOrgIds.length === 0
			? []
			: await base
					.where(and(isNull(organization.archivedAt), inArray(organization.id, myOrgIds)))
					.orderBy(organization.name);
	const out: ChatOrg[] = [];
	for (const o of candidates) {
		if (await can(locals, 'org.chat.read', { orgId: o.id })) out.push(o);
	}
	return out;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/login');

	const orgs = await chatableOrgs(locals);
	if (orgs.length === 0) throw error(403, m.chat_no_access());

	// Resolve the org. Portal users follow the portal's active-org switcher (no
	// second selector); app users can pass ?org= (a compact switcher in the UI).
	const portal = isPortalUser(locals);
	let activeOrgId: string;
	if (portal) {
		const prefs = await getPreferences(locals.user.id);
		const stored = (prefs.viewState?.portal as { activeOrgId?: string } | undefined)?.activeOrgId;
		activeOrgId = stored && orgs.some((o) => o.id === stored) ? stored : orgs[0].id;
	} else {
		const requested = url.searchParams.get('org');
		activeOrgId = requested && orgs.some((o) => o.id === requested) ? requested : orgs[0].id;
	}
	await assertCan(locals, 'org.chat.read', { orgId: activeOrgId });

	const tagFilter = url.searchParams.get('tag') || undefined;
	const [feed, tags, subscriptions, mentionUsers] = await Promise.all([
		loadOrgFeed(activeOrgId, { tagId: tagFilter }),
		listOrgTags(activeOrgId),
		listTagSubscriptions(locals.user.id, activeOrgId),
		// @-mention directory for the composer: org chat members + internal
		// platform staff. Not the layout's org-scoped `users` (which omits staff).
		loadOrgChatMentionUsers(activeOrgId)
	]);

	return {
		orgs,
		activeOrgId,
		isPortal: portal,
		tagFilter: tagFilter ?? null,
		feed,
		tags,
		subscriptions,
		mentionUsers
	};
};

function parseTagIds(raw: FormDataEntryValue | null): string[] {
	if (typeof raw !== 'string' || !raw.trim()) return [];
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export const actions: Actions = {
	createThread: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.chat_not_authenticated());
		const me = locals.user;
		const form = await request.formData();
		const orgId = String(form.get('org') ?? '').trim();
		const title = String(form.get('title') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const stagedFiles = form.getAll('attachments');
		if (!orgId) return fail(400, { message: m.chat_err_org_required() });
		if (!title) return fail(400, { message: m.chat_err_title_required() });
		if (!body && !stagedFiles.some((f) => f instanceof File && f.size > 0)) {
			return fail(400, { message: m.chat_err_message_required() });
		}
		await assertCan(locals, 'org.chat.post', { orgId });

		const tagIds = parseTagIds(form.get('tags'));
		const { threadId, messageId } = await createThread({
			orgId,
			title,
			body: body || '(attachment)',
			createdBy: me.id,
			tagIds
		});
		await attachFormFiles({
			files: stagedFiles,
			entityType: 'message',
			entityId: messageId,
			orgId,
			projectId: null,
			uploadedBy: me.id
		});
		await markThreadRead(threadId, me.id);
		emitWebhookEvent({
			type: 'thread.created',
			orgId,
			actor: { id: me.id, name: me.name },
			origin: url.origin,
			data: {
				thread: threadSnapshot({ id: threadId, orgId, title }, url.origin),
				tagIds,
				body: body || null
			}
		});
		await notifyChatMessage({
			threadId,
			orgId,
			threadTitle: title,
			actor: { id: me.id, name: me.name },
			body,
			origin: url.origin,
			messageId
		});
		return { success: true, threadId };
	},

	postMessage: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.chat_not_authenticated());
		const me = locals.user;
		const form = await request.formData();
		const threadId = String(form.get('threadId') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const stagedFiles = form.getAll('attachments');
		if (!threadId) return fail(400, { message: m.chat_err_thread_required() });
		if (!body && !stagedFiles.some((f) => f instanceof File && f.size > 0)) {
			return fail(400, { message: m.chat_err_message_required() });
		}
		const ctx = await getThreadContext(threadId);
		if (!ctx) return fail(404, { message: m.chat_err_thread_not_found() });
		await assertCan(locals, 'org.chat.post', { orgId: ctx.orgId });

		const { id: messageId } = await addMessage({
			threadId,
			authorId: me.id,
			body: body || '(attachment)'
		});
		await attachFormFiles({
			files: stagedFiles,
			entityType: 'message',
			entityId: messageId,
			orgId: ctx.orgId,
			projectId: null,
			uploadedBy: me.id
		});
		await markThreadRead(threadId, me.id);
		await notifyChatMessage({
			threadId,
			orgId: ctx.orgId,
			threadTitle: ctx.title,
			actor: { id: me.id, name: me.name },
			body,
			origin: url.origin,
			messageId
		});
		return { success: true };
	},

	// Spin a ticket out of a chat thread. Prefilled subject/description come from
	// the modal; the thread's org scopes the ticket. Drops a `system` marker back
	// into the chat stream so the conversation records the decision, and links the
	// ticket back to its source thread (ticket.sourceThreadId). No chat messages
	// are copied — the thread stays the source of truth.
	createTicket: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.chat_not_authenticated());
		const me = locals.user;
		const form = await request.formData();
		const threadId = String(form.get('threadId') ?? '').trim();
		const subject = String(form.get('subject') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		const priority = String(form.get('priority') ?? 'medium');
		const category = String(form.get('category') ?? 'general');

		if (!threadId) return fail(400, { message: m.chat_err_thread_required() });
		if (!subject) return fail(400, { message: m.tickets_subject_required() });
		if (!TICKET_PRIORITY_SET.has(priority))
			return fail(400, { message: m.tickets_invalid_priority() });
		if (!TICKET_CATEGORY_SET.has(category))
			return fail(400, { message: m.tickets_invalid_category() });

		const ctx = await getThreadContext(threadId);
		if (!ctx) return fail(404, { message: m.chat_err_thread_not_found() });
		const orgId = ctx.orgId;
		await assertCan(locals, 'org.tickets.create', { orgId });

		// Agents may leave the ticket unassigned; clients always become the
		// customer. Mirrors the /tickets create action.
		const isAgent = await can(locals, 'org.tickets.edit.any', { orgId });
		const customerId = isAgent ? null : me.id;

		try {
			const { id, displayId } = await createTicket({
				orgId,
				subject,
				description,
				priority: priority as TicketPriority,
				category: category as TicketCategory,
				channel: 'chat',
				customerId,
				assigneeIds: [],
				tags: [],
				createdBy: me.id,
				sourceThreadId: threadId
			});

			// Drop the in-stream marker. Best-effort: the ticket already exists, so a
			// failure here is logged, not surfaced as a failed creation.
			try {
				await insertSystemMessage({
					threadId,
					authorId: me.id,
					body: m.chat_ticket_created_note({ ref: displayId }),
					meta: { event: 'ticket_created', ticketId: id, displayId, subject }
				});
			} catch (err) {
				console.error('chat ticket marker failed', err);
			}

			// Notify everyone allowed to see the new ticket (recipient scoping
			// lives in the event helper — clients of other orgs can't appear).
			void notifyTicketCreated({
				ticket: {
					id,
					displayId,
					orgId,
					subject,
					customerId,
					creatorId: me.id,
					assigneeIds: [],
					status: 'open',
					priority
				},
				description,
				actor: { id: me.id, name: me.name },
				origin: url.origin
			}).catch((err) => console.error('chat→ticket notify failed', err));

			void recordAudit({
				type: 'ticket.create',
				actorId: me.id,
				targetType: 'ticket',
				targetId: id,
				targetLabel: `${displayId} · ${subject}`,
				orgId,
				meta: { priority, category, channel: 'chat', sourceThreadId: threadId }
			});

			return { success: true, ticketId: id, displayId };
		} catch (err) {
			console.error('chat→ticket create failed', err);
			return fail(500, { message: m.chat_err_create_ticket_failed() });
		}
	},

	createTag: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.chat_not_authenticated());
		const form = await request.formData();
		const orgId = String(form.get('org') ?? '').trim();
		const label = String(form.get('label') ?? '').trim();
		const color = String(form.get('color') ?? '').trim() || null;
		if (!orgId || !label) return fail(400, { message: m.chat_err_tag_invalid() });
		await assertCan(locals, 'org.chat.post', { orgId });
		const created = await createTag({ orgId, label, color, createdBy: locals.user.id });
		return { success: true, tag: created };
	},

	setTags: async ({ request, locals, url }) => {
		if (!locals.user) throw error(401, m.chat_not_authenticated());
		const form = await request.formData();
		const threadId = String(form.get('threadId') ?? '').trim();
		if (!threadId) return fail(400, { message: m.chat_err_thread_required() });
		const ctx = await getThreadContext(threadId);
		if (!ctx) return fail(404, { message: m.chat_err_thread_not_found() });
		await assertCan(locals, 'org.chat.post', { orgId: ctx.orgId });
		const tagIds = parseTagIds(form.get('tags'));
		await setThreadTags(threadId, tagIds);
		{
			const all = await listOrgTags(ctx.orgId);
			const tags = all
				.filter((t) => tagIds.includes(t.id))
				.map((t) => ({ id: t.id, label: t.label }));
			emitWebhookEvent({
				type: 'thread.tagged',
				orgId: ctx.orgId,
				actor: { id: locals.user.id, name: locals.user.name },
				origin: url.origin,
				data: {
					thread: threadSnapshot({ id: threadId, orgId: ctx.orgId, title: ctx.title }, url.origin),
					tags
				}
			});
		}
		return { success: true };
	},

	toggleSubscription: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.chat_not_authenticated());
		const form = await request.formData();
		const tagId = String(form.get('tagId') ?? '').trim();
		const modeRaw = String(form.get('mode') ?? '').trim();
		const mode = modeRaw === 'all' || modeRaw === 'muted' ? modeRaw : null;
		if (!tagId) return fail(400, { message: m.chat_err_tag_invalid() });
		// A subscription is a personal pref, but only on a tag whose org the user
		// can read — verify to avoid cross-org tag enumeration.
		const [row] = await db.select({ orgId: tag.orgId }).from(tag).where(eq(tag.id, tagId)).limit(1);
		if (!row?.orgId) return fail(404, { message: m.chat_err_tag_invalid() });
		await assertCan(locals, 'org.chat.read', { orgId: row.orgId });
		await setTagSubscription(locals.user.id, tagId, mode);
		return { success: true };
	}
};
