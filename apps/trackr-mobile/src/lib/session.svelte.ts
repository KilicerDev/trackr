import { openUrl } from "@tauri-apps/plugin-opener";
import { ApiClient, ApiError, type SessionUser } from "$lib/api/client";
import type { MeResponse } from "$lib/api/types";
import { normalizeServerUrl } from "$lib/server-url";
import { getStored, setStored, removeStored } from "$lib/storage";

/**
 * Session state and the web-based sign-in flow.
 *
 * Sign-in opens the instance's own login page in the system browser (so
 * password managers autofill per-instance credentials) with `?client=native`;
 * the server redirects back to `dev.kilicer.trackr://auth?token=<token>`,
 * which lands here via the deep-link plugin. The scheme must match
 * NATIVE_AUTH_CALLBACK in web/src/lib/server/auth.ts and the deep-link config
 * in src-tauri/tauri.conf.json.
 */

const DEEP_LINK_PREFIX = "dev.kilicer.trackr://auth";
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export type SessionPhase = "loading" | "signedOut" | "signedIn";

class Session {
  phase = $state<SessionPhase>("loading");
  user = $state<SessionUser | null>(null);
  serverUrl = $state<string | null>(null);
  /** The /api/v1/me bootstrap: capabilities, orgs, unread count. */
  me = $state<MeResponse | null>(null);
  meLoaded = $state(false);
  meError = $state(false);
  /** Unread badge, kept fresh by the badge poll (see app layout). */
  unread = $state(0);

  #client: ApiClient | null = null;
  #pendingToken: {
    resolve: (token: string) => void;
    reject: (error: Error) => void;
  } | null = null;

  /** The API client for the signed-in instance; null while signed out. */
  get client(): ApiClient | null {
    return this.#client;
  }

  get capabilities() {
    return this.me?.capabilities ?? null;
  }

  /** Restore a persisted session on launch. */
  async restore(): Promise<void> {
    try {
      const [token, base] = await Promise.all([
        getStored("token"),
        getStored("serverUrl"),
      ]);
      if (base) this.serverUrl = base;
      if (!token || !base) {
        this.phase = "signedOut";
        return;
      }
      const client = this.#makeClient(base);
      let session: { user: SessionUser } | null;
      try {
        session = await client.getSession();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await removeStored("token");
        }
        // otherwise (network/server error) keep the token for the next launch
        this.phase = "signedOut";
        return;
      }
      if (!session?.user) {
        // 200 + null body: the token is dead
        await removeStored("token");
        this.phase = "signedOut";
        return;
      }
      this.#client = client;
      this.user = session.user;
      this.phase = "signedIn";
      void this.#loadMe(client);
    } catch {
      this.phase = "signedOut";
    }
  }

  /**
   * Full sign-in: validate the host, open the instance login page in the
   * system browser, and wait for the token to come back via deep link.
   */
  async signInWithWeb(rawServer: string): Promise<void> {
    const base = normalizeServerUrl(rawServer);

    const probe = this.#makeClient(base);
    const instance = await probe.instance();
    if (instance?.name !== "trackr") {
      throw new Error("That server does not look like a Trackr instance.");
    }

    // Survives process death during the browser round-trip (cold-start deep link).
    await setStored("pendingServerUrl", base);

    // Register the waiter before opening the browser so a fast callback can't race it.
    const tokenPromise = this.#waitForCallback();
    await openUrl(`${base}/login?client=native`);
    const token = await tokenPromise;

    await this.#completeSignIn(base, token);
  }

  /** Deep-link entry point; called with every URL the OS hands the app. */
  handleDeepLink(urls: string[]): void {
    const raw = urls.find((u) => u.startsWith(DEEP_LINK_PREFIX));
    if (!raw) return;
    let token: string | null;
    try {
      token = new URL(raw).searchParams.get("token");
    } catch {
      return;
    }
    if (!token) return;

    if (this.#pendingToken) {
      this.#pendingToken.resolve(token);
      this.#pendingToken = null;
      return;
    }
    // Cold start: the app was killed while the sign-in was out in the browser.
    void this.#completeColdStart(token);
  }

  async signOut(): Promise<void> {
    try {
      await this.#client?.signOut();
    } catch {
      // best effort — the local session is cleared regardless
    }
    await this.#forgetSession();
  }

  #waitForCallback(): Promise<string> {
    this.#pendingToken?.reject(new Error("Sign-in was restarted."));
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.#pendingToken?.reject === wrappedReject)
          this.#pendingToken = null;
        reject(new Error("Sign-in timed out. Please try again."));
      }, CALLBACK_TIMEOUT_MS);
      const wrappedReject = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };
      this.#pendingToken = {
        resolve: (token) => {
          clearTimeout(timeout);
          resolve(token);
        },
        reject: wrappedReject,
      };
    });
  }

  async #completeColdStart(token: string): Promise<void> {
    const base =
      (await getStored("pendingServerUrl")) ?? (await getStored("serverUrl"));
    if (!base) return;
    try {
      await this.#completeSignIn(base, token);
    } catch {
      this.phase = "signedOut";
    }
  }

  async #completeSignIn(base: string, token: string): Promise<void> {
    await setStored("token", token);
    const client = this.#makeClient(base);
    const session = await client.getSession();
    if (!session?.user) {
      await removeStored("token");
      throw new Error("The server rejected the session token.");
    }
    // Persist the host only after a validated sign-in.
    await setStored("serverUrl", base);
    await removeStored("pendingServerUrl");
    this.#client = client;
    this.serverUrl = base;
    this.user = session.user;
    this.phase = "signedIn";
    void this.#loadMe(client);
  }

  /** Retry the bootstrap fetch (app-shell "try again" button). */
  reloadMe(): void {
    if (this.#client) void this.#loadMe(this.#client);
  }

  /** Fetch capabilities + orgs + unread (unawaited — gates the app shell). */
  async #loadMe(client: ApiClient): Promise<void> {
    this.meError = false;
    try {
      const me = await client.me();
      this.me = me;
      this.unread = me?.unreadCount ?? 0;
      this.meLoaded = true;
    } catch {
      // Leave meLoaded false; the shell offers a retry.
      this.meError = true;
    }
  }

  async #forgetSession(): Promise<void> {
    await removeStored("token");
    await removeStored("pendingServerUrl");
    // keep `serverUrl` so the host field prefills next time
    this.#client = null;
    this.user = null;
    this.me = null;
    this.meLoaded = false;
    this.unread = 0;
    this.phase = "signedOut";
  }

  #makeClient(base: string): ApiClient {
    const client = new ApiClient(
      base,
      () => getStored("token"),
      (token) => setStored("token", token),
    );
    client.onUnauthorized = () => void this.#forgetSession();
    return client;
  }
}

export const session = new Session();
