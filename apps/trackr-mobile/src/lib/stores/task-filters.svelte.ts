/* Task list filters — module-level so they survive navigating into a task
   detail and back, persisted to localStorage so they survive app restarts.
   Empty array = no filter on that dimension. */

const KEY = "trackr:taskFilters";

type Filters = {
  projects: string[];
  statuses: string[];
  priorities: string[];
  assignees: string[];
};

const EMPTY: Filters = { projects: [], statuses: [], priorities: [], assignees: [] };

function load(): Filters {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Filters>;
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    return {
      projects: arr(raw.projects),
      statuses: arr(raw.statuses),
      priorities: arr(raw.priorities),
      assignees: arr(raw.assignees),
    };
  } catch {
    return { ...EMPTY };
  }
}

export const taskFilters = $state<Filters>(load());

export function persistTaskFilters(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify($state.snapshot(taskFilters)));
  } catch {
    // storage full/unavailable — filters still hold for the session
  }
}
