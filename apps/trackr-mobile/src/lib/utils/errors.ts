import { ApiError } from "$lib/api/client";
import { m } from "$lib/paraglide/messages";

/** User-facing message for a failed mutation. */
export function mutationErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message || m.error_generic();
  return m.error_offline();
}
