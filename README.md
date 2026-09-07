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

## Testing

```sh
cd web
bun run test              # everything: unit + Go + smoke, one summary board
bun run test:unit         # pure TypeScript modules (bun test, no database)
bun run test:go           # go test in cli/ and services/
bun run test:smoke        # /api/v1 + /api/mcp against a live server
bun run test:smoke:api    # just the /api/v1 suite
bun run test:smoke:mcp    # just the MCP suite
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
