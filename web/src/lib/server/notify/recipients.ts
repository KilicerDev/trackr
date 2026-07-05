// Resolves the set of user ids that should receive a notification for a
// given event. This is the *only* file that decides who hears about what —
// every call site goes through here so we can audit one place for leaks.
//
// Security model: recipients are derived from the same `role_permission`
// matrix that gates reads on the entity. A client from org B can never end
// up in the recipient set for a ticket in org A, by construction.

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
	organization,
	organizationMember,
	projectMember,
	rolePermission,
	tagSubscription,
	threadTag
} from '../db/app.schema';
import type { Permission } from '../../permissions';

async function rolesGranting(perms: Permission[]): Promise<Set<string>> {
	if (perms.length === 0) return new Set();
	const rows = await db
		.select({ roleId: rolePermission.roleId })
		.from(rolePermission)
		.where(inArray(rolePermission.permission, perms as string[]));
	return new Set(rows.map((r) => r.roleId));
}

// Members of `orgId` whose role grants any of `perms`.
async function orgMembersWithAnyPerm(orgId: string, perms: Permission[]): Promise<Set<string>> {
	const allowedRoles = await rolesGranting(perms);
	if (allowedRoles.size === 0) return new Set();
	const rows = await db
		.select({ userId: organizationMember.userId, role: organizationMember.role })
		.from(organizationMember)
		.where(eq(organizationMember.orgId, orgId));
	const out = new Set<string>();
	for (const r of rows) if (allowedRoles.has(r.role)) out.add(r.userId);
	return out;
}

// Internal-org members whose role grants any of `perms`. The internal-org
// `admin.access` role is an implicit grant for every other permission inside
// can(), so we include it here too.
async function internalStaffWithAnyPerm(perms: Permission[]): Promise<Set<string>> {
	const allowedRoles = await rolesGranting([...perms, 'admin.access' as Permission]);
	if (allowedRoles.size === 0) return new Set();
	const internalOrgs = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.isInternal, true));
	if (internalOrgs.length === 0) return new Set();
	const rows = await db
		.select({ userId: organizationMember.userId, role: organizationMember.role })
		.from(organizationMember)
		.where(
			inArray(
				organizationMember.orgId,
				internalOrgs.map((o) => o.id)
			)
		);
	const out = new Set<string>();
	for (const r of rows) if (allowedRoles.has(r.role)) out.add(r.userId);
	return out;
}

export type TaskRecipientCtx = {
	creatorId: string | null;
	assigneeIds: Iterable<string>;
	// Optional extras — used by the comment-add path to also notify previous
	// commenters. Keep this opt-in so the default audience stays tight.
	extraIds?: Iterable<string>;
};

// Recipients for a task event: current assignees, the creator, and any
// extras the caller supplies (e.g. prior commenters). The actor is dropped
// inside notify() so callers don't need to filter themselves out here.
//
// Deliberately NOT broadcasting to "everyone with project.tasks.read.any"
// — that would page entire project teams on every status change.
export function taskRecipients(ctx: TaskRecipientCtx): Set<string> {
	const out = new Set<string>();
	for (const id of ctx.assigneeIds) if (id) out.add(id);
	if (ctx.creatorId) out.add(ctx.creatorId);
	if (ctx.extraIds) for (const id of ctx.extraIds) if (id) out.add(id);
	return out;
}

// All members of internal (Trackr) organizations. They see every project
// (mirrors `accessibleProjectIds` returning `{ all: true }` for the team), so
// any of them is a valid mention recipient on any project/task.
async function internalOrgMemberIds(): Promise<Set<string>> {
	const internalOrgs = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.isInternal, true));
	if (internalOrgs.length === 0) return new Set();
	const rows = await db
		.select({ userId: organizationMember.userId })
		.from(organizationMember)
		.where(
			inArray(
				organizationMember.orgId,
				internalOrgs.map((o) => o.id)
			)
		);
	return new Set(rows.map((r) => r.userId));
}

