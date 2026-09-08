// Server-side permission engine.
//
// One source of truth: the `role` + `role_permission` rows seeded into the
// database. Loaded once per process into an in-memory map (rebuild on
// SIGUSR2 or process restart). For the current "roles are read-only"
// milestone this is fine; once role editing ships we'll add an
// invalidation hook.
//
// `can(locals, permission, target?)` answers a single boolean question.
// The target shape selects the scope:
//   - omitted             → admin / instance-wide perm
//   - { orgId }           → org-scoped perm
//   - { projectId }       → project-scoped perm (resolves up to the org and
//                            the internal Trackr-org overrides automatically)

import { error } from '@sveltejs/kit';
import { db } from './db';
import {
	rolePermission,
	organizationMember,
	projectMember,
	organization,
	project
} from './db/app.schema';
import { eq } from 'drizzle-orm';
import type { Memberships, Permission, RoleId } from '../permissions';

// ─── Role → permissions map (process-cached) ───────────────────────────────

type RolePermMap = Record<string, Set<Permission>>;
let cached: RolePermMap | null = null;

async function loadRolePermissions(): Promise<RolePermMap> {
	if (cached) return cached;
	const rows = await db
		.select({ roleId: rolePermission.roleId, permission: rolePermission.permission })
		.from(rolePermission);
	const map: RolePermMap = {};
	for (const r of rows) {
		(map[r.roleId] ??= new Set()).add(r.permission as Permission);
	}
	cached = map;
	return map;
}

// Test / dev hook — clears the cache so the next can() call rebuilds it.
export function invalidatePermissionCache() {
	cached = null;
}

// ─── Memberships loader ────────────────────────────────────────────────────

export async function loadMemberships(userId: string): Promise<Memberships> {
	const [orgRows, projRows] = await Promise.all([
		db
			.select({
				orgId: organizationMember.orgId,
				role: organizationMember.role,
				isInternal: organization.isInternal
			})
			.from(organizationMember)
			.innerJoin(organization, eq(organization.id, organizationMember.orgId))
			.where(eq(organizationMember.userId, userId)),
		db
			.select({ projectId: projectMember.projectId, role: projectMember.role })
			.from(projectMember)
			.where(eq(projectMember.userId, userId))
	]);

	return {
		orgs: orgRows.map((r) => ({
			orgId: r.orgId,
			role: r.role as RoleId,
			isInternal: r.isInternal
		})),
		projects: projRows.map((r) => ({ projectId: r.projectId, role: r.role as RoleId }))
	};
}

// Build the `isAdmin` boolean from the loaded memberships. True iff the user
// is a Trackr-org member with a role that includes `admin.access`.
export async function deriveIsAdmin(memberships: Memberships): Promise<boolean> {
	const matrix = await loadRolePermissions();
	for (const m of memberships.orgs) {
		if (!m.isInternal) continue;
		if (matrix[m.role]?.has('admin.access')) return true;
	}
	return false;
}

// Resolve which org an arbitrary project belongs to. Used by project-scoped
// `can()` checks so admin overrides also apply when targeting a project.
const projectOrgCache = new Map<string, string | null>();
async function getProjectOrgId(projectId: string): Promise<string | null> {
	if (projectOrgCache.has(projectId)) return projectOrgCache.get(projectId)!;
	const [row] = await db
		.select({ orgId: project.orgId })
		.from(project)
		.where(eq(project.id, projectId))
		.limit(1);
	const v = row?.orgId ?? null;
	projectOrgCache.set(projectId, v);
	return v;
}

// ─── can() ────────────────────────────────────────────────────────────────

type Locals = {
	user?: { id: string } | null;
	memberships?: Memberships;
	isAdmin?: boolean;
};

type Target = { orgId: string } | { projectId: string } | undefined;

export async function can(
	locals: Locals,
	permission: Permission,
	target?: Target
): Promise<boolean> {
	if (!locals.user || !locals.memberships) return false;
	const matrix = await loadRolePermissions();
	const m = locals.memberships;

	// Internal Trackr-org admin/superadmin always wins. The `admin.access`
	// holder gets every permission. `admin.roles.manage` is reserved for
	// roles that explicitly carry it (superadmin); for all other perms,
	// admin.access acts as a workspace-wide override.
	for (const om of m.orgs) {
		if (!om.isInternal) continue;
		const perms = matrix[om.role];
		if (!perms) continue;
		if (perms.has(permission)) return true;
		if (perms.has('admin.access') && permission !== 'admin.roles.manage') return true;
	}

	// Resolve scope from the target.
	if (!target) {
		// Admin/instance permission with no target: only the internal-org
		// branch above can grant it. Fall through to false.
		return false;
	}

	if ('orgId' in target) {
		const mem = m.orgs.find((o) => o.orgId === target.orgId);
		if (mem && matrix[mem.role]?.has(permission)) return true;
		return false;
	}

	if ('projectId' in target) {
		const proj = m.projects.find((p) => p.projectId === target.projectId);
		if (proj && matrix[proj.role]?.has(permission)) return true;
		// Fall back to the project's org: a user with org-level grant for
		// this perm gets it on every project inside the org.
		const orgId = await getProjectOrgId(target.projectId);
		if (orgId) {
			const orgMem = m.orgs.find((o) => o.orgId === orgId);
			if (orgMem && matrix[orgMem.role]?.has(permission)) return true;
		}
		return false;
	}

	return false;
}

