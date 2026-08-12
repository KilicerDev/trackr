/**
 * Normalize what a person types into the host field into a usable base URL:
 * `trackr.example.com` → `https://trackr.example.com`. Keeps any base path,
 * strips trailing slashes, requires http(s) and a hostname.
 */
export function normalizeServerUrl(raw: string): string {
  let trimmed = raw.trim();
  while (trimmed.endsWith("/")) trimmed = trimmed.slice(0, -1);
  if (!trimmed) throw new Error("Enter a server URL.");
  if (!trimmed.includes("://")) trimmed = `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("That does not look like a valid server URL.");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !url.hostname
  ) {
    throw new Error("That does not look like a valid server URL.");
  }
  return trimmed;
}
