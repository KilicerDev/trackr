/**
 * Browser side of the instance handoff (TRACK-140). A switch link is
 * `https://b.example/#from=<origin>`; the fragment never reaches the server.
 *
 * Two entry points because the arrival page varies: signed in, the (app)
 * shell takes the value straight from the hash; signed out, the server
 * redirects to /login (the browser keeps the fragment across the redirect),
 * the root layout parks it in sessionStorage, and the shell picks it up after
 * login. Either way the hash is stripped so a reload does not replay it and
 * the address bar shows the bare instance URL.
 */
import { HANDOFF_STORAGE_KEY, parseHandoffHash } from './instances';

function stripHash() {
	try {
		history.replaceState(history.state, '', location.pathname + location.search);
	} catch {
		/* ignore */
	}
}

/** Move a `#from=` fragment into sessionStorage (root layout, every page). */
export function parkHandoff(): void {
	if (typeof window === 'undefined') return;
	const source = parseHandoffHash(location.hash);
	if (!source) return;
	try {
		sessionStorage.setItem(HANDOFF_STORAGE_KEY, source);
	} catch {
		/* private mode etc. — the handoff is a convenience, not a requirement */
	}
	stripHash();
}

/** Consume a pending handoff: the hash if still present, else the parked value. */
export function takePendingHandoff(): string | null {
	if (typeof window === 'undefined') return null;
	const fromHash = parseHandoffHash(location.hash);
	if (fromHash) {
		stripHash();
		try {
			sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
		} catch {
			/* ignore */
		}
		return fromHash;
	}
	try {
		const parked = sessionStorage.getItem(HANDOFF_STORAGE_KEY);
		if (parked) sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
		return parked;
	} catch {
		return null;
	}
}
