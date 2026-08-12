import { normalizeServerUrl } from "$lib/server-url";

/**
 * Trackr is self-hosted — there is no hosted default instance. The server URL
 * is a required first-run input: with nothing stored, the login screen opens
 * directly on the server field.
 */
export const DEFAULT_SERVER = "";

/** `host[:port]` for display in the server row; falls back to the raw input. */
export function displayHost(raw: string): string {
  try {
    const url = new URL(normalizeServerUrl(raw));
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return raw;
  }
}
