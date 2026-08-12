import type { ApiClient } from "./client";

// Read-only detail views reachable via search (wiki / notes / projects).

export function getWikiPage(
  client: ApiClient,
  id: string,
): Promise<{
  page: { id: string; title: string; icon: string; bodyHtml: string; updatedAt: string };
}> {
  return client.get(`/api/v1/wiki/${id}`);
}

export function getNote(
  client: ApiClient,
  id: string,
): Promise<{
  note: {
    id: string;
    kind: string;
    title: string;
    bodyHtml: string;
    meetingDate: string | null;
    updatedAt: string;
  };
}> {
  return client.get(`/api/v1/notes/${id}`);
}

export function createNote(
  client: ApiClient,
  input: { title: string; body?: string },
): Promise<{ id: string }> {
  return client.post("/api/v1/notes", input);
}

export function getProject(
  client: ApiClient,
  id: string,
): Promise<{
  project: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    color: string;
    icon: string;
    status: string;
    orgName: string | null;
    taskCount: number;
    updatedAt: string;
  };
}> {
  return client.get(`/api/v1/projects/${id}`);
}
