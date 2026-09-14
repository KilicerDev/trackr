# Third-party notices

trackr is licensed under the GNU AGPL v3 (see `LICENSE`). It depends on the
open-source packages below, each under its own licence. All of them are
permissive (MIT, Apache-2.0, ISC, BSD, Unlicense) and compatible with the AGPL.
The full licence text of every package ships with the package itself
(`web/node_modules/<name>/LICENSE`, the Go module cache) and, for the built
web image and the iOS app, in the respective distribution.

Transitive dependencies are listed in `web/bun.lock` and the `go.sum` files.
Notable transitive licences: MPL-2.0 (a few npm packages) and LGPL-3.0
(libvips, dynamically linked by `sharp`).

## web (npm)

| Package | Licence |
|---|---|
| `@aws-sdk/client-s3` | Apache-2.0 |
| `@better-auth/cli` | MIT |
| `@eslint/compat` | Apache-2.0 |
| `@eslint/js` | MIT |
| `@hocuspocus/extension-database` | MIT |
| `@hocuspocus/provider` | MIT |
| `@hocuspocus/server` | MIT |
| `@hocuspocus/transformer` | MIT |
| `@inlang/paraglide-js` | MIT |
| `@lucide/svelte` | ISC |
| `@modelcontextprotocol/client` | MIT |
| `@modelcontextprotocol/ext-apps` | MIT |
| `@modelcontextprotocol/server` | MIT |
| `@sveltejs/adapter-node` | MIT |
| `@sveltejs/kit` | MIT |
| `@sveltejs/vite-plugin-svelte` | MIT |
| `@tailwindcss/forms` | MIT |
| `@tailwindcss/typography` | MIT |
| `@tailwindcss/vite` | MIT |
| `@tiptap/core` | MIT |
| `@tiptap/extension-collaboration` | MIT |
| `@tiptap/extension-collaboration-caret` | MIT |
| `@tiptap/extension-image` | MIT |
| `@tiptap/extension-link` | MIT |
| `@tiptap/extension-placeholder` | MIT |
| `@tiptap/extension-task-item` | MIT |
| `@tiptap/extension-task-list` | MIT |
| `@tiptap/html` | MIT |
| `@tiptap/pm` | MIT |
| `@tiptap/starter-kit` | MIT |
| `@tiptap/suggestion` | MIT |
| `@types/bun` | MIT |
| `@types/jsdom` | MIT |
| `@types/node` | MIT |
| `@types/pdfmake` | MIT |
| `@types/turndown` | MIT |
| `@types/ws` | MIT |
| `better-auth` | MIT |
| `drizzle-kit` | MIT |
| `drizzle-orm` | Apache-2.0 |
| `eslint` | MIT |
| `eslint-config-prettier` | MIT |
| `eslint-plugin-svelte` | MIT |
| `globals` | MIT |
| `jsdom` | MIT |
| `marked` | MIT |
| `pdfmake` | MIT |
| `postgres` | Unlicense |
| `prettier` | MIT |
| `prettier-plugin-svelte` | MIT |
| `prettier-plugin-tailwindcss` | MIT |
| `prosemirror-markdown` | MIT |
| `sharp` | Apache-2.0 |
| `svelte` | MIT |
| `svelte-check` | MIT |
| `tailwindcss` | MIT |
| `thumbhash` | MIT |
| `turndown` | MIT |
| `turndown-plugin-gfm` | MIT |
| `typescript` | Apache-2.0 |
| `typescript-eslint` | MIT |
| `vite` | MIT |
| `vite-plugin-singlefile` | MIT |
| `ws` | MIT |
| `y-prosemirror` | MIT |
| `yjs` | MIT |
| `zod` | MIT |

## cli (Go)

| Module | Licence |
|---|---|
| `github.com/BurntSushi/toml` | MIT |
| `github.com/spf13/cobra` | Apache-2.0 |
| `github.com/zalando/go-keyring` | MIT |
| `golang.org/x/term` | BSD-3-Clause |

## services/worker (Go)

| Module | Licence |
|---|---|
| `github.com/jackc/pgx/v5` | MIT |
| `github.com/joho/godotenv` | MIT |
| `github.com/wneessen/go-mail` | MIT |

## services/scheduler (Go)

| Module | Licence |
|---|---|
| `github.com/jackc/pgx/v5` | MIT |
| `github.com/joho/godotenv` | MIT |

`services/shared` has no third-party dependencies of its own.

## iOS app

`apps/trackr-mobile-ios` uses only Apple frameworks; no third-party packages.
