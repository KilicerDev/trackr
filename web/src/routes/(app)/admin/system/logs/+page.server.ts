import type { ServerLoad } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { assertCan } from '$lib/server/permissions';
import { parseFilterList, queryAuditLog } from '$lib/server/audit/query';

export const load: ServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/sign-in');
	await assertCan(locals, 'admin.logs.view');

	const kind = parseFilterList(url.searchParams.get('kind'));
	const channel = parseFilterList(url.searchParams.get('channel'));
	const actor = parseFilterList(url.searchParams.get('actor'));
	const range = url.searchParams.get('range') ?? '30';
	const q = (url.searchParams.get('q') ?? '').trim();

	const result = await queryAuditLog({ kind, channel, actor, range, q });

	return { ...result, filters: { kind, channel, actor, range, q } };
};
