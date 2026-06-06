import type { ServerLoad } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { assertCan } from '$lib/server/permissions';
import { queryAuditLog } from '$lib/server/audit-query';

export const load: ServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/sign-in');
	await assertCan(locals, 'admin.logs.view');

	const kind = url.searchParams.get('kind') ?? 'all';
	const range = url.searchParams.get('range') ?? '30';
	const q = (url.searchParams.get('q') ?? '').trim();

	const result = await queryAuditLog({ kind, range, q });

	return { ...result, filters: { kind, range, q } };
};
