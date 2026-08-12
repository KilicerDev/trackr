import { untrack } from "svelte";
import { ApiError, type ApiClient } from "./client";
import { session } from "$lib/session.svelte";

/**
 * Reactive fetch wrapper for pages (SSR is off, so all data loads client-side).
 *
 * `remote(() => args, fetcher)` re-runs the fetcher whenever the tracked args
 * change and the session is signed in, guarding against stale responses.
 * Construct it during component init (it registers an `$effect`).
 *
 * The "loaded" state is `data !== null` — endpoints whose natural result can
 * be null (e.g. "no worklog for this date") must wrap it in an object:
 * `{ worklog: Worklog | null }`.
 */

export type RemoteError = {
  kind: "network" | "api";
  status?: number;
  message: string;
};

function toRemoteError(e: unknown): RemoteError {
  if (e instanceof ApiError)
    return { kind: "api", status: e.status, message: e.message };
  return { kind: "network", message: e instanceof Error ? e.message : String(e) };
}

export class Remote<A, T> {
  data = $state<T | null>(null);
  error = $state<RemoteError | null>(null);
  loading = $state(true);

  #gen = 0;
  #lastArgs: A | null = null;
  #fetcher: (client: ApiClient, args: A) => Promise<T>;

  constructor(
    getArgs: () => A,
    fetcher: (client: ApiClient, args: A) => Promise<T>,
  ) {
    this.#fetcher = fetcher;
    $effect(() => {
      const args = getArgs(); // tracked — re-runs on change
      if (session.phase !== "signedIn" || !session.client) return;
      const client = session.client;
      untrack(() => {
        // Args changed (or first load): old data belongs to other args.
        this.data = null;
        this.error = null;
        void this.#run(client, args);
      });
    });
  }

  async #run(client: ApiClient, args: A): Promise<void> {
    const gen = ++this.#gen;
    this.#lastArgs = args;
    if (this.data === null) this.loading = true;
    try {
      const result = await this.#fetcher(client, args);
      if (gen !== this.#gen) return;
      this.data = result;
      this.error = null;
    } catch (e) {
      if (gen !== this.#gen) return;
      this.error = toRemoteError(e);
    } finally {
      if (gen === this.#gen) this.loading = false;
    }
  }

  /** Re-fetch with the current args, keeping stale data visible meanwhile. */
  async refresh(): Promise<void> {
    if (session.phase !== "signedIn" || !session.client) return;
    if (this.#lastArgs === null) return;
    await this.#run(session.client, this.#lastArgs);
  }
}

export function remote<A, T>(
  getArgs: () => A,
  fetcher: (client: ApiClient, args: A) => Promise<T>,
): Remote<A, T> {
  return new Remote(getArgs, fetcher);
}
