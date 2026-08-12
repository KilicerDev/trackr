// Global search — GET ?q=<query>. Permission-scoped results grouped by type;
// see $lib/server/search.ts for scoping rules and the pg_trgm upgrade path.
import { searchAll } from '$lib/server/search';
import { json, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	requireUser(locals);
	const q = url.searchParams.get('q') ?? '';
	const results = await searchAll(locals, q);
	return json({ results });
};
