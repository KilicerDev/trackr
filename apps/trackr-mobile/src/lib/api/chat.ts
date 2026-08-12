import type { ApiClient } from "./client";
import type { ChatMessage, ChatThread } from "./types";

export function listThreads(
  client: ApiClient,
  orgId: string,
): Promise<{ threads: ChatThread[] }> {
  return client.get(`/api/v1/chat/threads?orgId=${encodeURIComponent(orgId)}`);
}

export function getThread(
  client: ApiClient,
  id: string,
): Promise<{
  thread: { id: string; title: string | null; orgId: string };
  messages: ChatMessage[];
  /** Display directory for message authors (name + color, emails stripped). */
  authors: Record<string, { name: string; color: string }>;
}> {
  return client.get(`/api/v1/chat/threads/${id}`);
}

export function postThreadMessage(
  client: ApiClient,
  id: string,
  body: string,
): Promise<{ id: string }> {
  return client.post(`/api/v1/chat/threads/${id}/messages`, { body });
}

export function createThread(
  client: ApiClient,
  input: { orgId: string; title: string; body: string },
): Promise<{ threadId: string }> {
  return client.post("/api/v1/chat/threads", input);
}
