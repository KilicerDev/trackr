import type { ApiClient } from "./client";
import type { SearchResult } from "./types";

export function search(
  client: ApiClient,
  query: string,
): Promise<{ results: SearchResult[] }> {
  return client.get(`/api/v1/search?q=${encodeURIComponent(query)}`);
}