// Quick synchronous helper for filtering project/task lists. Returns either
// `{ all: true }` (the user is on the Trackr internal team and sees every
// project) or `{ all: false, ids: Set<string> }` of project ids the user can
// see via explicit `project_member` rows. Org-only memberships (client / org
// member roles on a client org) grant *no* project access — that's the
// "clients only see tickets" rule.
export type AccessibleProjects = { all: true } | { all: false; ids: Set<string> };

export function accessibleProjectIds(locals: Locals): AccessibleProjects {
	if (!locals.memberships) return { all: false, ids: new Set() };
	const isTrackrTeam = locals.memberships.orgs.some((o) => o.isInternal);
	if (isTrackrTeam) return { all: true };
	return { all: false, ids: new Set(locals.memberships.projects.map((p) => p.projectId)) };
}

// True iff the user holds any role on the internal Trackr organization.
// Used by the layout to surface workspace-level booleans to the client UI.
export function isTrackrTeam(locals: Locals): boolean {
	if (!locals.memberships) return false;
	return locals.memberships.orgs.some((o) => o.isInternal);
}

// True iff the user is an external organization user with NO project access —
// i.e. a pure ticket user (org.client / org.member). These users get the
// minimal ticket portal shell instead of the full app, and are confined to the
// ticket routes. A non-team user who DOES have project access stays a normal
// app user.
export function isPortalUser(locals: Locals): boolean {
	if (!locals.memberships) return false;
	if (isTrackrTeam(locals)) return false;
	return locals.memberships.orgs.length > 0 && locals.memberships.projects.length === 0;
}

// True iff the user may VIEW a given ticket — the shared visibility rule used by
// the detail load and the message/checklist write actions. Agents (edit.any) and
// the org.client tier (read.any) see every org ticket; an org.member (read.own)
// only sees tickets where they're the customer, the creator, or an assignee.
// Creator matters: a ticket raised *for* another customer must stay visible to
// whoever opened it (ticketRecipients notifies creators — without this, that
// notification links to a 403).
export async function canViewTicket(
	locals: Locals,
	ticket: { orgId: string; customerId: string | null; assignees: string[]; createdBy?: string | null }
): Promise<boolean> {
	if (isTrackrTeam(locals)) return true;
	if (await can(locals, 'org.tickets.edit.any', { orgId: ticket.orgId })) return true;
	if (await can(locals, 'org.tickets.read.any', { orgId: ticket.orgId })) return true;
	const uid = locals.user?.id;
	if (
		uid &&
		(ticket.customerId === uid || ticket.assignees.includes(uid) || ticket.createdBy === uid) &&
		(await can(locals, 'org.tickets.read.own', { orgId: ticket.orgId }))
	) {
		return true;
	}
	return false;
}

// Throws 403 if the user lacks the permission. Use in load functions and
// form actions to enforce gates inline. Returns void on success.
export async function assertCan(
	locals: Locals,
	permission: Permission,
	target?: Target
): Promise<void> {
	if (!(await can(locals, permission, target))) {
		error(403, 'You do not have permission to perform this action.');
	}
}

// Union of every permission the user holds via any of their memberships —
// Trackr-org admin, any client-org membership, any project membership.
// Used by the (app) layout load to surface a permission set to the client UI
// for hide/disable decisions. UI gating only; server always re-checks with
// scope-specific can() so this is allowed to be imprecise (it tells you the
// user *can* do X *somewhere*, not necessarily on this specific target).
export async function effectivePermissions(locals: Locals): Promise<Permission[]> {
	if (!locals.user || !locals.memberships) return [];
	const matrix = await loadRolePermissions();
	const out = new Set<Permission>();
	for (const om of locals.memberships.orgs) {
		for (const p of matrix[om.role] ?? []) out.add(p);
	}
	for (const pm of locals.memberships.projects) {
		for (const p of matrix[pm.role] ?? []) out.add(p);
	}
	return Array.from(out);
}

// Look up every permission for a given role id — used by the read-only
// /admin/system/roles page.
export async function permissionsForRole(roleId: string): Promise<Permission[]> {
	const matrix = await loadRolePermissions();
	return Array.from(matrix[roleId] ?? []);
}

export async function fullPermissionMatrix(): Promise<Record<string, Permission[]>> {
	const matrix = await loadRolePermissions();
	const out: Record<string, Permission[]> = {};
	for (const [k, v] of Object.entries(matrix)) out[k] = Array.from(v);
	return out;
}
