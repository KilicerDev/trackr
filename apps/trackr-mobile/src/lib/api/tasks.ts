import type { ApiClient } from "./client";
import type { Task, TaskDetail } from "./types";

export function listMyTasks(client: ApiClient): Promise<{
  tasks: Task[];
  /** Display directory for assignees (name + color, emails stripped). */
  users: Record<string, { name: string; color: string }>;
}> {
  return client.get("/api/v1/tasks?scope=mine");
}

export function getTask(client: ApiClient, uuid: string): Promise<TaskDetail> {
  return client.get(`/api/v1/tasks/${uuid}`);
}

export function updateTask(
  client: ApiClient,
  uuid: string,
  patch: {
    status?: string;
    priority?: string;
    type?: string;
    description?: string | null;
    due?: string | null;
    checklist?: { id?: string; text: string; done: boolean }[];
    assigneeIds?: string[];
  },
): Promise<{ ok: boolean }> {
  return client.patch(`/api/v1/tasks/${uuid}`, patch);
}

export function addTaskTimeLog(
  client: ApiClient,
  uuid: string,
  input: { minutes: number; date: string; note?: string },
): Promise<{ ok: boolean }> {
  return client.post(`/api/v1/tasks/${uuid}/time`, input);
}

export function addTaskComment(
  client: ApiClient,
  uuid: string,
  body: string,
): Promise<{ id: string }> {
  return client.post(`/api/v1/tasks/${uuid}/comments`, { body });
}

export function createTask(
  client: ApiClient,
  input: { title: string; projectKey: string },
): Promise<{ id: string; displayId: string }> {
  return client.post("/api/v1/tasks", input);
}
