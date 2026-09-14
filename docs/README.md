# Trackr docs

The product documentation shown on the website lives here, one markdown file
per page, one folder per locale:

```
docs/
  en/<group>/<page>.md      source of truth
  de/<group>/<page>.md      translation; a missing page falls back to English
```

The website (`trackr-website`) copies this folder from GitHub into its build
and renders it; nothing is fetched at request time. Changes go live with the
next website deploy (`bun run deploy` there pulls the current `main` first).

## Groups and order

The folder name is the sidebar group. Groups the website knows, in display
order: `getting-started`, `features`, `administration`, `developers`,
`self-hosting`, `apps`. A new group needs a label and icon on the website side
before it shows up in the navigation.

Pages inside a group are sorted by the `order` field of their frontmatter.

## Frontmatter

```yaml
---
title: Docker Compose                # sidebar, heading, browser title
description: One compose file …      # lead paragraph and meta description
order: 1                             # position inside the group
updated: 2026-09-10                  # shown as "Updated …", drives the sitemap
badge: new                           # optional: new | beta
---
```

Use the same slug and frontmatter keys in every locale; only the text is
translated.

## Writing

Plain markdown (GitHub flavoured). Links between pages are absolute site
paths without locale: `[Quickstart](/docs/getting-started/quickstart)`. Code
fences take an optional title: ` ```ini title=".env" `.

Four constructs map to styled components on the website and still read well
here on GitHub:

**Callouts** are GitHub admonitions. A bold-only first line becomes the title.
`NOTE` and `IMPORTANT` render as a note, `TIP` as a tip, `WARNING` and
`CAUTION` as a warning.

```markdown
> [!TIP]
> **New to work trackers?**
>
> Start with the [Quickstart](/docs/getting-started/quickstart).
```

**Steps** are a `:::steps` block; every `###` heading inside starts a numbered
step.

````markdown
:::steps

### Clone and configure

```sh
git clone https://github.com/KilicerDev/trackr.git
```

### Start

Run `docker compose up -d`.

:::
````

**Cards** are `:::card` blocks inside a `::::cards` grid (four colons outside,
three inside). `icon` is a lucide icon name from the website's allow-list:
`square-check`, `calendar-days`, `life-buoy`, `book-open`, `terminal`,
`smartphone`, `braces`, `server`, `users`, `webhook`, `plug`,
`message-square`.

```markdown
::::cards

:::card{title="Project tracking" href="/docs/features/tasks" icon="square-check"}
List or board views, grouped by project, status, assignee, or priority.
:::

::::
```

**Keys** use the HTML `<kbd>` element: `press <kbd>⌘K</kbd>`.

A fence line (`:::`, `::::`) must stand on its own line.

## Previewing

Clone `trackr-website` next to this repository and run `bun run dev` there;
its docs sync picks up `../trackr/docs` automatically. After editing here,
run `bun run docs:sync` in the website to refresh the copy.
