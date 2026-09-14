---
title: iOS app
description: A native SwiftUI app for the reactive slice of Trackr — read, tick off, quick-add, reply, log time — with Live Activities for work sessions.
order: 1
updated: 2026-09-10
---

## What it does

The iOS app is built for the moments between desks: check My Week on the train, tick off a task, reply to a ticket, log the hour you just spent, capture a quick note. It talks to the same `/api/v1` as the CLI, so everything you do on the phone is instantly visible on the desktop and vice versa.

- Tabs for **Home, Tickets, Tasks, My Week and Search**; **Projects, Notes, Meetings, Wiki, Chat and Inbox** open from Home
- Create tasks and tickets, comment, reply, start chat threads, plan tasks onto days, log time, attach photos from the camera
- Saved views synced with the web app
- **Work sessions** with a Live Activity on the lock screen and in the Dynamic Island
- Push notifications, mirroring your in-app inbox settings

> [!NOTE]
> **Deliberately partial**
>
> Structuring work stays a desktop concern: boards, bulk edits, project setup and wiki editing are not in the app. The app reads wiki pages and takes part in chat, but you'll want a keyboard for the rest.

## Connecting to your instance

On first launch the app asks for a server URL, probes `/api/v1/instance`, then opens the sign-in page in an in-app browser sheet. The token comes back through the app's URL scheme (`dev.kilicer.trackr://`) and is stored in the iOS keychain. Self-hosted instances work exactly like the hosted one.

## Availability

The app is currently distributed to the team via TestFlight while Trackr is in beta. Public availability will be announced in the [changelog](/changelog).
