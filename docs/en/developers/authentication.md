---
title: Authentication
description: The API uses bearer tokens issued at sign-in. The CLI and the iOS app obtain one through the browser; scripts reuse it.
order: 1
updated: 2026-09-10
---

## Bearer tokens

Every request to `/api/v1` carries a session token:

```http
GET /api/v1/me HTTP/1.1
Host: app.trackr.dev
Authorization: Bearer <token>
```

Tokens are the same session tokens the web app uses in its cookie, so the permission model is identical. A `401` means the token is gone; sign in again.

> [!NOTE]
> **API keys and OAuth**
>
> Besides session tokens there are personal API keys (`trk_…`). Admins issue them from **Admin → Directory → Users** or **Admin → Settings → API keys**; users who are allowed to can create their own under **Account → Connected apps**, where every key can also be revoked. A key is shown once and acts as its user on `/api/v1`, on attachment downloads and on the [MCP server](/docs/developers/mcp). MCP clients can also sign in with OAuth. The `trackr` CLI stores a session token in your OS keychain and refreshes it automatically.

## Token rotation

Responses may include a `set-auth-token` header with a new token. Clients must adopt it and drop the old one. The CLI and the iOS app do this transparently; if you write your own client, store the header value whenever it appears.

## Signing in from a client

The login page supports two client modes so native apps and terminals can obtain a token without handling passwords:

| Client         | Flow                                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLI**        | `trackr login` starts a loopback listener, opens `/login?client=cli&port=<port>&state=<nonce>` in your browser, and receives the token at `http://127.0.0.1:<port>/callback`. The state is compared in constant time. |
| **Native app** | The app opens `/login?client=native`; after sign-in the browser redirects to the app's URL scheme (`dev.kilicer.trackr://auth?token=…`) with the token.                                                               |

For headless environments use `trackr login --no-browser` and paste the URL (SSH sessions switch to this mode automatically), or `trackr login --token`, which reads a token you obtained elsewhere from a hidden prompt or from stdin (`pbpaste | trackr login --token`).

## Probing an instance

Before signing in, clients verify that a URL really is a Trackr server:

```bash
curl https://app.trackr.dev/api/v1/instance
# { "name": "trackr", "version": "0.0.1", "api": 1, "branding": { "name": "…", "logoUrl": "…" } }
```

Clients check `name === "trackr"`. This is the only endpoint under `/api/v1` that works without a token; it also answers `OPTIONS` for cross-origin probes.
