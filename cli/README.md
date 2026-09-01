# trackr CLI

A command-line client for trackr with two modes:

1. **Quick commands** — scriptable one-shot commands, e.g. `trackr task create -m "Fix login\n\nUsers get logged out..."`
2. **Full-screen TUI** — running bare `trackr` opens a keyboard-driven terminal UI in the spirit of lazygit/btop: bordered panes, list + detail layout, single-key actions, a help bar at the bottom.

## Tech stack

| Concern | Choice |
| --- | --- |
| Language | Go (joins the existing `services/go.work` workspace) |
| Command tree | [cobra](https://github.com/spf13/cobra) — root command opens the TUI when invoked bare on a TTY |
| TUI framework | Bubble Tea v2 (`charm.land/bubbletea/v2` — note the v2 modules live under the `charm.land` import path) |
| Styling / layout | Lip Gloss v2 (`charm.land/lipgloss/v2`) |
| TUI components | Bubbles v2 (`charm.land/bubbles/v2`: viewport, textarea, textinput, spinner, help, key) plus a custom grouped list |
| Interactive forms | huh v2 (`charm.land/huh/v2`) — the TUI's create/edit modals |
| Markdown rendering | glamour v2 (`charm.land/glamour/v2`) — descriptions, comments, and chat bubbles |
| Auth token storage | [zalando/go-keyring](https://github.com/zalando/go-keyring) (OS keychain, no plaintext tokens on disk) |
| Releases | [goreleaser](https://goreleaser.com) — cross-platform binaries + Homebrew tap |

## Architecture

```
cli/
├── main.go
├── cmd/            # cobra commands (thin: parse flags → call client → print)
│   ├── root.go     # bare `trackr` launches the TUI
│   ├── task.go
│   ├── ticket.go
│   └── ...
├── internal/
│   ├── api/        # HTTP client for /api/v1 — the ONLY place that talks to the server
│   ├── auth/       # login flow, keyring storage, session refresh
│   ├── config/     # ~/.config/trackr/config.toml (server URL, defaults)
│   ├── output/     # human/table/JSON printers for quick commands
│   ├── core/       # operations layer — the single implementation both consumers call
│   └── tui/        # Bubble Tea app
│       ├── app.go        # root model: focus, page stack, modal slot, layout
│       ├── ui/           # shared Service interface, messages, render helpers
│       ├── theme/        # trackr palette, status/priority glyph maps, glamour style
│       ├── components/   # pane chrome, list view, status bar, modals, pickers, composer
│       └── views/        # tasks, tickets, inbox, task/ticket pages, search, forms
└── README.md
```

Ground rules:

- **One API layer.** Quick commands and the TUI both go through `internal/api`. Nothing else imports `net/http`.
- **Quick commands are scriptable.** Every read command supports `--json`; exit codes are meaningful; prompts only appear on a TTY.
- **The TUI is a client, not a cache.** Server state is fetched on view entry and refreshed on action; no local database.

## Command surface (v1)

```
trackr                          # full-screen TUI
trackr login [--server URL]     # authenticate, store token in keychain
trackr task list [--project P] [--json]
trackr task create -m "Title\n\nBody" [--project P] [--assignee U]
trackr task view <id>
trackr task done <id>
trackr ticket list / view / update
trackr project list
trackr inbox [--unread]
trackr search <query>
```

## TUI

- **Layout:** left sidebar (views + projects), main list pane, persistent detail side pane that follows the cursor; `enter` opens a full-page view (task detail / ticket conversation). Panes hide gracefully on narrow terminals (sidebar <100 cols, detail <110 cols; hard floor 80×20).
- **Global keys:** `1/2/3` focus panes · `tab` cycle · `[`/`]` switch view · `ctrl+p` search palette · `r` refresh · `?` help · `esc` back · `q` quit. Vim movement everywhere (`j/k/g/G/ctrl+d/ctrl+u`), `/` filters lists.
- **Tasks:** grouped by status like the web board; `c` create (huh modal), `d` done, `s`/`p` status/priority pickers, `x` delete, `m` mine/all scope (staff).
- **Tickets:** sorted by last activity; staff default to the `all` segment, `w` cycles mine→watched→all. Conversation page renders a chat timeline (own messages right-aligned, internal notes yellow, system events as rule lines); composer sends with `ctrl+s`, `ctrl+t` toggles internal note (staff).
- **Inbox:** unread markers, `enter` marks read + jumps to the entity, `M` read-all, `u` unread-only, `L` loads older pages.
- **Refresh model:** manual only — data loads on view entry, `r`, and after every action. Live updates land later together with the web UI.
- **Status bar:** identity + server, transient action flashes, contextual key hints.
- **Theme:** dark, matching the web app's tokens (accent `#ff4867`, per-status/priority colors, web label strings); truecolor with automatic downsampling. Mouse wheel scrolls lists and pages.

## Auth

`trackr login` opens the server's login page in the browser with
`?client=cli&port=<loopback port>&state=<nonce>`; the login action redirects
the fresh bearer token to `http://127.0.0.1:<port>/callback` where the CLI is
listening (state is compared in constant time; the server only ever accepts a
port, never a redirect URL). The token goes into the OS keychain (service
`trackr-cli`, keyed by server URL), with a 0600-file fallback for headless
machines. Every response may rotate the token via the `set-auth-token`
header; the HTTP transport persists rotations automatically.

Fallbacks: `--no-browser` prints the URL instead of opening it;
`--token` accepts a pasted bearer token (SSH sessions).

## Milestones

- [x] **M0 — Skeleton:** module in `go.work`, cobra root, config loading, `trackr version`
- [x] **M1 — Auth + client:** `trackr login` (browser + loopback callback), keyring storage, rotating-token transport, `whoami`/`logout`
- [x] **M2 — Quick commands:** task/ticket/project/inbox/search, display-ref resolution (`PRJ-12`), `--json` raw pass-through, exit codes (0 ok · 1 error · 2 usage · 3 auth · 4 not found)
- [x] **M3 — TUI shell:** app model, pane layout, focus management, theme, help bar
- [x] **M4 — TUI views:** tasks list + detail page, ticket list + conversation page, inbox
- [x] **M5 — TUI polish:** create/edit forms (huh modals), search palette, composer, mouse wheel, test suite (unit + teatest)
- [ ] **M6 — Release:** goreleaser + Homebrew tap, cross-platform QA

## Open questions

- Whether to add an OpenAPI spec for `/api/v1` and generate the client (`oapi-codegen`) instead of hand-writing it
- Real-time updates in the TUI (poll vs. the existing `/api/v1/events` stream)
- A server page that displays a copyable token, so `login --token` has a source on SSH-only machines
- Assignees are user ids for now; name/email resolution needs a user-lookup endpoint
