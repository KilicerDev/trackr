# trackr

Work tracker for a small agency: support tickets per client organization,
project tasks, an internal wiki, quick and meeting notes. Time logs, SLA
tracking, email ingestion and notifications, outbound webhooks, an MCP server
for AI assistants, a CLI and a native iOS app sit on top of the same data.

Licensed under the GNU AGPL v3 — see [`LICENSE`](LICENSE). Third-party
licences are listed in [`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md).

## Layout

| Path | What |
|---|---|
| `web/` | SvelteKit app: UI, `/api/v1` bearer API, `/api/mcp`, collab server, migrations, seeds, tests |
| `services/worker/` | Go worker: email delivery and polling, push, webhooks, job queue |
| `services/scheduler/` | Go scheduler: SLA checks, digests, recurring jobs |
| `services/shared/` | Go code shared by the services |
| `cli/` | Go CLI (`trackr`) against `/api/v1` |
| `apps/trackr-mobile-ios/` | Native SwiftUI iOS app |
| `skali.yaml`, `docker-compose.yaml` | Deployment manifests (see below) |

## Developing

Requirements: [Bun](https://bun.sh), Go 1.25+, Docker (for Postgres) and, for
the iOS app, Xcode.

```sh
cp .env.example .env            # fill in what you need; defaults work for local dev
cd web
bun install
bun run db:start                # Postgres in Docker
bun run db:migrate
bun run db:seed --all           # demo dataset incl. the test users
bun run dev                     # http://127.0.0.1:5173
```

Sign in with the root user from `.env` (`ROOT_EMAIL` / `ROOT_PASSWORD`) or one
of the demo users seeded by `db:seed --all`. The Go services run with
`go run ./cmd/worker` and `go run ./cmd/scheduler` from their directories, or
all together via `skali dev` (see Deploying).

For the iOS app open `apps/trackr-mobile-ios` in Xcode and set your own team
under Signing & Capabilities; the project ships without a development team.

## Deploying

Production runs on [skali](https://skali.dev): `skali.yaml` at the repo root
declares the three applications (`web`, `worker`, `scheduler`), the managed
Postgres database and the S3 bucket for attachments, and how they roll out.

```sh
skali validate --env-file .env.prod   # manifest + required values
skali plan                            # what a deploy would change
skali deploy --env-file .env.prod     # build, migrate (release command), blue-green switch
skali logs web
```

Values every environment needs: `APP_DOMAIN`, `BETTER_AUTH_SECRET`,
`ROOT_EMAIL`, `ROOT_PASSWORD`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_USER`,
`SMTP_PASS`. Optional ones (`PUSH_ENABLED`, `APNS_*`, `DIGEST_TZ`, …) are
listed with their defaults in `skali.yaml`; `.env.example` documents all of
them. Database and bucket credentials are injected by the platform.

Migrations and the root-user seed run once per release before the new version
takes traffic (`deployment.releaseCommand`), so keep every migration
compatible with the release still serving. The web app runs as one replica
because the in-process collab server (Hocuspocus) holds open documents in
memory; the blue-green rollout still makes deploys zero-downtime.

The same manifest runs locally: `skali dev` brings up a local cluster with
Postgres and S3, runs `web` via vite on the host behind the cluster route and
the Go services via `go run`. It reads `./.env` for values (`APP_DOMAIN`,
`APP_SCHEME=http`, …). The release command does not run for the intercepted
web app, so seed the schema with `skali dev run migrate` and
`skali dev run seed-root` (or `seed-all` for the demo dataset).

`docker-compose.yaml` remains as the single-host fallback (Postgres in a
container, local attachment storage on a volume).

## Testing

```sh
cd web
bun run test              # everything: unit + Go + smoke, one summary board
bun run test:unit         # pure TypeScript modules (bun test, no database)
bun run test:go           # go test in cli/ and services/
bun run test:smoke        # /api/v1 + /api/mcp against a live server
bun run test:smoke:api    # just the /api/v1 suite
bun run test:smoke:mcp    # just the MCP suite
bun run test:smoke:authz  # user-management policy: root, role hierarchy, impersonation
```

Every entry point goes through `web/scripts/test/run.ts`, which prints a ✓ per
passed test and exits non-zero on any failure. Unit tests live next to the code
as `*.test.ts`; the smoke suites are in `web/tests/smoke`.

The smoke tiers need a running trackr with the demo dataset
(`bun run db:seed --all`, which also seeds their credentials). They act as the
demo user Max Muster, title every row they create with `[smoke]`, and delete it
again. Server selection: `TRACKR_TEST_URL` if set, otherwise the dev server on
`127.0.0.1:5173`, otherwise the runner starts its own `vite dev` on `:5199` for
the run (`--spawn` forces that). Missing prerequisites skip a tier with a reason
instead of failing it.
