---
title: Core concepts
description: A handful of objects make up everything in Trackr. Understanding how they nest makes the rest of the product obvious.
order: 3
updated: 2026-09-10
---

## The object model

| Object           | What it is                                                                                                          | Lives in                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Organization** | Top-level container for a team or a client. Holds members and tickets. One org is marked _internal_: your own team. | Instance                    |
| **Project**      | A body of work with its own key, color, status, lead and members. Internal projects belong to no client.            | Organization, or internal   |
| **Task**         | A single unit of work: title, status, priority, type, assignees, estimate, due date, checklist, sub-tasks.          | Project                     |
| **Ticket**       | An inbound request from a client or colleague that can be triaged into a task.                                      | Organization                |
| **Thread**       | A chat conversation scoped to an organization, with tags and subscriptions.                                         | Organization                |
| **Wiki page**    | A long-lived, collaboratively edited document in a folder tree.                                                     | Internal team               |
| **Note**         | A private quick note, or a meeting note linked to a project or task.                                                | User, or the linked project |

Because these share one data model, a ticket can become a task, a chat thread can spawn a ticket, and a meeting note links to the tasks it discusses, without exporting or copy-pasting anything.

## Internal team vs. client organizations

Trackr distinguishes between **your team** and **your clients**:

- The **internal organization** is your company. Its members see every project, every ticket, the wiki, chat and notes.
- **Client organizations** get a confined portal: their members can open and follow tickets and talk to your team in the organization's chat, and nothing else. A client member who is added to a project sees that project too.

A single account can belong to many organizations. Internal staff see all of them at once; portal users switch between them from the portal sidebar.

## Statuses, priorities and types

Tasks carry a small, fixed set of structured properties so you can group and filter without custom fields.

| Property     | Values                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `status`     | `backlog` · `todo` · `in_progress` · `paused` · `in_review` · `done`                                                          |
| `priority`   | `none` · `low` · `medium` · `high` · `urgent`                                                                                 |
| `type`       | `task` · `bug` · `improvement` · `feature` · `chore`                                                                          |
| `estimate`   | Minutes. Feeds My Week capacity.                                                                                              |
| `due`        | A calendar date.                                                                                                              |
| `plannedFor` | The day the task is scheduled on in My Week. Set per person, so the same task can sit on different days for different people. |

Tickets have their own lifecycle:

| Property   | Values                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| `status`   | `open` · `in_progress` · `waiting_on_customer` · `waiting_on_agent` · `paused` · `resolved` · `closed` |
| `priority` | `low` · `medium` · `high` · `urgent`                                                                   |
| `category` | `general` · `billing` · `technical_issue` · `feature_request`                                          |

## References

Every task and ticket has a human-readable reference built from its project key or organization key, like `SCM-12` or `ACME-7`. References work in the command palette, in the CLI, in the MCP server and in the API.
