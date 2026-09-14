---
title: Background jobs
description: Emails, webhooks, push and cleanup run outside the request path, through a Postgres-backed queue drained by the Go worker.
order: 3
updated: 2026-09-10
---

## How the queue works

The web app writes a row into the `jobs` table. The worker claims rows with `SELECT … FOR UPDATE SKIP LOCKED`, runs the handler, and records the outcome. A Postgres `LISTEN/NOTIFY` trigger wakes the worker the moment a job is inserted or becomes claimable again, so latency is milliseconds, and a poll interval catches anything missed.

Lifecycle: `queued → running → succeeded | failed (retry with backoff) | cancelled`. Each running job heartbeats; a reaper re-queues jobs whose worker died while they still have attempts left (five by default) and marks the rest failed.

## Job types

| Type                                                                              | Purpose                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `mail.send`                                                                       | Transactional email.                                                                 |
| `webhook.deliver`                                                                 | One webhook delivery attempt. Retries are scheduled as new jobs.                     |
| `push.send`                                                                       | APNs push to registered devices.                                                     |
| `notify.digest`                                                                   | Runs every 15 minutes and flushes each user's hourly or daily digest window.         |
| `prune.jobs` `prune.invitations` `prune.notifications` `prune.webhook_deliveries` | Retention: 30 days, 7 days, 90 days (read notifications) and 30 days, checked daily. |

## Schedules

The scheduler reads the `schedules` table every few seconds and enqueues one job per due row, then advances `next_run_at` by the row's interval. It only enqueues; the worker does the work. Schedules are plain rows: pause, retune or add one with SQL, or enable and pause them under **Admin → System → Schedules**.

## Monitoring

**Admin → System → Jobs** shows the last 50 jobs with type, state, attempts and error, plus actions to send a test email, stop a queued or running job, or retry a finished one. Both pages are limited to superadmins. Both Go services log structured key=value lines to stderr; point your log shipper at the containers.
