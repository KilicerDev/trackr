# worker

The worker drains the Postgres **`jobs`** queue: it claims due jobs with
`SELECT ... FOR UPDATE SKIP LOCKED`, runs the registered handler for each, and
writes the outcome back onto the job row. It is the single execution engine for
all background work and the concrete counterpart to `createJob(...)` /
`mailJob.enqueue(...)` on the web side. See [`../README.md`](../README.md) for the
protocol.

It ships with the **mail service** (`mail.send`) — the email-sending engine every
project needs — plus `prune.*` retention handlers; replace or add
handlers for your own work. It shares the queue contract (`Job`, `Enqueue`,
`Claim`, heartbeat/retry/reap SQL) with the scheduler via [`../shared`](../shared).
`/web` owns the schema — the worker never migrates.

## What it demonstrates

The conventions every service in this repo should follow:

- **Own Go module** with a `cmd/` entrypoint and `internal/` packages.
- **Config from the root `.env`** via a single validated `config.Config`.
- **Postgres-only**: connects to the same database as `/web` (no broker). The
  queue is a table.
- **Instant pickup**: a `LISTEN/NOTIFY` listener wakes the worker the moment a job
  is enqueued (no poll latency), with the poll interval kept as a fallback.
  `WORKER_NOTIFY=false` reverts to poll-only.
- **Crash-safe by construction**: a running job heartbeats; a reaper re-queues
  jobs whose worker died (stale heartbeat). Failures retry with backoff;
  attempts-exhausted jobs are marked `failed`.
- **Cooperative cancellation**: a job cancelled in the UI is observed via the
  heartbeat and its handler's context is cancelled.
- **Graceful shutdown**: SIGINT/SIGTERM stops claiming; in-flight jobs get a 30s
  grace period; anything left is recovered by the reaper.
- **Distroless static binary** — no shell, no root, tiny image.

## Layout

```
worker/
├── Dockerfile                  multi-stage → distroless static binary
├── go.mod                      github.com/KilicerDev/trackr/services/worker
├── cmd/worker/
│   └── main.go                 config → postgres → reaper + claim pool → drain;
│                               claim loop, per-job heartbeat, retry/backoff
└── internal/
    ├── config/config.go        env (WORKER_*, SMTP_*, DATABASE_URL/POSTGRES_*) → Config
    ├── mail/mail.go            SMTP sender (go-mail) + console fallback for dev
    └── jobs/
        ├── jobs.go             Deps + Register(deps) → map[type]Handler (explicit DI)
        ├── mail.go             the `mail.send` handler (the core service)
        └── prune.go            the `prune.jobs` retention handler
```

The claim loop, heartbeat, retry/backoff, reaper, cooperative cancellation and
LISTEN/NOTIFY wakeups live once in the shared engine
[`../shared/jobworker`](../shared/jobworker) — `main.go` just hands it the
registered handlers. The Postgres claim/heartbeat/retry/reap SQL lives in
[`../shared/jobq`](../shared/jobq); the connection helpers in
[`../shared/pg`](../shared/pg).

## Run it

Fastest inner loop — run it on the host (godotenv loads the root `.env`, so the
DSN resolves to `localhost:5432`):

```sh
cd services/worker && go run ./cmd/worker
```

Or in the dev compose (containerized; reaches the shared dev-postgres via
`host.docker.internal`):

```sh
docker compose -f docker-compose.dev.yaml up -d --build worker
docker compose -f docker-compose.dev.yaml logs -f worker
```

Then hit "Send test email" at `/admin/system/jobs` and watch the `mail.send` job
get claimed and delivered (with no `SMTP_HOST` set, the worker logs the email
instead of sending). The `WORKER_*` and `SMTP_*` vars (concurrency, timeouts,
heartbeat/reap, backoff, job-type filter, mail transport) are documented in
`.env.example`, [`web/docs/jobs.md`](../../web/docs/jobs.md) and
[`web/docs/email.md`](../../web/docs/email.md).

## Add a job type

A handler is a **constructor** that captures its deps and returns a
`jobworker.Handler`. One file here + one line in `Register` + the matching web-side
definition, in the **same commit** (there is no codegen):

1. Web: `web/src/lib/server/jobs/services/<domain>.ts` — payload type + `defineJob`;
   add a line to the `JobPayloads` contract in the jobs barrel.
2. `internal/jobs/<type>.go` — a constructor returning the handler.
3. `internal/jobs/jobs.go` — add the dep to `Deps` (if new) and register it.

```go
// internal/jobs/report.go
func generateReport(db *pgxpool.Pool) jobworker.Handler {
    return func(ctx context.Context, job jobq.Job) (map[string]any, error) {
        var p reportPayload
        if err := json.Unmarshal(job.Payload, &p); err != nil { return nil, err }
        // ... do the work using the injected db ...
        return map[string]any{"reportId": id}, nil
    }
}

// internal/jobs/jobs.go → Register:
//   "report.generate": generateReport(d.DB),
```

Handlers must respect `ctx` (it is cancelled on timeout and on user cancellation)
and be idempotent — a job can run more than once (a worker can crash after doing
the work but before recording success). Payloads carry **ids, not blobs** —
re-read current state from the DB inside the handler. Deps are injected explicitly
through `Deps`/`Register` (no package globals). See
[`web/docs/jobs.md`](../../web/docs/jobs.md) for the full contract.
