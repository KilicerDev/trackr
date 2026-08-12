import { m } from "$lib/paraglide/messages";

/* Task taxonomy — labels + colors mirror the web app's
   web/src/lib/config/taxonomy.ts TRACKR_STATUSES / type set. */

export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "paused",
  "in_review",
  "done",
] as const;

export function taskStatusLabel(status: string): string {
  switch (status) {
    case "backlog":
      return m.task_status_backlog();
    case "todo":
      return m.task_status_todo();
    case "in_progress":
      return m.task_status_in_progress();
    case "paused":
      return m.task_status_paused();
    case "in_review":
      return m.task_status_in_review();
    case "done":
      return m.task_status_done();
    default:
      return status;
  }
}

export function taskStatusColor(status: string): string {
  switch (status) {
    case "backlog":
      return "#7c7c84";
    case "todo":
      return "#9aa4b2";
    case "in_progress":
      return "#f0a85c";
    case "paused":
      return "#e9c46a";
    case "in_review":
      return "#b591e3";
    case "done":
      return "#7fc8a9";
    default:
      return "#9aa4b2";
  }
}

export function taskTypeLabel(type: string): string {
  switch (type) {
    case "bug":
      return m.task_type_bug();
    case "improvement":
      return m.task_type_improvement();
    case "feature":
      return m.task_type_feature();
    case "chore":
      return m.task_type_chore();
    case "task":
      return m.task_type_task();
    default:
      return type;
  }
}
