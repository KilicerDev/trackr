// Locale-aware label resolvers for the constant id→meta maps in `$lib/config/taxonomy`.
//
// The arrays in data.ts keep their stable `id`/color/`dot`/`tint` fields; their
// English `label` strings are only a fallback. UI code must resolve display
// labels through these functions so they react to the active locale. Each
// function calls a Paraglide message (evaluated per render via getLocale()).
import { m } from '$lib/paraglide/messages';
import type { Locale } from '$lib/paraglide/runtime';

function pick<T extends string>(map: Record<T, () => string>, id: T, fallback?: string): string {
	return map[id]?.() ?? fallback ?? id;
}

// `locale` overrides the ambient request locale — used when rendering text for
// a different user than the current request (e.g. notifications per recipient).
export function statusLabel(id: string, locale?: Locale): string {
	const map: Record<string, (i?: undefined, o?: { locale?: Locale }) => string> = {
		backlog: m.status_backlog,
		todo: m.status_todo,
		in_progress: m.status_in_progress,
		paused: m.status_paused,
		in_review: m.status_in_review,
		done: m.status_done
	};
	return map[id]?.(undefined, locale ? { locale } : undefined) ?? id;
}

export function priorityLabel(id: string, locale?: Locale): string {
	const map: Record<string, (i?: undefined, o?: { locale?: Locale }) => string> = {
		none: m.priority_none,
		low: m.priority_low,
		medium: m.priority_medium,
		high: m.priority_high,
		urgent: m.priority_urgent
	};
	return map[id]?.(undefined, locale ? { locale } : undefined) ?? id;
}

export function typeLabel(id: string): string {
	return pick(
		{
			task: m.type_task,
			bug: m.type_bug,
			improvement: m.type_improvement,
			feature: m.type_feature,
			chore: m.type_chore
		},
		id
	);
}

export function projectStatusLabel(id: string): string {
	return pick(
		{
			prospect: m.project_status_prospect,
			planned: m.project_status_planned,
			active: m.project_status_active,
			paused: m.project_status_paused,
			completed: m.project_status_completed,
			cancelled: m.project_status_cancelled,
			archived: m.project_status_archived
		},
		id
	);
}

export function userStatusLabel(id: string): string {
	return pick(
		{
			active: m.user_status_active,
			invited: m.user_status_invited,
			disabled: m.user_status_disabled
		},
		id
	);
}

export function roleLabel(id: string): string {
	return pick(
		{ owner: m.role_owner, admin: m.role_admin, member: m.role_member, viewer: m.role_viewer },
		id
	);
}

export function rolePerm(id: string): string {
	return pick(
		{
			owner: m.role_owner_perm,
			admin: m.role_admin_perm,
			member: m.role_member_perm,
			viewer: m.role_viewer_perm
		},
		id,
		''
	);
}

export function ticketStatusLabel(id: string, locale?: Locale): string {
	const map: Record<string, (i?: undefined, o?: { locale?: Locale }) => string> = {
		open: m.ticket_status_open,
		in_progress: m.ticket_status_in_progress,
		waiting_on_customer: m.ticket_status_waiting_on_customer,
		waiting_on_agent: m.ticket_status_waiting_on_agent,
		paused: m.ticket_status_paused,
		resolved: m.ticket_status_resolved,
		closed: m.ticket_status_closed
	};
	return map[id]?.(undefined, locale ? { locale } : undefined) ?? id;
}

export function ticketCategoryLabel(id: string, locale?: Locale): string {
	const map: Record<string, (i?: undefined, o?: { locale?: Locale }) => string> = {
		general: m.ticket_category_general,
		billing: m.ticket_category_billing,
		technical_issue: m.ticket_category_technical_issue,
		feature_request: m.ticket_category_feature_request
	};
	return map[id]?.(undefined, locale ? { locale } : undefined) ?? id;
}

export function taskChannelLabel(id: string): string {
	return pick(
		{
			web: m.task_channel_web,
			mcp: m.task_channel_mcp,
			api: m.task_channel_api,
			import: m.task_channel_import,
			template: m.task_channel_template
		},
		id
	);
}

export function ticketChannelLabel(id: string): string {
	return pick(
		{
			web_form: m.ticket_channel_web_form,
			email: m.ticket_channel_email,
			chat: m.ticket_channel_chat,
			api: m.ticket_channel_api
		},
		id
	);
}

