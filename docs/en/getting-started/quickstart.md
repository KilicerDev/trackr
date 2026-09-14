---
title: Quickstart
description: From a fresh instance to a working project in four steps. Everything here can be done from the web app, the CLI or the API.
order: 2
updated: 2026-09-10
---

## Four steps to your first task

:::steps

### Sign in and check your organization

Sign in with the root account. Your *internal* organization already exists: it is created when the instance is set up, and the root account is a member of it. Agencies add one organization per client under **Admin → Directory → Organizations** with **New organization**.

### Invite your team

Open **Admin → Directory → Users** and invite by email. Each invitee gets an organization role. Start everyone as **Staff** and promote later. Invitations expire after seven days if they aren't accepted.

### Add your first project

Go to **Projects** and create one. Give it a name, a color and a short key like `SCM`; the key is derived from the name and can be edited. Tasks in that project are numbered `SCM-1`, `SCM-2`, and so on. Pick a project template if one has been published to start with a set of tasks.

### Ship a task

Press `⌘K` (`Ctrl+K` on Windows and Linux), choose **Create task**, type a title, pick the project, and submit with `⌘↵`. Status, priority, type, assignees, estimate and due date live in the task's detail panel. That's it. You're tracking work.

:::

## Prefer the terminal?

Create the same task from your shell. The CLI signs in through your browser and stores the token in your OS keychain.

```bash title="terminal"
trackr login --server https://app.trackr.dev
trackr task create --title "Prepare CAD models for the fair" \
  --project SCM --priority high --due 2026-09-12
```

Or call the API directly with a bearer token:

```bash title="create-task.sh"
curl -X POST https://app.trackr.dev/api/v1/tasks \
  -H "Authorization: Bearer $TRACKR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Prepare CAD models for the fair", "projectKey": "SCM", "priority": "high" }'
```

> [!NOTE]
> **Where does the token come from?**
>
> The CLI obtains a session token for you at sign-in; for scripts, run `trackr login` once and reuse the stored token. For long-lived automation there are personal API keys (`trk_…`) that act as their user. Details in the [authentication guide](/docs/developers/authentication).

## Next steps

- Learn the objects everything is built from in [Core concepts](/docs/getting-started/core-concepts).
- Plan your week against your capacity in [My Week](/docs/features/my-week).
- Give clients their own portal with [Organizations](/docs/administration/organizations).
