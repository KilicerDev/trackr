// Localised labels for the webhook event catalogue (client-safe). One entry per
// WEBHOOK_EVENTS row — the `satisfies` keeps the two lists in sync.
import { m } from '$lib/paraglide/messages';
import type { WebhookEventGroup, WebhookEventType } from './events';

export const WEBHOOK_EVENT_DESCRIPTIONS = {
	'ticket.created': () => m.webhooks_ev_ticket_created(),
	'ticket.status_changed': () => m.webhooks_ev_ticket_status_changed(),
	'ticket.assigned': () => m.webhooks_ev_ticket_assigned(),
	'ticket.message_created': () => m.webhooks_ev_ticket_message_created(),
	'ticket.closed': () => m.webhooks_ev_ticket_closed(),
	'task.created': () => m.webhooks_ev_task_created(),
	'task.updated': () => m.webhooks_ev_task_updated(),
	'task.status_changed': () => m.webhooks_ev_task_status_changed(),
	'task.assigned': () => m.webhooks_ev_task_assigned(),
	'task.unassigned': () => m.webhooks_ev_task_unassigned(),
	'task.deleted': () => m.webhooks_ev_task_deleted(),
	'task.time_logged': () => m.webhooks_ev_task_time_logged(),
	'project.created': () => m.webhooks_ev_project_created(),
	'project.archived': () => m.webhooks_ev_project_archived(),
	'project.member_added': () => m.webhooks_ev_project_member_added(),
	'project.member_removed': () => m.webhooks_ev_project_member_removed(),
	'organization.member_added': () => m.webhooks_ev_organization_member_added(),
	'organization.member_removed': () => m.webhooks_ev_organization_member_removed(),
	'organization.member_role_changed': () => m.webhooks_ev_organization_member_role_changed(),
	'invitation.accepted': () => m.webhooks_ev_invitation_accepted(),
	'thread.created': () => m.webhooks_ev_thread_created(),
	'thread.tagged': () => m.webhooks_ev_thread_tagged(),
	'message.created': () => m.webhooks_ev_message_created()
} satisfies Record<WebhookEventType, () => string>;

export const WEBHOOK_GROUP_LABELS: Record<WebhookEventGroup, () => string> = {
	tickets: () => m.webhooks_group_tickets(),
	tasks: () => m.webhooks_group_tasks(),
	projects: () => m.webhooks_group_projects(),
	chat: () => m.webhooks_group_chat()
};
