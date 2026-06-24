import { invalidateAll, goto } from '$app/navigation';

/** An organization the portal user belongs to (subset of the layout `orgs`). */
export type PortalOrg = { id: string; name: string; slug: string; color: string };

/**
 * Persist the active organization for a portal user and re-scope the app to it.
 * Stored in userPreferences.viewState.portal.activeOrgId; the layout re-reads it
 * on the next load, so we invalidate and return to the new-ticket view.
 */
export async function setActiveOrg(orgId: string): Promise<void> {
	await fetch('/api/preferences/view', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ key: 'portal', patch: { activeOrgId: orgId } })
	});
	await invalidateAll();
	await goto('/tickets/new');
}
