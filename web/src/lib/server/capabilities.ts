// Builds the CapabilityManifest — the single server-computed "what can this
// user see/do" object consumed by the web layout and the mobile /api/v1/me
// endpoint. Before this existed, at least five client-side implementations
// re-derived surface visibility from role strings and permission prefixes
// (sidebars, settings access map, palette gating); they should all read from
// this manifest instead.
//
// Semantics worth keeping stable:
//  - `surfaces` answers reachability (would any route on that surface serve
//    this user), mirroring the server route guards — wiki/notes are
//    internal-team only, tasks/projects need project access, chat needs
//    org.chat.read somewhere, tickets need any ticket read grant.
//  - The per-org/per-project maps are authorization hints for target-aware
//    UI gating; writes are always re-checked server-side with can().
import type { CapabilityManifest, Permission, RoleId } from '$lib/permissions';
import type { Memberships } from '$lib/permissions';
import { effectivePermissions, fullPermissionMatrix, isTrackrTeam } from '$lib/server/permissions';

type Locals = {
	user?: { id: string } | null;
	memberships?: Memberships;
	isAdmin?: boolean;
};

const EMPTY: CapabilityManifest = {
	userType: 'external',
	isAdmin: false,
	surfaces: {
		tickets: false,
		chat: false,
		tasks: false,
		projects: false,
		wiki: false,
		notes: false,
		admin: false,
		settings: false
	},
	quickCreate: { ticket: false, task: false, note: false },
	global: [],
	orgs: {},
	projects: {}
};

export async function buildCapabilities(locals: Locals): Promise<CapabilityManifest> {
	if (!locals.user || !locals.memberships) return EMPTY;

	const staff = isTrackrTeam(locals);
	const isAdmin = !!locals.isAdmin;
	const matrix = await fullPermissionMatrix();
	const global = await effectivePermissions(locals);
	const globalSet = new Set<Permission>(global);

	const orgs: CapabilityManifest['orgs'] = {};
	for (const om of locals.memberships.orgs) {
		orgs[om.orgId] = {
			role: om.role as RoleId,
			isInternal: om.isInternal,
			permissions: matrix[om.role] ?? []
		};
	}
	const projects: CapabilityManifest['projects'] = {};
	for (const pm of locals.memberships.projects) {
		projects[pm.projectId] = {
			role: pm.role as RoleId,
			permissions: matrix[pm.role] ?? []
		};
	}

	// Project access = internal staff (accessibleProjectIds → all) or at least
	// one explicit project membership. Matches accessibleProjectIds() without
	// re-walking it.
	const projectAccess = staff || locals.memberships.projects.length > 0;

	return {
		userType: staff ? 'staff' : 'external',
		isAdmin,
		surfaces: {
			tickets:
				staff ||
				globalSet.has('org.tickets.read.any') ||
				globalSet.has('org.tickets.read.own') ||
				globalSet.has('org.tickets.create'),
			chat: staff || globalSet.has('org.chat.read'),
			tasks: projectAccess,
			projects: projectAccess,
			wiki: staff,
			notes: staff,
			admin: isAdmin,
			// Explicit grant only — admin.access never overrides the superadmin tier.
			settings: isAdmin && globalSet.has('admin.settings.manage')
		},
		quickCreate: {
			ticket: staff || globalSet.has('org.tickets.create'),
			task: staff || globalSet.has('project.tasks.create'),
			note: staff
		},
		global,
		orgs,
		projects
	};
}
