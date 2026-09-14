---
title: Welcome to Trackr
description: Trackr is a fast, keyboard-first workspace that brings tasks, support tickets, weekly planning, chat, notes and your team wiki under a single shortcut — built for small teams running real projects across multiple organizations.
order: 1
updated: 2026-09-10
---

## Introduction

Most teams stitch together five tools that don't talk to each other: a tracker, a ticket queue, a planning calendar, a docs app, and a spreadsheet for who-can-do-what. Trackr collapses all of that into one workspace where the data stays connected and the command palette reaches everything.

This guide walks you from a fresh instance to a running project: checking your organization, inviting your team, setting up roles, and shipping your first task. If you'd rather just explore, hit `⌘K` anywhere in the app to jump to anything.

> [!TIP]
> **New to work trackers?**
>
> Start with the [Quickstart](/docs/getting-started/quickstart). You'll have a project with real tasks in under two minutes, no configuration required.

> [!NOTE]
> **Trackr is in active development**
>
> Features and endpoints documented here reflect the current build. Anything marked *beta* may still change; the [changelog](/changelog) lists every user-facing change.

## What you can build

::::cards

:::card{title="Project tracking" href="/docs/features/tasks" icon="square-check"}
List or board views, grouped by project, status, assignee, or priority. Always in sync.
:::

:::card{title="Capacity planning" href="/docs/features/my-week" icon="calendar-days"}
Plan tasks onto days, set a weekly limit, and see over-commitment before it happens.
:::

:::card{title="Support inbox" href="/docs/features/tickets" icon="life-buoy"}
A shared ticket queue with a client portal. Convert a ticket into a task in one keystroke.
:::

:::card{title="Team wiki & notes" href="/docs/features/wiki" icon="book-open"}
Long-lived docs and runbooks with real-time collaborative editing.
:::

:::card{title="CLI & TUI" href="/docs/developers/cli" icon="terminal"}
Create tasks, triage tickets and read your inbox from the terminal.
:::

:::card{title="iOS app" href="/docs/apps/ios" icon="smartphone"}
The reactive slice of Trackr on your phone: tick off, quick-add, reply, log time.
:::

::::

## How the pieces fit

Trackr is one repository with four deployable parts that evolve together:

| Part          | What it does                                                                           |
| ------------- | -------------------------------------------------------------------------------------- |
| **Web app**   | The product core. Owns the database schema, the HTTP API and the collaboration server. |
| **Worker**    | Drains the job queue: emails, webhooks, push notifications, digests, cleanup.          |
| **Scheduler** | Enqueues recurring jobs on a schedule. Never does work itself.                         |
| **Clients**   | The `trackr` CLI and the native iOS app, both talking to the same `/api/v1`.           |

The whole system runs on **Postgres, one Bun-based web app and two Go binaries**. There is no message broker and no separate real-time service: the queue is a table, and collaborative editing runs inside the web process. See [Self-hosting](/docs/self-hosting/docker) for the full picture.
