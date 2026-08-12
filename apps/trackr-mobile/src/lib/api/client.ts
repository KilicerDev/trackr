import { fetch } from "@tauri-apps/plugin-http";
import type { InstanceInfo, MeResponse } from "./types";

/**
 * Bearer-only API client for a Trackr instance.
 *
 * Requests go through the Rust side (tauri-plugin-http), which sends no
 * cookies and no Origin header — so browser CORS never applies and
 * better-auth treats every call as a plain bearer request. Sessions rotate
 * server-side; whenever a response carries a `set-auth-token` header the
 * fresh token is adopted immediately.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role?: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface SendOptions {
  body?: unknown;
  /** Attach the bearer token (default true). */
  authenticated?: boolean;
  /** Suppress the onUnauthorized sign-out hook for expected 401s. */
  allowUnauthorized?: boolean;
}

export class ApiClient {
  onUnauthorized: (() => void) | null = null;

  constructor(
    private baseUrl: string,
    private getToken: () => Promise<string | null>,
    private setToken: (token: string) => Promise<void>,
  ) {}

  private async send<T>(
    method: string,
    path: string,
    opts: SendOptions = {},
  ): Promise<T | null> {
    const { body, authenticated = true, allowUnauthorized = false } = opts;

    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (authenticated) {
      const token = await this.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const fresh = res.headers.get("set-auth-token");
    if (fresh) await this.setToken(fresh);

    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401 && authenticated && !allowUnauthorized)
        this.onUnauthorized?.();
      let message = text;
      try {
        // SvelteKit endpoint errors arrive as { message }; guard.ts apiError
        // uses the same shape.
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        // not JSON — keep the raw body
      }
      throw new ApiError(
        res.status,
        message || `Request failed (${res.status})`,
      );
    }

    // get-session answers 200 with a literal `null` body for dead tokens
    return text && text !== "null" ? (JSON.parse(text) as T) : null;
  }

  // Generic verbs for the /api/v1 surface. Everything must go through
  // #send so bearer-token rotation keeps working.

  get<T>(path: string): Promise<T> {
    return this.send<T>("GET", path) as Promise<T>;
  }

  post<T = unknown>(path: string, body: unknown = {}): Promise<T> {
    return this.send<T>("POST", path, { body }) as Promise<T>;
  }

  patch<T = unknown>(path: string, body: unknown = {}): Promise<T> {
    return this.send<T>("PATCH", path, { body }) as Promise<T>;
  }

  del<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.send<T>("DELETE", path, { body }) as Promise<T>;
  }

  /** Resolve the current session; null means the token is dead. */
  getSession(): Promise<{ user: SessionUser } | null> {
    return this.send<{ user: SessionUser }>("GET", "/api/auth/get-session", {
      allowUnauthorized: true,
    });
  }

  signOut(): Promise<unknown> {
    return this.send("POST", "/api/auth/sign-out", { body: {} });
  }

  /** Host-select validation ping — public, proves the URL is a Trackr instance. */
  instance(): Promise<InstanceInfo | null> {
    return this.send<InstanceInfo>("GET", "/api/v1/instance", {
      authenticated: false,
    });
  }

  me(): Promise<MeResponse | null> {
    return this.send<MeResponse>("GET", "/api/v1/me");
  }
}
