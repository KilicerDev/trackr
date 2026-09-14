---
title: Webhooks
description: Subscribe to events and Trackr POSTs a signed JSON payload to your endpoint, with retries and automatic disabling of dead endpoints.
order: 3
updated: 2026-09-10
---

## Creating a subscription

Superadmins manage subscriptions under **Admin → Settings → Webhooks**. A subscription has a name, a target URL, a set of event types, and optional filters: organizations (including _internal projects_ for work without a client), projects, assignee, and whether internal ticket messages are included.

On creation you receive the signing secret **once**, in the form `whsec_…`. Afterwards only a hint is shown. You can rotate it at any time.

## The payload

```json title="task.status_changed"
{
	"id": "5f0c…",
	"type": "task.status_changed",
	"version": "2026-09-01",
	"createdAt": "2026-09-01T09:24:00Z",
	"organizationId": null,
	"projectId": "3b9a…",
	"actor": { "id": "…", "name": "Ertugul Kilic" },
	"data": {
		"task": {
			"id": "…",
			"ref": "SCM-12",
			"projectId": "3b9a…",
			"title": "…",
			"status": "done",
			"priority": "high",
			"type": "task",
			"assigneeIds": ["…"],
			"dependsOnIds": [],
			"dueDate": "2026-09-12",
			"url": "https://app.trackr.dev/tasks/SCM-12"
		},
		"previousStatus": "in_progress",
		"status": "done"
	}
}
```

Ids are bare UUIDs. `organizationId` is `null` for internal projects, `projectId` is `null` for events without a project, and `actor` is `null` for system-generated events. Every entity snapshot carries a human-readable `ref` and an absolute `url`; user emails are never included. Message bodies are truncated to 2000 characters. The `version` is the envelope version; it changes only when the shape changes.

## Headers and signature

| Header               | Content                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `X-Trackr-Event`     | The event type, e.g. `ticket.created`.                                    |
| `X-Trackr-Delivery`  | Unique id of this delivery. Use it to de-duplicate.                       |
| `X-Trackr-Timestamp` | Unix time (seconds) the request was signed.                               |
| `X-Trackr-Signature` | `sha256=<hex>`: HMAC-SHA256 of `timestamp + "." + body` with your secret. |

```typescript title="verify.ts"
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verify(secret: string, timestamp: string, body: string, header: string) {
	const expected =
		'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
	const a = Buffer.from(expected);
	const b = Buffer.from(header);
	return a.length === b.length && timingSafeEqual(a, b);
}
```

Reject requests whose timestamp is older than a few minutes to prevent replays.

## Events

| Group              | Event types                                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tickets            | `ticket.created` · `ticket.status_changed` · `ticket.assigned` · `ticket.message_created` · `ticket.closed`                                                                                                           |
| Tasks              | `task.created` · `task.updated` · `task.status_changed` · `task.assigned` · `task.unassigned` · `task.deleted` · `task.time_logged`                                                                                   |
| Projects & members | `project.created` · `project.archived` · `project.member_added` · `project.member_removed` · `organization.member_added` · `organization.member_removed` · `organization.member_role_changed` · `invitation.accepted` |
| Chat (high volume) | `thread.created` · `thread.tagged` · `message.created`                                                                                                                                                                |

A synthetic `ping` event is sent by **Send test** on an enabled subscription and cannot be subscribed to.

## Delivery, retries and disabling

- Deliveries are made by the worker with a 10-second timeout and a `User-Agent` of `Trackr-Webhooks/1`. Any `2xx` counts as success; redirects are not followed, so a `3xx` is a failure.
- Failed deliveries are retried after **1 min → 5 min → 30 min → 2 h → 12 h** (six attempts total).
- A subscription is **disabled automatically** after five consecutive exhausted deliveries with no success in 72 hours. Admins are notified and can re-enable it.
- Every attempt is recorded for 30 days and can be inspected or **redelivered** from the subscription page. Disabling a subscription cancels its queued deliveries.

> [!WARNING]
> **Public HTTPS endpoints only**
>
> Targets must be `https://`, carry no credentials in the URL, and resolve to a public IP. Private ranges are rejected when the subscription is saved and again when the worker connects, to prevent server-side request forgery. Self-hosters can set `WEBHOOK_ALLOW_PRIVATE_URLS=true` for development, which also allows plain `http://`.
