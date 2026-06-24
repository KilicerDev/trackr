import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The full-page create view is the portal's landing. Team users compose via the
// modal on /tickets, so send them there.
export const load: PageServerLoad = async ({ parent }) => {
	const data = await parent();
	if (!data.isPortalUser) throw redirect(302, '/tickets');
	const org =
		data.orgs.find((o) => o.id === data.activeOrgId) ?? data.orgs[0] ?? null;
	if (!org) throw redirect(302, '/tickets');
	return { org };
};
