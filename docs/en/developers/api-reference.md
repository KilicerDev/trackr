---
title: API reference
description: The Trackr API is REST over HTTPS with JSON bodies, under /api/v1 of your instance. It is the same API the iOS app and the CLI use.
order: 2
updated: 2026-09-10
---

## Conventions

- Base URL: `https://<your-instance>/api/v1` (for the hosted product, `https://app.trackr.dev/api/v1`).
- Authentication: `Authorization: Bearer <token>`. See [Authentication](/docs/developers/authentication).
- Bodies and responses are JSON. Dates are ISO 8601 strings; calendar-day inputs such as `plannedFor` and a time log's `date` are `YYYY-MM-DD`.
- Endpoints that create tasks, tickets, comments, messages and threads also accept `multipart/form-data` with a `payload` field holding the JSON and one or more `attachments` file parts.
- Errors return a JSON object with a `message` and an HTTP status: `400` invalid input, `401` no session, `403` no permission, `404` not found or not visible.
- Every endpoint enforces the same permissions as the web app.

```bash title="list-my-tasks.sh"
curl "https://app.trackr.dev/api/v1/tasks?scope=mine" \
  -H "Authorization: Bearer $TRACKR_TOKEN"
```

```json title="response"
{
	"tasks": [
		{
			"id": "SCM-1",
			"uuid": "7a4d…",
			"title": "Prepare CAD models for the fair",
			"status": "todo",
			"priority": "high",
			"type": "task",
			"estimate": 360,
			"due": "2026-09-12",
			"project": "3b9a…",
			"assignees": ["9c1e…"]
		}
	],
	"users": { "9c1e…": { "name": "Ertugul Kilic", "color": "#ff4867" } }
}
```

In list rows `id` is the human-readable reference and `uuid` the database id; use the `uuid` wherever a path expects `:id`. Assignees are user ids; the `users` map carries their display names.

## Session

| Method        | Path              | Description                                                                                                |
| ------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET`         | `/instance`       | Unauthenticated probe. Returns `{ name, version, api, branding }`.                                         |
| `GET`         | `/me`             | `{ user, capabilities, orgs, unreadCount, instances }`.                                                    |
| `GET` `PATCH` | `/me/preferences` | Resolved preferences as `{ preferences }`. `PATCH` merges a partial object.                                |
| `PATCH`       | `/me/profile`     | Update `name` and `image`.                                                                                 |
| `GET` `POST`  | `/me/views`       | Saved views / filters per page, shared with the web app. `POST` body `{ key, patch }`.                     |
| `GET`         | `/events`         | Server-sent events stream. Emits invalidation hints (`entity`, `inbox`).                                   |
| `GET`         | `/search?q=`      | Global search across tickets, tasks, projects, wiki and notes as `{ results }`. Optional `types`, `orgId`. |

## Inbox

| Method | Path           | Description                                                                   |
| ------ | -------------- | ----------------------------------------------------------------------------- |
| `GET`  | `/inbox`       | Cursor-paged notification feed. Optional `limit` (≤ 100) and `filter=unread`. |
| `GET`  | `/inbox/badge` | Unread count only, as `{ unread }`.                                           |
| `POST` | `/inbox/read`  | Body `{ all: true }`, `{ id }` or `{ entityType, entityId }`.                 |

## Tasks

| Method   | Path                     | Description                                                                                                                                                                                |
| -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/tasks?scope=mine\|all` | List tasks as `{ tasks, users }`. Default scope `mine`.                                                                                                                                    |
| `POST`   | `/tasks`                 | Create. Body: `title`, `projectKey`, `description`, `status`, `priority`, `type`, `due`, `estimate`, `tags`, `assigneeIds`, `dependsOnIds`, `plannedFor`. Returns `201 { id, displayId }`. |
| `GET`    | `/tasks/:id`             | `{ task, attachments, authors, assignableUsers, canEdit, canComment }`.                                                                                                                    |
| `PATCH`  | `/tasks/:id`             | Update any editable field, including `checklist` and `dependsOnIds`.                                                                                                                       |
| `DELETE` | `/tasks/:id`             | Delete (requires `project.tasks.delete.any`).                                                                                                                                              |
| `POST`   | `/tasks/:id/comments`    | Add a comment: `{ body }`.                                                                                                                                                                 |
| `POST`   | `/tasks/:id/time`        | Log time: `{ minutes, date, note }`.                                                                                                                                                       |

