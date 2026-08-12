import type { ApiClient } from "./client";
import type { InboxItem } from "./types";

export function listInbox(
  client: ApiClient,
  opts: { unreadOnly?: boolean; cursor?: string | null } = {},
): Promise<{
  items: InboxItem[];
  /** Display directory for actor avatars (name + color, emails stripped). */
  actors: Record<string, { name: string; color: string }>;
  nextCursor: string | null;
}> {
  const params = new URLSearchParams();
  if (opts.unreadOnly) params.set("filter", "unread");
  if (opts.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString();
  return client.get(`/api/v1/inbox${qs ? `?${qs}` : ""}`);
}

export function badge(client: ApiClient): Promise<{ unread: number }> {
  return client.get("/api/v1/inbox/badge");
}

export function markRead(
  client: ApiClient,
  body: { all?: boolean; id?: string; entityType?: string; entityId?: string },
): Promise<unknown> {
  return client.post("/api/v1/inbox/read", body);
}
