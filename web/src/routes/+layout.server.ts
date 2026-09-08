import { getBranding, publicBranding } from '$lib/server/branding';
import type { LayoutServerLoad } from './$types';

// Instance branding (name + logo) for every page — signed-in shell, auth pages
// and error pages alike. Cached server-side; components read it through
// `$lib/brand` rather than touching page.data directly.
export const load: LayoutServerLoad = async () => {
	return { branding: publicBranding(await getBranding()) };
};
