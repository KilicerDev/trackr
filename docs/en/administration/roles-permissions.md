---
title: Roles & permissions
description: Trackr ships with built-in roles for your team and for client organizations. Permissions are checked on every request, in the web app and in the API alike.
order: 1
updated: 2026-09-10
---

## Two layers of roles

**Organization roles** are assigned per membership and differ between your internal org and client orgs:

| Organization | Roles                                        |
| ------------ | -------------------------------------------- |
| Internal     | `org.superadmin` · `org.admin` · `org.staff` |
| Client       | `org.agent` · `org.client` · `org.member`    |

**Account roles** are derived from a person's role in the internal organization and control access to administration:

| Role         | Derived from     | Can                                                                                                                                                           |
| ------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`       | Staff or clients | Use the product within their organizations.                                                                                                                   |
| `admin`      | `org.admin`      | Manage users, organizations, invitations and project templates under **Admin → Directory** and **Admin → Templates**, and read the audit log and role matrix. |
| `superadmin` | `org.superadmin` | Everything, plus **Admin → Settings** (branding, webhooks, API keys, MCP, devices) and **Admin → System** (job queue, schedules, roles).                      |

## The permission matrix

Every action maps to one of 28 permissions, grouped as `admin.*`, `org.*` and `project.*`. A slice of the default matrix:

| Permission                 | Org superadmin | Org admin | Staff | Agent | Client | Member |
| -------------------------- | -------------- | --------- | ----- | ----- | ------ | ------ |
| `project.tasks.create`     | ✓              | ✓         | ✓     | —     | —      | —      |
| `project.tasks.edit.any`   | ✓              | ✓         | —     | —     | —      | —      |
| `project.tasks.delete.any` | ✓              | ✓         | —     | —     | —      | —      |
| `org.tickets.create`       | ✓              | ✓         | —     | ✓     | ✓      | ✓      |
| `org.tickets.read.any`     | ✓              | ✓         | ✓     | ✓     | ✓      | —      |
| `org.tickets.edit.any`     | ✓              | ✓         | —     | ✓     | —      | —      |
| `project.edit`             | ✓              | ✓         | —     | —     | —      | —      |
| `org.members.manage`       | ✓              | ✓         | —     | —     | —      | —      |
| `admin.orgs.manage`        | ✓              | ✓         | —     | —     | —      | —      |
| `admin.settings.manage`    | ✓              | —         | —     | —     | —      | —      |
| `admin.system.manage`      | ✓              | —         | —     | —     | —      | —      |

Staff edit their own tasks and comment on any ticket; they do not open tickets themselves. Only `admin.roles.manage`, `admin.settings.manage` and `admin.system.manage` are reserved for superadmins. Wiki and notes are not governed by a permission key: they are open to every member of the internal organization. Admins can review the full matrix, read-only, under **Admin → System → Roles**.

> [!NOTE]
> **Same rules everywhere**
>
> The web app, the API, the CLI, the MCP server and the iOS app all go through the same permission check. If a button is missing in the UI, the corresponding endpoint returns `403`.

## Project membership

Every member of the internal organization sees every project. A project additionally has a lead and members with a project role (`project.manager`, `project.member`, `project.viewer`), which is what grants access to **external** users: a client member who is added to a project sees that project and nothing else outside their portal.

## Capabilities

For every signed-in user the API returns a **capability manifest**: which surfaces are enabled (tickets, chat, tasks, projects, wiki, notes, admin, settings), what can be created quickly (ticket, task, note), and the permission map per organization and project. The web app, CLI, MCP server and iOS app use it to show only what the user can do.
