---
title: Organizations
description: An organization is the boundary for membership, tickets and data isolation. One account can belong to many.
order: 2
updated: 2026-09-10
---

## Internal and client organizations

Exactly one organization is marked **internal**: your own team. It is created when the instance is set up, and the root account is a member of it. Members of the internal organization see everything. Every other organization is a **client**, whose members see the portal: their tickets and the organization's chat.

- Internal staff see all organizations at once; the switcher in the sidebar changes between separate Trackr **instances**, not between organizations. Members of several client organizations switch between them in the portal sidebar.
- Members, projects and tickets never leak between organizations.
- A client member who is added to one of your projects leaves the portal and gets the regular app, limited to that project.
- Clients can be **archived**. The organization disappears from lists and pickers, and its data stays.

## Managing members

Under **Admin → Directory → Organizations → (organization)** you can add existing users, change their organization role, or remove them. Under **Admin → Directory → Users** you can invite new people by email, create users directly, resend or revoke invitations, send password resets, issue API keys, and (as a superadmin) **impersonate** a user to see exactly what they see.

Every one of these actions is written to the **audit log**, with filters and a CSV export under **Admin → System → Logs**.

## Keys, slugs and ids

Each organization carries three identifiers:

| Identifier | Example | Used in                                                                     |
| ---------- | ------- | --------------------------------------------------------------------------- |
| **Key**    | `ACME`  | Ticket references (`ACME-7`) and the MCP server. Uppercase, 2–6 characters. |
| **Slug**   | `acme`  | The CLI (`trackr ticket create --org acme`).                                |
| **Id**     | `7a4d…` | The API (`orgId` in `/api/v1`).                                             |
