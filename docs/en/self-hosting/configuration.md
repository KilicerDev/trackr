---
title: Configuration
description: Every knob is an environment variable in the repo-root .env, read by docker compose, the web app and the Go services.
order: 2
updated: 2026-09-10
---

> [!WARNING]
> **Under compose, only forwarded variables count**
>
> The compose file passes an explicit list of variables to each container. Variables marked *not forwarded* below need to be added to the service's `environment` block (or an `env_file` entry) before they take effect. See [Docker Compose](/docs/self-hosting/docker).

## Database

| Variable                        | Default            | Notes                                                                                                                                                       |
| ------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | —                  | Full connection string. Leave empty under compose so it is built from the parts below; `.env.example` ships a local development value that must be cleared. |
| `POSTGRES_USER`                 | `app`              | Compose provisions the `db` service from these.                                                                                                             |
| `POSTGRES_PASSWORD`             | —                  | **Required.**                                                                                                                                               |
| `POSTGRES_DB`                   | `trackr`           |                                                                                                                                                             |
| `POSTGRES_HOST` `POSTGRES_PORT` | `localhost` `5432` | Compose overrides the host to `db`. Under compose, `POSTGRES_PORT` only changes the port published on the host; containers always use 5432.                 |

## Routing and auth

| Variable                        | Default                                | Notes                                                  |
| ------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `ORIGIN`                        | unset                                  | Keep unset behind a proxy that sets forwarded headers. |
| `PROTOCOL_HEADER` `HOST_HEADER` | `x-forwarded-proto` `x-forwarded-host` | Header names the app trusts.                           |
| `XFF_DEPTH`                     | `1`                                    | Number of proxies in front.                            |
| `BETTER_AUTH_SECRET`            | —                                      | **Required.** 32+ characters.                          |
| `ROOT_EMAIL` `ROOT_NAME`        | `root@example.com` `Root`              | Seeded superadmin account.                             |
| `ROOT_PASSWORD`                 | —                                      | **Required on first start.** 8+ characters.            |

## Email

Read by the worker.

| Variable                | Default                                             |
| ----------------------- | --------------------------------------------------- |
| `EMAIL_FROM`            | — (required once `SMTP_HOST` is set)                |
| `SMTP_HOST`             | empty = log to console                              |
| `SMTP_PORT`             | `587`                                               |
| `SMTP_SECURE`           | `true` when `SMTP_PORT` is 465, else `false`        |
| `SMTP_USER` `SMTP_PASS` | —                                                   |
| `DIGEST_TZ`             | `Europe/Berlin` (web app and worker; not forwarded) |

## Storage

See [Docker Compose → Storage](/docs/self-hosting/docker#storage) for the `STORAGE_*` and `S3_*` variables. The `S3_*` variables are not forwarded by the shipped compose file.

## Worker

| Variable                                   | Default     | Notes                                                                                                                                                  |
| ------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WORKER_CONCURRENCY`                       | `4`         | Parallel jobs per worker.                                                                                                                              |
| `WORKER_JOB_TIMEOUT`                       | `4m`        | Per-job deadline. Must be shorter than `WORKER_REAP_AFTER`.                                                                                            |
| `WORKER_POLL_INTERVAL`                     | `1s`        | Fallback poll; `LISTEN/NOTIFY` wakes it instantly.                                                                                                     |
| `WORKER_NOTIFY`                            | `true`      | Set to `false` to disable `LISTEN/NOTIFY`, for example behind a transaction-mode pooler.                                                               |
| `WORKER_HEARTBEAT` `WORKER_REAP_AFTER`     | `30s` `5m`  | Stale jobs are re-queued after the reap window while they have attempts left, otherwise marked failed. Heartbeat must be shorter than the reap window. |
| `WORKER_BACKOFF_BASE` `WORKER_BACKOFF_CAP` | `10s` `10m` | Exponential retry backoff.                                                                                                                             |
| `WORKER_JOB_TYPES`                         | all         | Comma-separated list to pin a worker to some job types.                                                                                                |
| `WORKER_ID`                                | hostname    | Appears in the worker's log lines. Not forwarded.                                                                                                      |

## Scheduler

| Variable                  | Default  | Notes          |
| ------------------------- | -------- | -------------- |
| `SCHEDULER_POLL_INTERVAL` | `5s`     |                |
| `SCHEDULER_BATCH_SIZE`    | `100`    |                |
| `SCHEDULER_ID`            | hostname | Not forwarded. |

## Webhooks and push

| Variable                                                 | Default      | Notes                                                                                                                                |
| -------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `WEBHOOKS_ENABLED`                                       | `true`       | Web app. Not forwarded.                                                                                                              |
| `WEBHOOK_TIMEOUT`                                        | `10s`        | Worker. Not forwarded.                                                                                                               |
| `WEBHOOK_MAX_BODY`                                       | `2048`       | Bytes of the response body kept per delivery attempt. Worker. Not forwarded.                                                         |
| `WEBHOOK_ALLOW_PRIVATE_URLS`                             | `false`      | Development only; also allows plain `http://`. Web app and worker. Not forwarded.                                                    |
| `PUSH_ENABLED`                                           | `false`      | Lets the web app enqueue `push.send` jobs. Delivery also needs the `APNS_*` values in the worker; without them the jobs are skipped. |
| `APNS_KEY` `APNS_KEY_ID` `APNS_TEAM_ID` `APNS_BUNDLE_ID` | —            | APNs credentials for the iOS app. `APNS_KEY` accepts PEM content, a file path or base64.                                             |
| `APNS_ENV`                                               | `production` | `development` for sandbox pushes.                                                                                                    |
