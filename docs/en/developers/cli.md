---
title: CLI
description: The trackr CLI wraps the API for scripting and terminal-first workflows, and ships a full-screen TUI for when you want to stay in the terminal.
order: 4
updated: 2026-09-10
badge: beta
---

## Install

Prebuilt binaries and a Homebrew tap are on the way. Until then, build from source with Go 1.26 or newer:

```bash title="terminal"
git clone https://github.com/KilicerDev/trackr.git
cd trackr/cli
go build -o trackr .
mv trackr /usr/local/bin/
```

## Sign in

```bash
trackr login --server https://app.trackr.dev
```

`login` probes the server, opens your browser, and receives the token on a loopback port. The token goes to your OS keychain (macOS Keychain, Windows Credential Manager, or any Secret Service provider on Linux such as GNOME Keyring or KWallet). Without a keyring it falls back to a `0600` file under your config directory and warns you. A successful login also saves the server URL to your config file.

Options: `--no-browser` prints the URL instead of opening it (SSH sessions do this automatically); `--token` reads a token you already have from a hidden prompt or from stdin, so `pbpaste | trackr login --token` works.

## Commands

Running `trackr` on its own in a terminal opens the TUI. In a pipe it prints help.

| Command                                                                                                                                                  | Description                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `trackr whoami [--json]`                                                                                                                                 | Who you are, which server, organizations and enabled surfaces.                                              |
| `trackr task list [--scope mine\|all] [--project KEY] [--status …]`                                                                                      | List tasks. `--project` and `--status` filter on the client.                                                |
| `trackr task create --title … [--project KEY] [--priority …] [--type …] [--status …] [--due YYYY-MM-DD] [--estimate MIN] [--tag …] [--assignee USER-ID]` | Create a task. `-m "Title\n\nBody"` sets title and description at once; `--description` sets it separately. |
| `trackr task view <ref>`                                                                                                                                 | Show a task by `SCM-12` or id.                                                                              |
| `trackr task done <ref>`                                                                                                                                 | Mark a task done.                                                                                           |
| `trackr task comment <ref> -m "…"`                                                                                                                       | Comment on a task.                                                                                          |
| `trackr ticket list [--segment mine\|watched\|all] [--status …]`                                                                                         | Tickets by last activity.                                                                                   |
| `trackr ticket create --org <slug> --subject "…" -m "…"`                                                                                                 | Open a ticket. `-m "Subject\n\nBody"` works without `--subject`.                                            |
| `trackr ticket view <ref>`                                                                                                                               | Ticket with its messages.                                                                                   |
| `trackr ticket update <ref> [--status …] [--priority …] [--category …]`                                                                                  | Update ticket fields.                                                                                       |
| `trackr ticket message <ref> -m "…" [--internal]`                                                                                                        | Reply, or add a staff-only note.                                                                            |
| `trackr project list`                                                                                                                                    | Projects you can see.                                                                                       |
| `trackr inbox [--unread] [--limit N]`                                                                                                                    | Notifications.                                                                                              |
| `trackr inbox read [id…] [--all]`                                                                                                                        | Mark notifications read.                                                                                    |
| `trackr search <query>`                                                                                                                                  | Search everything.                                                                                          |
| `trackr logout`                                                                                                                                          | Revoke and forget the stored token.                                                                         |
| `trackr version`                                                                                                                                         | Print the CLI version.                                                                                      |

Every command accepts `--server <url>` and `--verbose`. Shell completions come from `trackr completion <shell>`. There are no wiki, notes or chat commands; those live in the web app, the iOS app and the MCP server. Statuses, priorities, types and categories use the same values as the [API](/docs/getting-started/core-concepts#statuses-priorities-and-types).

## Machine-readable output

Add `--json` to any listing or view command. The output is the **exact server response**, not a re-encoding, so what you see is what the API returns. Because `task list --project` and `--status` filter on the client, the JSON body is unfiltered when you combine them with `--json`.

```bash
trackr task list --scope mine --json | jq -r '.tasks[] | "\(.id)\t\(.title)"'
```

Exit codes: `0` ok · `1` API, network or argument-parsing error · `2` usage error detected by trackr itself (missing title, query too short) · `3` sign-in required · `4` not found or no access.

## Configuration

The config file lives at `$XDG_CONFIG_HOME/trackr/config.toml`, or `~/.config/trackr/config.toml`.

```toml title="config.toml"
server = "https://app.trackr.dev"
default_project = "SCM"
# "keyring" (default) or "file"
token_storage = "keyring"
```

Environment variables override the file: `TRACKR_SERVER`, `TRACKR_DEFAULT_PROJECT`, and `TRACKR_LOG=debug` for request logging. Precedence is **flag › env › config › default**; only `server` has a flag, and `token_storage` is file-only.

## The TUI

> [!TIP]
> **Keys**
>
> <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> focus panes · <kbd>tab</kbd> cycle · <kbd>[</kbd> <kbd>]</kbd> switch views · <kbd>ctrl</kbd>+<kbd>p</kbd> search palette · <kbd>/</kbd> filter · <kbd>r</kbd> refresh · <kbd>?</kbd> help · <kbd>esc</kbd> back · <kbd>q</kbd> quit. Vim motions work in lists.

The TUI shows tasks, tickets and your inbox in a sidebar, list and detail pane that follow the terminal size, with detail pages, forms and confirmations; search opens as an overlay. It hides the sidebar below 100 columns and the detail pane below 110; the floor is 80×20. Live updates are on the roadmap; press <kbd>r</kbd> to refresh.
