---
title: Wiki, notes & chat
description: The wiki holds the docs that outlive any single task. Notes catch what happens in between. Chat is where the team talks about both.
order: 4
updated: 2026-09-10
badge: new
---

## Wiki

The wiki is a tree of folders and pages for your internal team: onboarding guides, runbooks, architecture notes, weekly recaps. Pages are edited **collaboratively in real time**. Several people can type in the same page and see each other's cursors.

- Use `/` for the slash menu: headings, paragraphs, bullet and numbered lists, task lists, quotes, code blocks, dividers, images and file attachments.
- Markdown shortcuts work while typing, and pasted Markdown is converted.
- Drag pages between folders, or reorder them, from the tree.

Under the hood, pages are CRDT documents (Yjs). The web app keeps an HTML read model for search and for the API, so the iOS app and MCP clients can read any page without understanding the editor format. Editing stays in the web app.

## Notes

Notes are lighter than wiki pages and come in two kinds.

- **Quick notes** are a personal scratchpad, only visible to their owner. Capture them in the web app, from the iOS app, or through the MCP server's `create_note` tool.
- **Meeting notes** follow a template and are always linked to a project or a task. Everyone who can see that project can read them.
- Any note can be saved as a template for the next one.
- A note's owner can create read or write **share links** for teammates who don't have access yet. Links only work for members of the internal team.

> [!TIP]
> **Task ↔ meeting links**
>
> A task's detail view lists the meetings it was discussed in, so the "why" behind a task is one click away.

## Chat

Chat is organized in **threads** per organization. Threads carry tags; you can subscribe to a tag to get notified about every thread that uses it, or mute a tag you don't want to hear about. A thread can be turned into a ticket when a conversation turns out to be a request. Messages support `@` mentions.

Chat events are also available as [webhooks](/docs/developers/webhooks) (they are high volume, so tick them deliberately).
