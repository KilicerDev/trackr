# Services

Go services are the **stateful** extensions of the stateless `/web` core. Use
them for anything that doesn't fit a request/response lifecycle: long-running
work (video transcoding, exports), compute-heavy tasks, AI agents / LLM calls,
schedulers, or persistent connections (WebSockets).

`/web` stays the single source of truth — it owns the database schema, the
migrations, and the HTTP surface. The whole system runs on **Postgres + S3 +
these Go binaries**; there is no separate message broker.

The directory ships two services that form the **core background-work engine**:

- **`worker/`** — drains the Postgres `jobs` queue and runs your handlers.
- **`scheduler/`** — turns due rows in the `schedules` table into jobs.

and one shared module, **`shared/`**, holding the Postgres connection helpers and
the queue contract both services use. Replace the worker's handlers with your
own; add more services alongside them.

---

## How a service relates to `/web`

```
          ┌─────────────┐        owns schema + migrations
          │    /web      │  ──────────────────────────────────┐
          │  SvelteKit   │   INSERT INTO jobs (enqueue,         │
          └──────────────┘   transactional)                    ▼
                                                        ┌───────────────┐
          ┌──────────────┐   SELECT … FOR UPDATE        │   Postgres    │
          │   scheduler  │   SKIP LOCKED (enqueue due) ─▶│  app data +   │
          └──────────────┘                              │  jobs queue + │
          ┌──────────────┐   claim / heartbeat /        │  schedules    │
          │    worker     │  succeed / retry / reap ────▶│               │
          └──────────────┘                              └───────────────┘
```

Two rules keep this clean:

1. **`/web` owns the database.** Services never run migrations and never invent
   tables. They read/write tables `/web` defined (including `jobs` and
   `schedules`). At boot a service retries until Postgres is reachable, so
   start-up order doesn't matter.
