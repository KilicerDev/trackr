---
title: Tasks & views
description: Tasks are the heart of Trackr. Group them how you think, switch between list and board, and save any filter as a view.
order: 1
updated: 2026-11-11
---

## Task properties

| Property    | Values                                                   |
| ----------- | -------------------------------------------------------- |
| `status`    | Backlog · Todo · In Progress · Paused · In Review · Done |
| `priority`  | None · Low · Medium · High · Urgent                      |
| `type`      | Task · Bug · Improvement · Feature · Chore               |
| `assignees` | One or more org members                                  |
| `estimate`  | Minutes, used by My Week capacity                        |
| `due`       | A calendar date                                          |
| `tags`      | Free-form labels                                         |

All of these are edited in the task's detail panel. The global command palette (`⌘K`) creates tasks and jumps to anything by reference; submitting a form is `⌘↵`.

## Switching views

Toggle between **List** and **Board** at the top of the Tasks page. Both read the same data. Use **Group by** to cluster by project, status, assignee or priority, and the **Time** horizon to narrow to _Next 7 days_, _Next 2 weeks_, _Next month_ or _Next 3 months_.

Filters, grouping, sub-grouping, sort and the time horizon live in the view options sheet that opens from the **Filter** button. The button carries a badge with the number of active filters and is highlighted while any is set, so you always know why a task is or isn't showing.

> [!TIP]
> **Saved views**
>
> Any combination of group, filter and sort can be saved as a view (up to 20 per page). Views are per page and per user, and they sync to the iOS app, so a filter you set up on the desktop is one tap away on your phone.

## Sub-tasks, checklists, comments and time

- A task can have **sub-tasks**, a **checklist** and **dependencies** on other tasks.
- Every task has a **comment thread** with @-mentions. Mentioned people are notified according to their preferences.
- **Time logs** record minutes against a task with a date and an optional note. Logged time shows next to the estimate so you can calibrate.
- The task's activity panel lists its creation, comments and time logs. Field changes such as status and assignee updates are recorded in the **project's history**.

## Recurring tasks

Set **Repeat** in a task's side panel to create a fresh copy of it on a schedule: daily, on chosen weekdays, monthly on a given day (the 31st falls back to the month's last day) or yearly, every _n_ days, weeks, months or years. Each copy is created in the morning (09:00 in your timezone). **Each new copy is due** sets its due date: none, the day it's created, or a number of days after (a weekly report repeating on Monday and due Friday uses 4 days). The series can end on a date.

- **What gets copied.** Setting up the repeat saves the task's title, description, checklist (unticked), assignees, priority, tags and estimate as the series' template. Notes or progress on one copy don't carry into the next. To change the template, edit a task in the series and tick **Use this task as the template** when saving.
- **The task you set it on counts as today's.** The first new copy comes on the next scheduled day after today.
- **Finishing brings the next one forward.** Moving the newest task of a series to **In review**, **Done** or **Cancelled** creates the next copy right away, dated for its own day, instead of waiting for that morning. Older copies don't. Copies still come on schedule when nobody finishes the previous one.
- **Deleting a repeating task** asks whether to delete **only this task** (the repeat keeps going) or **this and all upcoming tasks** (later open copies are deleted and the repeat stops; finished tasks stay).
- **Planned into the week.** Each copy is added to its assignees' week on the day it stands for.
- **Pause, resume, stop.** Paused series skip what they would have created. **Stop repeating** ends the series; tasks it already created stay as they are.
- **Missed runs.** If the background services were down across several occurrences, only the most recent one is created, not a backlog.
- **Who it runs as.** Copies are created in the name of the person who set up the series, with the usual notifications and webhooks. If that person loses access or the project is archived, the series pauses itself; whoever resumes it takes it over.

## Import and export

Project tasks can be exported as a commented `.jsonc` file and re-imported elsewhere, which is handy for templates and for moving work between instances. Both live in the project header: the settings (gear) menu has **Export tasks**, and **Import tasks** opens a modal that accepts the same shape. Imports upsert by task id, up to 500 tasks per file.

```bash title="terminal"
# Export all tasks of a project (from the web app: Project → Settings → Export tasks)
GET /projects/<project-id>/tasks/export

# Import the same shape (from the web app: Project → Import tasks)
POST /projects/<project-id>/tasks/import
```

## Project templates

Superadmins can define **project templates** with a starter set of tasks under **Admin → Templates**. Published templates appear in the create-project dialog; creating a project from one clones its tasks, so recurring project types (a website launch, an onboarding, a trade fair) start with their checklist filled in.
