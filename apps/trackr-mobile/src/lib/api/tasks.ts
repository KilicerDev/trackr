import type { ApiClient } from "./client";
import type { Task } from "./types";

export function listMyTasks(client: ApiClient): Promise<{ tasks: Task[] }> {
  return client.get("/api/v1/tasks?scope=mine");
}

export function setTaskStatus(
  client: ApiClient,
  uuid: string,
  status: string,
): Promise<{ ok: boolean }> {
  return client.patch(`/api/v1/tasks/${uuid}`, { status });
}

export function createTask(
  client: ApiClient,
  input: { title: string; projectKey: string },
): Promise<{ id: string; displayId: string }> {
  return client.post("/api/v1/tasks", input);
}