// Filter `candidateIds` (people picked from an @-mention) down to those who can
// actually access `projectId`: explicit project members + internal Trackr team.
// Prevents mentioning someone into a project they can't read. The actor is
// dropped later inside notify().
export async function projectMentionRecipients(
	projectId: string,
	candidateIds: Iterable<string>
): Promise<Set<string>> {
	const candidates = new Set([...candidateIds].filter(Boolean));
	if (candidates.size === 0) return new Set();
	const [memberRows, internal] = await Promise.all([
		db
			.select({ userId: projectMember.userId })
			.from(projectMember)
			.where(eq(projectMember.projectId, projectId)),
		internalOrgMemberIds()
	]);
	const allowed = new Set<string>([...memberRows.map((r) => r.userId), ...internal]);
	return new Set([...candidates].filter((id) => allowed.has(id)));
}

export type TicketRecipientCtx = {
	orgId: string;
	customerId: string | null;
	assigneeIds: string[];
};

// Recipients allowed to know about a ticket in `orgId`:
//   - members of `orgId` holding `org.tickets.read.any` (org agents / admins)
//   - internal Trackr staff (via internal-org membership + matching perm)
//   - the ticket's customer (read.own grants them sight of their own ticket)
//   - every assigned agent
//
// Pass `internalOnly: true` for internal-note message events — the customer
// must never see internal notes even when they otherwise watch the ticket.
export async function ticketRecipients(
	ctx: TicketRecipientCtx,
	opts: { internalOnly?: boolean } = {}
): Promise<Set<string>> {
	const [agents, internal] = await Promise.all([
		orgMembersWithAnyPerm(ctx.orgId, ['org.tickets.read.any' as Permission]),
		internalStaffWithAnyPerm(['org.tickets.read.any' as Permission])
	]);
	const out = new Set<string>([...agents, ...internal]);
	if (!opts.internalOnly && ctx.customerId) out.add(ctx.customerId);
	for (const id of ctx.assigneeIds) out.add(id);
	return out;
}

// The audience of an org's support chat: org members holding `org.chat.read`
// (the "see-all" tier — clients/admins) plus internal Trackr staff with the
// same permission. Standard own-tickets-only members never hold it, so they're
// excluded by construction. This is the derived membership for the chat — no
// stored member rows.
export async function orgChatRecipients(orgId: string): Promise<Set<string>> {
	const [members, internal] = await Promise.all([
		orgMembersWithAnyPerm(orgId, ['org.chat.read' as Permission]),
		internalStaffWithAnyPerm(['org.chat.read' as Permission])
	]);
	return new Set<string>([...members, ...internal]);
}

// Filter @-mention candidates down to people actually in the org chat audience,
// so a mention can never page someone who can't read the chat. Org analogue of
// `projectMentionRecipients`.
export async function orgMentionRecipients(
	orgId: string,
	candidateIds: Iterable<string>
): Promise<Set<string>> {
	const candidates = new Set([...candidateIds].filter(Boolean));
	if (candidates.size === 0) return new Set();
	const allowed = await orgChatRecipients(orgId);
	return new Set([...candidates].filter((id) => allowed.has(id)));
}

// Users who have explicitly subscribed to (`'all'`) or muted (`'muted'`) any
// tag on `threadId`. Drives tag-based notification routing: followers are added
// to the audience even if not otherwise involved; muters are dropped (unless
// mentioned). Returns the set for the requested mode.
async function tagSubscribersForThread(
	threadId: string,
	mode: 'all' | 'muted'
): Promise<Set<string>> {
	const rows = await db
		.select({ userId: tagSubscription.userId })
		.from(tagSubscription)
		.innerJoin(threadTag, eq(threadTag.tagId, tagSubscription.tagId))
		.where(and(eq(threadTag.threadId, threadId), eq(tagSubscription.mode, mode)));
	return new Set(rows.map((r) => r.userId));
}

export function tagFollowers(threadId: string): Promise<Set<string>> {
	return tagSubscribersForThread(threadId, 'all');
}

export function tagMuters(threadId: string): Promise<Set<string>> {
	return tagSubscribersForThread(threadId, 'muted');
}