## Tickets

| Method   | Path                                          | Description                                                                                                                             |
| -------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/tickets?segment=mine\|watched\|all&status=` | List tickets by last activity.                                                                                                          |
| `POST`   | `/tickets`                                    | Create: `{ orgId, subject, description? }`; agents may also set `priority`, `category`, `assigneeIds`. Returns `201 { id, displayId }`. |
| `GET`    | `/tickets/:id`                                | Detail with the full message timeline, attachments, `linkedTasks` and `canInternalNote`.                                                |
| `PATCH`  | `/tickets/:id`                                | Agent-only: `status`, `priority`, `category`, `assigneeIds`, `tags`.                                                                    |
| `DELETE` | `/tickets/:id`                                | Delete.                                                                                                                                 |
| `POST`   | `/tickets/:id/messages`                       | Public reply, or `{ internal: true }` for a staff note.                                                                                 |
| `PUT`    | `/tickets/:id/checklist`                      | Replace the whole checklist array.                                                                                                      |
| `POST`   | `/tickets/:id/tasks`                          | Convert into a linked project task (team only).                                                                                         |

## Projects

| Method       | Path                     | Description                                                                              |
| ------------ | ------------------------ | ---------------------------------------------------------------------------------------- |
| `GET`        | `/projects`              | Projects you can see.                                                                    |
| `GET`        | `/projects/:id`          | Project summary.                                                                         |
| `GET` `POST` | `/projects/:id/activity` | History feed as plain text, paged with `offset`; `POST { body }` adds a project comment. |

## Chat, notes, wiki

| Method       | Path                         | Description                                                                                                |
| ------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET` `POST` | `/chat/threads?orgId=`       | Thread feed with tags and unread ids; `POST` `{ orgId, title, body }`.                                     |
| `GET`        | `/chat/threads/:id`          | Messages; marks the thread read.                                                                           |
| `POST`       | `/chat/threads/:id/messages` | Reply.                                                                                                     |
| `POST`       | `/notes`                     | Quick note: `{ title, body? }` (internal team only).                                                       |
| `GET`        | `/notes/list`                | `{ quick, meetings, shared }` (internal team only).                                                        |
| `GET`        | `/notes/:id`                 | Read a note (internal team only).                                                                          |
| `GET`        | `/wiki`                      | Flat tree as `{ pages }`: `id`, `parentId`, `title`, `icon`, `isFolder`, `sortOrder` (internal team only). |
| `GET`        | `/wiki/:id`                  | `{ page }` with the rendered `bodyHtml` (internal team only).                                              |

## Devices

| Method          | Path           | Description                                                                                                                          |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` `DELETE` | `/push/tokens` | Register `{ token, platform, deviceName? }` or remove `{ token }` a device token. `platform`: `ios`, `android`, `ios-live-activity`. |

Meeting notes linked to a task are served outside `/api/v1` at `GET /api/tasks/:uuid/meetings` (session token only, internal team).

> [!NOTE]
> **Live updates**
>
> Subscribe to `/events` for a server-sent events stream. It carries small invalidation hints rather than payloads; refetch the entity you care about when one arrives. The stream sends a comment frame every 25 seconds to keep the connection alive and asks clients to reconnect after 3 seconds.

> [!WARNING]
> **Rate limits and OpenAPI**
>
> There is no rate limiting today and no published OpenAPI document yet. Both are on the roadmap. Be a good citizen: cache `/me`, use `/events` instead of polling, and page the inbox with its cursor. Task, ticket and project lists are not paged.
