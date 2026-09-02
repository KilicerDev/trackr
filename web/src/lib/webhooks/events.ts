/**
 * Outbound webhook event catalogue — the single list the admin UI, the emit
 * helper and the payload docs share. Adding an event = one entry here, an
 * `emitWebhookEvent` call at the write path, and a label key in messages/*.
 *
 * Event names are stable API: never rename one, add a new one instead.
 */

export const WEBHOOK_EVENT_GROUPS = ['tickets', 'tasks', 'projects', 'chat'] as const;
export type WebhookEventGroup = (typeof WEBHOOK_EVENT_GROUPS)[number];

export const WEBHOOK_EVENTS = [
	// tickets
	{ type: 'ticket.created', group: 'tickets' },
	{ type: 'ticket.status_changed', group: 'tickets' },
	{ type: 'ticket.assigned', group: 'tickets' },
	{ type: 'ticket.message_created', group: 'tickets' },
	{ type: 'ticket.closed', group: 'tickets' },
	// tasks
	{ type: 'task.created', group: 'tasks' },
	{ type: 'task.updated', group: 'tasks' },
	{ type: 'task.status_changed', group: 'tasks' },
	{ type: 'task.assigned', group: 'tasks' },
	{ type: 'task.unassigned', group: 'tasks' },
	{ type: 'task.deleted', group: 'tasks' },
	{ type: 'task.time_logged', group: 'tasks' },
	// projects & members
	{ type: 'project.created', group: 'projects' },
	{ type: 'project.archived', group: 'projects' },
	{ type: 'project.member_added', group: 'projects' },
	{ type: 'project.member_removed', group: 'projects' },
	{ type: 'organization.member_added', group: 'projects' },
	{ type: 'organization.member_removed', group: 'projects' },
	{ type: 'organization.member_role_changed', group: 'projects' },
	{ type: 'invitation.accepted', group: 'projects' },
	// chat (high volume — opt in)
	{ type: 'thread.created', group: 'chat' },
	{ type: 'thread.tagged', group: 'chat' },
	{ type: 'message.created', group: 'chat' }
] as const satisfies readonly { type: string; group: WebhookEventGroup }[];

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]['type'];

/** Synthetic event sent by "Send test event"; not subscribable. */
export const WEBHOOK_PING_EVENT = 'ping';

export const WEBHOOK_EVENT_TYPES: readonly WebhookEventType[] = WEBHOOK_EVENTS.map((e) => e.type);

const TYPE_SET = new Set<string>(WEBHOOK_EVENT_TYPES);

export function isWebhookEventType(s: string): s is WebhookEventType {
	return TYPE_SET.has(s);
}

export function eventsInGroup(group: WebhookEventGroup): WebhookEventType[] {
	return WEBHOOK_EVENTS.filter((e) => e.group === group).map((e) => e.type);
}

/** Payload envelope version. Bump only for breaking shape changes. */
export const WEBHOOK_PAYLOAD_VERSION = '2026-09-01';

/** Bodies (ticket messages, chat messages) are truncated to this many chars. */
export const WEBHOOK_BODY_MAX = 2000;