2. **Postgres is the backbone.** The queue is a table, claimed with
   `SELECT ... FOR UPDATE SKIP LOCKED`: concurrent workers each grab a different
   row (or none), enqueue is transactional with the related business write, and
   status/retries/heartbeat are just columns. It survives restarts and deploys,
   and any number of replicas share the queue with no broker and no leader
   election. Valid until sustained thousands of jobs/sec — at that point look at
   [River](https://riverqueue.com) before reaching for Redis/Kafka.

---

## Anatomy of a service

Every service is its **own Go module** in a subdirectory, wired into the root
compose files, configured from the root `.env`. `worker/` is the canonical
layout — mirror it:

```
services/<name>/
├── Dockerfile                 multi-stage → distroless static binary
├── go.mod                     module github.com/<org>/<repo>/services/<name>
├── go.sum
├── cmd/<name>/main.go         entrypoint: load config, connect, run, shut down
└── internal/
    ├── config/                env → typed Config struct (one place, validated)
    └── <domain>/              your logic
```

`shared/` is the exception: it is a library module (no `cmd/`), holding
`pg/` (pool connect-with-retry + DSN resolution) and `jobq/` (the `jobs`-table
contract: `Job`, `Enqueue`, `Claim`, and the heartbeat/retry/reap SQL). The
worker and scheduler depend on it; the workspace (`go.work`) resolves it in dev,
and a `replace` directive in each `go.mod` lets a single-module Docker build
(`GOWORK=off`) resolve it too.

Conventions every service should follow (all demonstrated in `worker/`):

| Concern | Convention |
| --- | --- |
| **Module** | Own `go.mod`; path `github.com/<org>/<repo>/services/<name>`. Add it to `services/go.work` (`use ./<name>`). |
| **Config** | Read **all** env in `internal/config`, return a validated struct. Fail fast. In dev, `godotenv` loads the root `.env`; in prod, compose injects it. |
| **DB** | Connect to the same Postgres `/web` uses (`DATABASE_URL` / `POSTGRES_*`) via `shared/pg`. Retry the connection on boot; never migrate. |
| **Lifecycle** | `main.go` wires a `context` cancelled on SIGINT/SIGTERM, drains in-flight work with a grace period, then exits. Unfinished work is recovered by the reaper, so nothing is lost on a deploy or a crash. |
| **Container** | Multi-stage Dockerfile → `CGO_ENABLED=0` static binary in `gcr.io/distroless/static-debian12:nonroot`. No shell, no root, no healthcheck (rely on `restart: unless-stopped` + idempotent recovery). Build context is `./services` so the build can see `shared/`. |
| **Ports** | Don't publish host ports. Talk to Postgres over the Docker network; expose publicly only through the reverse proxy, and only for pattern 3 below. |
| **Compose** | Add the service to **both** `docker-compose.dev.yaml` and `docker-compose.yaml`, with `depends_on: db: condition: service_healthy` in prod. |

---

## Three integration patterns

In order of how often you'll want them:

### 1. Job queue (implemented: `worker/` + `scheduler/`)

The default pattern for anything async: `/web` inserts a job row, the worker
claims it, does the work, and records the outcome on the row. Survives restarts
and deploys, gives crash-safe recovery, scales by adding workers.

**The contract** is the `jobs` table, owned by `/web`
(`web/src/lib/server/db/jobs.schema.ts`), with the lifecycle:

```
queued → running → succeeded
                 ↘ failed → (retry, backoff) → queued
                 ↘ cancelled
```

**Web side** (`web/src/lib/server/jobs`):

```ts
import { createJob } from '$lib/server/jobs';
import { mailJob, reportJob } from '$lib/server/jobs';

// raw, or via a typed per-domain definition:
const id = await createJob('mail.send', { to, subject, text });
await mailJob.enqueue({ to, subject, text });

// or transactionally, committing with the business write:
await db.transaction(async (tx) => {
    const [row] = await tx.insert(reports).values(...).returning();
    await reportJob.enqueueTx(tx, { reportId: row.id });
});
```

Each job domain lives in `web/src/lib/server/jobs/services/<domain>.ts` (payload
type + `defineJob` definition + producer); the barrel assembles the `JobPayloads`
contract — the single source of truth for job types. Every entry needs a matching
Go handler; there is no
codegen, so change both sides in the same commit. See
[`web/docs/jobs.md`](../web/docs/jobs.md).

**Worker side** (`worker/internal`):

- `jobs/` — handlers + wiring. A handler is a constructor that captures its deps
  and returns a `jobworker.Handler`; `jobs.go` lists them in `Register` (explicit
  DI, no globals). A new job type is one file + one line in `Register`:

  ```go
  func transcode(s3 *s3.Client) jobworker.Handler {
      return func(ctx context.Context, job jobq.Job) (map[string]any, error) {
          var p transcodePayload
          if err := json.Unmarshal(job.Payload, &p); err != nil { return nil, err }
          // ... do the work using the injected deps ...
          return map[string]any{"outputKey": key}, nil
      }
  }
  // jobs.go: "video.transcode": transcode(d.S3),
  ```

- The consumer loop itself lives once in `shared/jobworker` — `main.go` just calls
  `jobworker.New(pool, cfg, jobs.Register(deps), log)` then `engine.Run(ctx)`.
- **Claiming**: each of `WORKER_CONCURRENCY` slots runs
  `UPDATE jobs SET status='running', attempt=attempt+1, ... WHERE id = (SELECT id
  FROM jobs WHERE status='queued' AND scheduled_at <= now() ORDER BY scheduled_at
  FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING ...` — atomic, contention-free.
- **Instant pickup**: a DB trigger raises `NOTIFY jobs_ready` when a job becomes
  claimable; a `LISTEN` connection wakes an idle slot at once instead of waiting a
  poll. It's an optimization on top of polling — a missed notification just costs
  one `WORKER_POLL_INTERVAL`, and the poll is what brings delayed/backed-off jobs
  due. `WORKER_NOTIFY=false` disables it (e.g. behind a transaction-mode pooler
  that drops LISTEN/NOTIFY); the trigger ships in a `/web` migration.
- **Retry & backoff**: a handler error with attempts left re-queues the job with
  `scheduled_at = now() + min(base·2^(attempt-1), cap)`; the exhausted attempt
  becomes `failed`. Panics are caught and treated as errors.
- **Heartbeat & reaper**: a running job refreshes `last_heartbeat_at`; the reaper
  re-queues jobs whose heartbeat went stale (`> WORKER_REAP_AFTER`) — this
  recovers a crashed worker's in-flight jobs.
- **Cancellation**: setting `status='cancelled'` (the admin **Stop** button) is
  observed by the next heartbeat, which cancels the handler's context; the
  guarded outcome writes leave the `cancelled` status intact.
- **Queue → deployment mapping**: `WORKER_JOB_TYPES` pins a deployment to a
  subset of job types (e.g. a GPU box only `video.transcode`); empty = all.
- **Shutdown**: SIGINT/SIGTERM stops claiming; in-flight jobs get 30s; anything
  left is recovered by the reaper.

**Scheduler** (`scheduler/internal`): each tick, in one transaction, it
`SELECT ... FROM schedules WHERE enabled AND next_run_at <= now() FOR UPDATE SKIP
LOCKED`, enqueues a job per due row (carrying the schedule's `dedupe_key` as the
overlap guard), and advances `next_run_at` by `interval` (fixed-rate: anchored to
the slot, snapping forward after long downtime). It enqueues only — it never does
real work — so there's one execution model for everything. SKIP LOCKED makes it
restart-safe and leader-safe; run one replica or several. Schedules are rows, so
add/pause/retune them at runtime with SQL — see
[`web/docs/jobs.md`](../web/docs/jobs.md#scheduling-recurring-work).

A schedule that keeps the queue table bounded (and exercises the whole pipeline
on a cadence):

```sql
INSERT INTO schedules (job_type, payload, interval, next_run_at, dedupe_key)
VALUES ('system.prune-jobs', '{"olderThanDays":30}', '24h', now(), 'prune-jobs');
```

Monitoring: `/admin/system/jobs` lists recent jobs with status, priority, attempts
and errors, shows queue-health counts, and offers **Send test email** / **Stop** /
**Retry**.

**Env** (root `.env`, defaults in `.env.example`): the worker reads
`WORKER_CONCURRENCY`, `WORKER_JOB_TIMEOUT`, `WORKER_POLL_INTERVAL`,
`WORKER_HEARTBEAT`, `WORKER_REAP_AFTER`, `WORKER_BACKOFF_BASE/_CAP`, optional
`WORKER_JOB_TYPES` / `WORKER_ID`; the scheduler reads `SCHEDULER_POLL_INTERVAL`,
`SCHEDULER_BATCH_SIZE`, optional `SCHEDULER_ID`. Both resolve the DB from
`DATABASE_URL` / `POSTGRES_*`. Keep `WORKER_JOB_TIMEOUT` and `WORKER_HEARTBEAT`
below `WORKER_REAP_AFTER` so a running job isn't reaped early.

### 2. Webhook (design notes)

For synchronous service calls where `/web` needs an answer now (e.g. trigger a
small computation, validate something against a model):

- The service exposes plain HTTP on the Docker network (compose, no published
  port). `/web` calls it server-side: `http://<service>:<port>/...`.
- Authenticate with a shared secret header (`X-Internal-Token`), value from
  the root `.env`, checked by middleware in the service. The Docker network is
  the first boundary; the token covers misconfiguration.
- Timeouts: `/web` should call with `AbortSignal.timeout(...)` and treat the
  service as optional where possible (degrade, don't 500).
- If the work outlives a sensible HTTP timeout, that's the signal to switch to
  the job queue and return a job id instead.

### 3. Direct client connection (design notes)

For WebSockets / SSE / live data (chat, notifications, presence):

- The service owns the socket endpoint and is published through the reverse
  proxy (e.g. `wss://app.example.com/ws` routed to the service container).
- **Auth**: the client authenticates with its better-auth session. Two options:
  - Forward the session cookie / bearer token on the WebSocket handshake and
    have the service validate it against `/web`:
    `GET /api/auth/get-session` with the same `Cookie` or `Authorization`
    header returns the session JSON (or null). Cache positive results briefly.
  - Or mint short-lived signed tickets in `/web` (an API endpoint the client
    calls first) and verify the signature in the service — no per-message
    round-trips.
- Persist anything durable through the shared database; treat in-memory state
  as disposable (a reconnect must be able to rebuild it).

---

## Adding a service

1. `mkdir services/<name>` with its own `go.mod`
   (`module github.com/<org>/<repo>/services/<name>`), `cmd/<name>/main.go`,
   `internal/...` — copy `worker/` as the starting point (config loading,
   graceful shutdown, connection retry, Dockerfile are all reusable). If it
   touches the queue, depend on `shared/` and add the
   `replace ... => ../shared` directive (see `worker/go.mod`).
2. Register the module in `services/go.work`: add `use ./<name>`.
3. Add it to **both** `docker-compose.dev.yaml` and `docker-compose.yaml`, build
   context `./services`, with `depends_on: db: condition: service_healthy` in
   prod.
4. Configuration comes from the root `.env` (godotenv in dev, compose in prod).
   Document any new vars in `.env.example`.
5. If it consumes the job queue: add handler constructors + a `Register` map (wire
   it to `jobworker.New`), and add the matching job definition under
   `web/src/lib/server/jobs/services/` + a line in the `JobPayloads` contract
   (same commit).

## Don't need background jobs?

The worker and scheduler are the core engine, but the web app runs without them —
enqueued jobs simply wait in the `jobs` table until a worker exists. If a project
truly needs neither, you can remove `services/worker` and/or `services/scheduler`
(drop their `use` lines from `services/go.work` and their service blocks from the
compose files), and optionally drop the `web/src/lib/server/jobs` module and
`/admin/system/jobs` from `/web` (see [`web/docs/jobs.md`](../web/docs/jobs.md)).
