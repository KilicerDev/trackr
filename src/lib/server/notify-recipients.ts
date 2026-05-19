// Resolves the set of user ids that should receive a notification for a
// given event. This is the *only* file that decides who hears about what —
// every call site goes through here so we can audit one place for leaks.
//
// Security model: recipients are derived from the same `role_permission`
// matrix that gates reads on the entity. A client from org B can never end
// up in the recipient set for a ticket in org A, by construction.

import { eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { organization, organizationMember, rolePermission } from './db/app.schema';
import type { Permission } from '../permissions';

async function rolesGranting(perms: Permission[]): Promise<Set<string>> {
	if (perms.length === 0) return new Set();
	const rows = await db
		.select({ roleId: rolePermission.roleId })
		.from(rolePermission)
		.where(inArray(rolePermission.permission, perms as string[]));
	return new Set(rows.map((r) => r.roleId));
}

// Members of `orgId` whose role grants any of `perms`.
async function orgMembersWithAnyPerm(
	orgId: string,
	perms: Permission[]
): Promise<Set<string>> {
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

export type TicketRecipientCtx = {
	orgId: string;
	customerId: string | null;
	assignedAgentId: string | null;
};

// Recipients allowed to know about a ticket in `orgId`:
//   - members of `orgId` holding `org.tickets.read.any` (org agents / admins)
//   - internal Trackr staff (via internal-org membership + matching perm)
//   - the ticket's customer (read.own grants them sight of their own ticket)
//   - the assigned agent
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
	if (ctx.assignedAgentId) out.add(ctx.assignedAgentId);
	return out;
}
