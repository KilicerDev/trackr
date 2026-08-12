import { load, type Store } from "@tauri-apps/plugin-store";

/**
 * Persistent auth storage (tauri-plugin-store, a JSON file in the app data
 * dir). Keys:
 *  - `serverUrl`         base URL of the instance, saved after a validated sign-in
 *  - `token`             bearer session token (rotated via `set-auth-token`)
 *  - `pendingServerUrl`  base URL of a sign-in that is out in the browser —
 *                        lets a cold-started deep link finish the flow
 */

let store: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  store ??= load("auth.json"); // auto-save is on by default (100ms debounce)
  return store;
}

export type AuthStorageKey = "serverUrl" | "token" | "pendingServerUrl";

export async function getStored(key: AuthStorageKey): Promise<string | null> {
  const value = await (await getStore()).get<string>(key);
  return value ?? null;
}

export async function setStored(
  key: AuthStorageKey,
  value: string,
): Promise<void> {
  await (await getStore()).set(key, value);
}

export async function removeStored(key: AuthStorageKey): Promise<void> {
  await (await getStore()).delete(key);
}

export async function clearStored(): Promise<void> {
  await (await getStore()).clear();
}
