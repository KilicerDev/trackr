---
title: Support tickets
description: Tickets are inbound requests from clients or colleagues. They sit in a shared queue at the organization level until someone triages them.
order: 3
updated: 2026-09-10
---

## The queue

The Tickets page shows every ticket you can see as a **list** or a **board**. Group by status, priority, category, organization or assignee, and filter by status, priority, category, tags, assignee and organization. Board view groups by status by default; the status itself is changed from the ticket. Tickets you want to keep an eye on can be **pinned**; pinned and recent tickets sit in the sidebar.

Each ticket has:

- a **conversation** of public messages, visible to the requester,
- **internal notes** that only your team can read,
- **attachments** up to 25 MiB per file and 20 files per upload,
- a **checklist** everyone involved can tick off,
- **assignees**, a **priority**, a **category** and **tags**, set by your team.

## The client portal

Members of a client organization sign in to the same app but see only the portal: a landing page to open a new ticket, their tickets, a small dashboard with open, unassigned and closed-this-week counts, and the organization's chat with your team. They never see your projects, tasks or wiki.

> [!NOTE]
> **Roles in a client org**
>
> **Members** see and follow their own tickets. **Clients** see every ticket of their organization. **Agents** can also triage and assign them. Your own staff appear in the conversation as the team. See [Roles &amp; permissions](/docs/administration/roles-permissions).

## From ticket to task

When a ticket needs engineering work, convert it into a project task with **Create task** (or `POST /api/v1/tickets/:id/tasks`). The task keeps a link back to the ticket, checklist items carry over, attachments are shared, and the ticket shows the linked task's status, so the requester sees progress without being inside your task graph.

## Channels

Tickets arrive from the portal, from the web app, from a chat thread, from the iOS app, from the CLI, from the MCP server and from the API. Every channel produces the same object, so triage never depends on where a request came from. Each ticket records its origin as `web_form`, `chat`, `email` or `api`; the iOS app, the CLI, MCP and REST all count as `api`.
