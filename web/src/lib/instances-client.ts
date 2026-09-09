/**
 * Browser calls shared by the sidebar switcher and the /me/instances page.
 * The probe runs here, in the browser, on purpose: the server never fetches
 * a user-supplied URL, and it only stores what the probe returned.
 */
import { parseInstanceProbe, type ProbeResult } from './instances';

export type InstanceEntry = { url: string; name: string; logoUrl: string | null; addedAt?: string };

const PROBE_TIMEOUT_MS = 8000;

/** Cross-origin GET against the other instance's public probe; null unless it is a trackr. */
export async function probeInstance(target: string): Promise<ProbeResult | null> {
	try {
		const res = await fetch(`${target}/api/v1/instance`, {
			mode: 'cors',
			credentials: 'omit',
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
		});
		if (!res.ok) return null;
		return parseInstanceProbe(await res.json(), target);
	} catch {
		return null;
	}
}

/** Add/refresh (POST) or remove (DELETE) an entry; resolves the full list, or null on failure. */
export async function saveInstance(
	method: 'POST' | 'DELETE',
	body: { url: string; name?: string; logoUrl?: string | null }
): Promise<InstanceEntry[] | null> {
	try {
		const res = await fetch('/api/instances', {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { instances?: InstanceEntry[] };
		return Array.isArray(data.instances) ? data.instances : null;
	} catch {
		return null;
	}
}
