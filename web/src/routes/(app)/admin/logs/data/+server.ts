import { json, type RequestHandler } from '@sveltejs/kit';
import { assertCan } from '$lib/server/permissions';
import { parseFilterList, queryAuditLog } from '$lib/server/audit/query';

// JSON feed for the audit log's "Load more" pagination. Same filters as the
// page loader, plus a `before` keyset cursor.
export const GET: RequestHandler = async ({ locals, url }) => {
	await assertCan(locals, 'admin.logs.view');

	const result = await queryAuditLog({
		kind: parseFilterList(url.searchParams.get('kind')),
		channel: parseFilterList(url.searchParams.get('channel')),
		actor: parseFilterList(url.searchParams.get('actor')),
		range: url.searchParams.get('range') ?? '30',
		q: (url.searchParams.get('q') ?? '').trim(),
		before: url.searchParams.get('before')
	});

	return json(result);
};
