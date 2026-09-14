---
title: MCP server
description: Connect claude.ai, Claude Code or any Model Context Protocol client to Trackr. The assistant acts as the signed-in user, with their permissions, and shows results as the app's own rows.
order: 5
updated: 2026-09-10
badge: new
---

## What it is

Every Trackr instance serves a [Model Context Protocol](https://modelcontextprotocol.io) server at `/api/mcp`. An assistant connected to it can read tickets, tasks, projects, wiki pages and notes, create and update them, toggle checklist items, log time, attach files and search, all through the same permission engine as the web app and `/api/v1`.

Three rules shape everything the server does:

- **It acts as one user.** The assistant has exactly that user's roles and permissions, nothing more. A client can never read something its user could not open in the app.
- **Writes are real writes.** Creating a task from an assistant notifies people, fires webhooks and lands in the audit log exactly as if the user had done it in the app.
- **Access is off by default.** An admin enables MCP per user in the Directory. Until then, connecting fails with a clear message.

## Enabling access

1. **Admin → Directory → Users**: switch MCP access on for the user. Disabling it later revokes every token that user's assistants hold.
2. The user opens **Account → Connected apps**. That page shows the server URL, the Claude Code command, their own connections, and a place for personal instructions and guides.
3. **Admin → Settings → MCP** holds the workspace-wide pieces: assistant instructions, guides, and the list of every OAuth connection with a revoke button.

## Connecting a client

| Client                 | How                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **claude.ai**          | Add a custom connector with the server URL. Claude opens the Trackr login page, the user confirms, and the assistant acts as them from then on.                           |
| **Claude Code**        | `claude mcp add --transport http trackr https://<your-instance>/api/mcp` and confirm the sign-in in the browser.                                                          |
| **Other MCP clients**  | Any client that speaks streamable HTTP with OAuth. Discovery metadata is served at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`. |
| **Scripts and agents** | Skip OAuth and send a personal API key as a static bearer header: `Authorization: Bearer trk_…`. The key's user still needs MCP enabled.                                  |

```bash title="terminal"
claude mcp add --transport http trackr https://app.trackr.dev/api/mcp
```

OAuth tokens are issued per authorization (access tokens last an hour, refresh tokens 30 days) and can be revoked by the user under Connected apps or by an admin under Settings → MCP. API keys are issued by an admin, or by users who are allowed to create their own under Connected apps, and are shown once; revoking one cuts both the API and MCP access it carried.

## Tools

Thirty-seven tools, named after what they do. Identifiers follow the app: tickets as `ORGKEY-n`, tasks as `PROJECTKEY-n`, projects and organizations by key, wiki pages and notes by id. All bodies are Markdown, in and out.

| Area     | Tools                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| General  | `whoami`, `list_orgs`, `list_users`, `search`, `get_inbox`, `get_attachment`, `attach_file`, `get_guide`, `show_items` |
| Tickets  | `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `delete_ticket`                                        |
| Tasks    | `list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task`, `log_time`, `checklist_toggle`                  |
| Projects | `list_projects`, `get_project`, `create_project`, `update_project`                                                     |
| Wiki     | `wiki_tree`, `wiki_get_page`, `wiki_create_folder`, `wiki_create_page`, `wiki_update_page`, `wiki_delete_page`         |
| Notes    | `list_notes`, `get_note`, `create_note`, `create_meeting_note`, `update_note`, `delete_note`                           |

Lists are compact and capped (`limit`, at most 200) and report a `total`. Checklists on `update_*` replace the whole array; use `checklist_toggle` for a single item.

> [!NOTE]
> **Not available through MCP**
>
> Posting ticket replies or task comments, chat, and share links are deliberately left to the app. The assistant will tell the user to do those there.

## The inline widget

`list_*`, `search` and `get_*` return text, so the assistant can read as much as it needs while it works something out. When it has an answer, it calls `show_items` once with the task, ticket or project keys the user should see (up to 100). Hosts that support MCP Apps, claude.ai and Claude Desktop among them, render that result as an inline widget: the same grouped rows as the app's list views, with status, type, priority, checklist progress, due date and assignees. Clicking a row opens the item in Trackr. Hosts without the extension get the plain text instead.

The detail widget works the same way for a single task or ticket after `get_*`, `create_*`, `update_*`, `checklist_toggle` and `log_time`.

## Resources and prompts

Read tools are mirrored as resources, so a client can pull an item into context without a tool call:

```text
trackr://ticket/{key}       text/markdown
trackr://task/{key}         text/markdown
trackr://wiki/{id}          text/markdown
trackr://note/{id}          text/markdown
trackr://attachment/{id}    the original bytes
trackr://guide/{slug}       text/markdown
```

Three prompts come built in: **Triage a ticket** (takes a ticket key), **Daily standup** (optional project key) and **Write a meeting note** (project key). Each assembles the right reads for the assistant.

## Instructions and guides

The server sends a fixed set of instructions on connect. They tell the assistant to record what the user said and not to expand it: no invented descriptions, checklist steps, tags or due dates, and updates that touch only the fields the user asked to change.

On top of that, three layers you control:

- **Workspace instructions** (Admin → Settings → MCP): house rules appended for every user, for example which project a client's tasks go to, or which language to write in. Keep them short; they cost context in every conversation.
- **Personal instructions** (Account → Connected apps): the same idea per user, appended after the workspace ones.
- **Guides**: longer Markdown documents the assistant reads on demand with `get_guide` before it plans work on a topic they cover. Type them in, upload a `.md` file, or import a public web page. Admins publish workspace guides; every MCP user can add up to 20 personal ones that only their assistants see, and a personal guide with the same slug as a workspace guide replaces it for that user.

Instructions apply to new conversations; clients read them when they connect.
