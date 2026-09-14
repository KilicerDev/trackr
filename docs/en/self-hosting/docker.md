---
title: Docker Compose
description: Run your own Trackr with Postgres, an SMTP server and optional object storage. One compose file, four containers, no message broker.
order: 1
updated: 2026-09-10
---

## What you get

| Service     | Image                                               | Role                                                                                                  |
| ----------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `db`        | `postgres:16-alpine`                                | Data, plus the job queue. Published on `127.0.0.1:5432` only.                                         |
| `app`       | built from `./web`                                  | The web app, API and collaboration server on port `3000`. No host port; put a reverse proxy in front. |
| `worker`    | built from `./services` with `worker/Dockerfile`    | Emails, webhooks, push, digests, cleanup.                                                             |
| `scheduler` | built from `./services` with `scheduler/Dockerfile` | Enqueues recurring jobs.                                                                              |

The two Go services share the `./services` build context because they compile the same `shared/` packages. Attachments go to a Docker volume by default, or to any S3-compatible bucket.

## Deploy

:::steps

### Clone and configure

```sh
git clone https://github.com/KilicerDev/trackr.git && cd trackr
cp .env.example .env
```

Fill in `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` (32+ random characters) and `ROOT_PASSWORD` (8+ characters). Then change two values the example ships for local development: set `DATABASE_URL` to empty, so the containers build the connection string from the `POSTGRES_*` parts and reach the `db` service, and set `STORAGE_DRIVER=local` unless you configure S3 (see below). Everything else has a sensible default.

### Start

```sh
docker compose up -d --build
```

The app container runs migrations and seeds the root account on every start; both are idempotent. A failing migration aborts the start.

### Put a proxy in front

Point your reverse proxy at `app:3000` and forward `X-Forwarded-Proto` and `X-Forwarded-Host`. Leave `ORIGIN` unset so Trackr derives its public URL from those headers.

### Sign in

Open your domain and sign in with the root account. Your internal organization already exists and the root account is a member; invite the team from **Admin → Directory → Users**.

:::

> [!NOTE]
> **Minimum secret**
>
> Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`.

> [!WARNING]
> **Compose forwards an explicit list of variables**
>
> The compose file has no `env_file`. Each service only receives the variables named in its `environment` block, and everything else in `.env` is ignored. As shipped, the `S3_*`, `WEBHOOKS_ENABLED`, `WEBHOOK_ALLOW_PRIVATE_URLS`, `WEBHOOK_TIMEOUT`, `WEBHOOK_MAX_BODY`, `WORKER_ID`, `SCHEDULER_ID` and `DIGEST_TZ` variables are not forwarded. To use them, add them to the relevant service's `environment` block in `docker-compose.yaml`, or add an `env_file: .env` entry to each service.

## Email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM`. If `SMTP_HOST` is empty, the worker logs emails instead of sending them, which is useful for a first run. Once `SMTP_HOST` is set, `EMAIL_FROM` becomes mandatory and the worker refuses to start without it. `SMTP_SECURE` defaults to `true` on port 465 and `false` otherwise.

## Storage

```ini title=".env"
STORAGE_DRIVER=local          # or s3
# S3-compatible (remember to forward these in docker-compose.yaml)
S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com
S3_REGION=eu-central-1        # default us-east-1
S3_BUCKET=trackr-attachments  # required when STORAGE_DRIVER=s3
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_FORCE_PATH_STYLE=true      # defaults to true whenever S3_ENDPOINT is set
BODY_SIZE_LIMIT=100M
```

With the local driver, compose mounts the `uploads` volume at `/app/data/attachments` inside the `app` container; the path is fixed in the compose file.

## Updating

```bash
git pull
docker compose up -d --build
```

Migrations run automatically on start. The Go services never migrate; the web app owns the schema.

## Scaling notes

- `worker` and `scheduler` can run with any number of replicas; the queue uses row locks, so a job is never claimed by two workers at once. Delivery is at-least-once: a job whose worker dies is re-queued by the reaper, so handlers are idempotent.
- The web app's live-update stream, permission cache and collaboration server are single-process. Run one `app` replica.
