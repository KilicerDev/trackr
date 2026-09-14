# Apps

Native / companion clients for Trackr — one directory per target.

## Client auth contract

Trackr's web app uses better-auth cookie sessions; native clients use the
**bearer** flow instead (better-auth `bearer` plugin, enabled in
`web/src/lib/server/auth.ts`):

1. Probe the instance: `GET /api/v1/instance` → `{ name: "trackr", version, api }`
   (unauthenticated — validates a user-entered self-hosted URL).
2. Sign in through the **system browser**: open `<server>/login?client=native`.
   The login action redirects to `dev.kilicer.trackr://auth?token=<signed token>`
   (see `NATIVE_AUTH_CALLBACK`), which the app receives via its deep-link scheme.
3. Send `Authorization: Bearer <token>` on every request. Adopt any
   `set-auth-token` response header immediately — sessions rotate server-side.
4. `GET /api/auth/get-session` validates a stored token (200 + `null` body =
   token is dead). `GET /api/v1/me` returns the user + capability manifest +
   unread count.

Requests should go through a non-browser HTTP stack (tauri-plugin-http): no
cookies and no `Origin` header means CORS and better-auth origin checks never
apply. The `/api/v1/**` surface is JSON-only; SvelteKit form actions are not
usable cross-client.

## Targets

- `trackr-mobile-ios/` — native SwiftUI iOS app. Open it in Xcode and set your
  own team under Signing & Capabilities; no development team is checked in.
