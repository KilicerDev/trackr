# Trackr Mobile

Tauri 2 + SvelteKit (static SPA) companion app. The app is deliberately the
*reactive* slice of Trackr — read, reply, quick-capture — not the structuring
tool: no project editing, no wiki editing, no bulk actions. Those stay on the
desktop.

- **Tabs (role-driven, from the server capability manifest):**
  staff → Inbox · Tickets · Tasks · Suche; customers → Inbox · Tickets ·
  Chat · Suche. Global **+** button for quick capture (Ticket/Task/Notiz,
  one field).
- **Inbox-first:** the default tab is "was wartet auf mich"; notification →
  thread → reply is two taps.
- **Self-hosted-first login:** the user enters their server URL
  (Bitwarden-style), the app probes `GET /api/v1/instance`, then the password
  is entered in the **system browser** and the session token comes back via
  the `dev.kilicer.trackr://auth` deep link. Bearer-only from then on.
- **Wiki / Notizen / Projekte:** read-only, reachable via Suche only.
- **Badge polling:** `/api/v1/inbox/badge` every 60s foregrounded — the push
  stand-in until native FCM/APNs lands (backend groundwork exists:
  `push_token` table + `POST /api/v1/push/tokens`, `push.send` job kind
  reserved behind `PUSH_ENABLED`).

## The deep-link scheme must agree in three places

1. `src-tauri/tauri.conf.json` → `plugins.deep-link` (`dev.kilicer.trackr`)
2. `src/lib/session.svelte.ts` → `DEEP_LINK_PREFIX`
3. `web/src/lib/server/auth.ts` → `NATIVE_AUTH_CALLBACK`

## Development

```sh
bun install
bun run tauri dev          # desktop window against your dev server
```

Point the login at your machine's **LAN IP**, not `localhost` — requests
originate from the Rust side (and from the phone on mobile). Start the web
app with `bun run dev --host` in `web/`.

### iOS / Android

The native projects are not committed yet. Generate them locally:

```sh
bun run tauri ios init      # then: TAURI_DEV_HOST=<mac-ip> bun run tauri ios dev
bun run tauri android init  # then: bun run tauri android dev
```

`src-tauri/.gitignore` already excludes `gen/android/keystore.properties` and
`*.jks` — keep signing secrets out of git.

Manual deep-link test in the iOS simulator:

```sh
xcrun simctl openurl booted "dev.kilicer.trackr://auth?token=<token>"
```

Cold-start test: kill the app mid-sign-in, finish the login in the browser —
the callback must still complete the session (`pendingServerUrl` in the
store survives the round-trip).

## Conventions

- All server DTOs are hand-mirrored in `src/lib/api/types.ts`: ISO timestamps,
  literal `YYYY-MM-DD` dates, precomputed display ids.
- Every request goes through `src/lib/api/client.ts` so `set-auth-token`
  rotation keeps working.
- `src/routes/app.css` holds Trackr's dark palette under the mobile kit's
  token names — components were ported from the maja-mobile kit and keep
  their token vocabulary.
- The auth token is stored via tauri-plugin-store (plaintext JSON in the app
  data dir) — matching the reference app; keychain storage is a hardening
  follow-up.
