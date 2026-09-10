# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
bun x sv@0.15.3 create --template minimal --types ts --add prettier eslint tailwindcss="plugins:typography,forms" sveltekit-adapter="adapter:node" drizzle="database:postgresql+postgresql:postgres.js+docker:yes" better-auth="demo:password" --install bun ./
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

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
