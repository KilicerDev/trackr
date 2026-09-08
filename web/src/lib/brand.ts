/**
 * Client-side accessors for instance branding (white-label name + logo). The
 * values come from the root layout load (`page.data.branding`); reading them
 * through `page` from `$app/state` keeps every call site reactive.
 */
import { page } from '$app/state';

export const DEFAULT_BRAND_NAME = 'Trackr';

type BrandingData = { branding?: { name?: string; logoUrl?: string | null } };

export function brandName(): string {
	return (page.data as BrandingData).branding?.name || DEFAULT_BRAND_NAME;
}

export function brandLogoUrl(): string | null {
	return (page.data as BrandingData).branding?.logoUrl ?? null;
}

/** "<brand> · <section>" — the document title convention. */
export function pageTitle(section: string): string {
	return `${brandName()} · ${section}`;
}
