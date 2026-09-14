---
title: Notifications & email
description: Every event can reach people through the in-app inbox, email and push. Each person decides how they want to hear about which event.
order: 3
updated: 2026-09-10
---

## Channels

| Channel   | Delivered by                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Inbox** | Instantly, in the app and via `GET /api/v1/inbox`. The bell shows the unread count.                                                 |
| **Email** | The worker, through your SMTP server. Rendered per recipient in their language.                                                     |
| **Push**  | The worker, through APNs, to devices registered by the iOS app. Push mirrors the inbox: whatever lands in the inbox is also pushed. |

## Preferences

Under **Settings** each person configures every event twice: whether it lands in the **inbox** (on or off), and how it is **emailed** (off, instant, or bundled into a digest). Events cover tasks (assigned, mentioned, commented, status changed, due soon), tickets (created, assigned, status changed, new message, mentioned), chat (new message, mentioned), project mentions and wiki updates.

- The **digest** runs hourly or daily at an hour you choose and bundles every event you set to _digest_.
- **Quiet hours** pause instant email: anything that would have been sent instantly waits for the next digest instead. They do not affect the inbox or push.
- Users who see everything in an organization can also narrow a surface to _participating_ or _mentions only_.

## For administrators

- Emails are sent as jobs (`mail.send`). If `SMTP_HOST` is unset the worker logs the email instead of sending it, which is handy in development.
- **Admin → System → Jobs** (superadmins) shows the last 50 jobs of every type and lets you send a test email, stop or retry jobs.
- Read notifications older than 90 days and invitations older than 7 days are pruned on a schedule you can see under **Admin → System → Schedules**.
