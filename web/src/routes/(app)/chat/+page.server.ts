import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization, tag } from '$lib/server/db/app.schema';
import { assertCan, can, isPortalUser, isTrackrTeam } from '$lib/server/permissions';
import { getPreferences } from '$lib/server/preferences';
import { m } from '$lib/paraglide/messages';
import {
	addMessage,
	createTag,
	createThread,
	getThreadContext,
	listOrgTags,
	listTagSubscriptions,
	loadOrgFeed,
	markThreadRead,
	setTagSubscription,
	setThreadTags
} from '$lib/server/chat';
import { attachFormFiles } from '$lib/server/attachments';
import { notify } from '$lib/server/notify';
import {
	orgChatRecipients,
	orgMentionRecipients,
	tagFollowers,
	tagMuters
} from '$lib/server/notify/recipients';
import { parseMentionIds } from '$lib/utils/mentions';

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
	const [feed, tags, subscriptions] = await Promise.all([
		loadOrgFeed(activeOrgId, { tagId: tagFilter }),
		listOrgTags(activeOrgId),
		listTagSubscriptions(locals.user.id, activeOrgId)
	]);

	return {
		orgs,
		activeOrgId,
		isPortal: portal,
		tagFilter: tagFilter ?? null,
		feed,
		tags,
		subscriptions
	};
};

// Fan-out for a new chat message: derived org-chat audience ∪ tag followers, less
// muters, then notify(). @-mentions are notified separately so a muted topic
// still pings a mentioned user.
async function notifyChatMessage(opts: {
	threadId: string;
	orgId: string;
	threadTitle: string | null;
	actorId: string;
	body: string;
	origin: string;
}) {
	const { threadId, orgId, threadTitle, actorId, body, origin } = opts;
	const url = `/chat?org=${orgId}&thread=${threadId}`;

	const [audience, followers, muters] = await Promise.all([
		orgChatRecipients(orgId),
		tagFollowers(threadId),
		tagMuters(threadId)
	]);
	const recipients = new Set<string>([...audience, ...followers]);
	for (const id of muters) recipients.delete(id);

	void notify({
		kind: 'chatMessage',
		recipients,
		actorId,
		orgId,
		render: (locale) => ({
			title: m.notify_chat_message({ thread: threadTitle ?? m.chat_untitled() }, { locale }),
			body: body.slice(0, 280)
		}),
		url,
		entity: { type: 'thread', id: threadId },
		baseUrl: origin
	}).catch((err) => console.error('chat message notify failed', err));

	const mentioned = await orgMentionRecipients(orgId, parseMentionIds(body));
	if (mentioned.size > 0) {
		void notify({
			kind: 'mentioned',
			recipients: mentioned,
			actorId,
			orgId,
			render: (locale) => ({
				title: m.notify_mentioned({ label: threadTitle ?? m.chat_untitled() }, { locale }),
				body: body.slice(0, 280)
			}),
			url,
			entity: { type: 'thread', id: threadId },
			baseUrl: origin
		}).catch((err) => console.error('chat mention notify failed', err));
	}
}

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
		await notifyChatMessage({
			threadId,
			orgId,
			threadTitle: title,
			actorId: me.id,
			body,
			origin: url.origin
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

		const { id: messageId } = await addMessage({ threadId, authorId: me.id, body: body || '(attachment)' });
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
			actorId: me.id,
			body,
			origin: url.origin
		});
		return { success: true };
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

	setTags: async ({ request, locals }) => {
		if (!locals.user) throw error(401, m.chat_not_authenticated());
		const form = await request.formData();
		const threadId = String(form.get('threadId') ?? '').trim();
		if (!threadId) return fail(400, { message: m.chat_err_thread_required() });
		const ctx = await getThreadContext(threadId);
		if (!ctx) return fail(404, { message: m.chat_err_thread_not_found() });
		await assertCan(locals, 'org.chat.post', { orgId: ctx.orgId });
		await setThreadTags(threadId, parseTagIds(form.get('tags')));
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