export function logKindLabel(id: string): string {
	return pick(
		{
			all: m.log_kind_all,
			member: m.log_kind_member,
			auth: m.log_kind_auth,
			project: m.log_kind_project,
			task: m.log_kind_task,
			ticket: m.log_kind_ticket,
			settings: m.log_kind_settings
		},
		id
	);
}

export function logEventLabel(type: string): string {
	return pick(
		{
			'login.success': m.log_event_login_success,
			'login.fail': m.log_event_login_fail,
			'authz.denied': m.log_event_authz_denied,
			'user.password_reset': m.log_event_user_password_reset,
			'user.create': m.log_event_user_create,
			'user.invite': m.log_event_user_invite,
			'user.invite_revoke': m.log_event_user_invite_revoke,
			'user.role_change': m.log_event_user_role_change,
			'user.disable': m.log_event_user_disable,
			'user.delete': m.log_event_user_delete,
			'user.impersonate': m.log_event_user_impersonate,
			'user.impersonate_stop': m.log_event_user_impersonate_stop,
			'project.create': m.log_event_project_create,
			'project.update': m.log_event_project_update,
			'project.archive': m.log_event_project_archive,
			'project.delete': m.log_event_project_delete,
			'project.member': m.log_event_project_member,
			'task.create': m.log_event_task_create,
			'task.status': m.log_event_task_status,
			'task.comment': m.log_event_task_comment,
			'task.delete': m.log_event_task_delete,
			'ticket.create': m.log_event_ticket_create,
			'ticket.update': m.log_event_ticket_update,
			'ticket.message': m.log_event_ticket_message,
			'ticket.delete': m.log_event_ticket_delete,
			'ticket.convert': m.log_event_ticket_convert,
			'settings.update': m.log_event_settings_update,
			'api.token': m.log_event_api_token,
			'project_template.create': m.log_event_project_template_create,
			'project_template.publish': m.log_event_project_template_publish,
			'project_template.unpublish': m.log_event_project_template_unpublish,
			'project_template.delete': m.log_event_project_template_delete
		},
		type
	);
}

// Permission matrix labels (ROLE_PERMISSIONS in data.ts), keyed by group and item id.
export function permGroupLabel(group: string): string {
	return pick(
		{
			Projects: m.perm_group_projects,
			Tasks: m.perm_group_tasks,
			Members: m.perm_group_members,
			Workspace: m.perm_group_workspace
		},
		group
	);
}

export function permItemLabel(id: string): string {
	return pick(
		{
			'project.create': m.perm_project_create,
			'project.edit': m.perm_project_edit,
			'project.archive': m.perm_project_archive,
			'project.delete': m.perm_project_delete,
			'task.create': m.perm_task_create,
			'task.edit_any': m.perm_task_edit_any,
			'task.edit_own': m.perm_task_edit_own,
			'task.delete_any': m.perm_task_delete_any,
			'task.comment': m.perm_task_comment,
			'task.assign': m.perm_task_assign,
			'member.invite': m.perm_member_invite,
			'member.roles': m.perm_member_roles,
			'member.disable': m.perm_member_disable,
			'ws.settings': m.perm_ws_settings,
			'ws.billing': m.perm_ws_billing,
			'ws.integrations': m.perm_ws_integrations,
			'ws.audit': m.perm_ws_audit
		},
		id
	);
}

// admin-meta.ts ROLE_META (global tiers) + ORG_ROLE_META (org-scoped roles).
export function metaRoleLabel(id: string): string {
	return pick(
		{ user: m.meta_role_user, admin: m.meta_role_admin, superadmin: m.meta_role_superadmin },
		id
	);
}

export function metaRolePerm(id: string): string {
	return pick(
		{
			user: m.meta_role_user_perm,
			admin: m.meta_role_admin_perm,
			superadmin: m.meta_role_superadmin_perm
		},
		id,
		''
	);
}

export function orgRoleLabel(id: string): string {
	return pick(
		{
			'org.superadmin': m.org_role_superadmin,
			'org.admin': m.org_role_admin,
			'org.staff': m.org_role_staff,
			'org.client': m.org_role_client,
			'org.agent': m.org_role_agent,
			'org.member': m.org_role_member
		},
		id
	);
}

export function orgRolePerm(id: string): string {
	return pick(
		{
			'org.superadmin': m.org_role_superadmin_perm,
			'org.admin': m.org_role_admin_perm,
			'org.staff': m.org_role_staff_perm,
			'org.client': m.org_role_client_perm,
			'org.agent': m.org_role_agent_perm,
			'org.member': m.org_role_member_perm
		},
		id,
		''
	);
}
