import { json, type RequestHandler } from '@sveltejs/kit';
import { assertCan } from '$lib/server/permissions';
import { queryAuditLog } from '$lib/server/audit/query';

// JSON feed for the audit log's "Load more" pagination. Same filters as the
// page loader, plus a `before` keyset cursor.
export const GET: RequestHandler = async ({ locals, url }) => {
	await assertCan(locals, 'admin.logs.view');

	const result = await queryAuditLog({
		kind: url.searchParams.get('kind') ?? 'all',
		channel: url.searchParams.get('channel') ?? 'all',
		range: url.searchParams.get('range') ?? '30',
		q: (url.searchParams.get('q') ?? '').trim(),
		before: url.searchParams.get('before')
	});

	return json(result);
};
