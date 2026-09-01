// Global search — GET ?q=<query>. Permission-scoped results grouped by type;
// see $lib/server/search.ts for scoping rules and the pg_trgm upgrade path.
//
// Optional params used by the web `!` reference picker:
//   types=ticket,task  — restrict result types (empty q then returns recents)
//   orgId=<id>         — restrict tickets to one org (customer-visible surfaces)
import { searchAll, type SearchResult } from '$lib/server/search';
import { json, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

const VALID_TYPES = new Set<SearchResult['type']>(['ticket', 'task', 'project', 'wiki', 'note']);

export const GET: RequestHandler = async ({ locals, url }) => {
	requireUser(locals);
	const q = url.searchParams.get('q') ?? '';
	const typesRaw = url.searchParams.get('types');
	const types = typesRaw
		? typesRaw
				.split(',')
				.map((t) => t.trim())
				.filter((t): t is SearchResult['type'] => VALID_TYPES.has(t as SearchResult['type']))
		: undefined;
	// A types param that names nothing valid means "nothing", not "everything".
	if (typesRaw && !types?.length) return json({ results: [] });
	const orgId = url.searchParams.get('orgId') || undefined;
	const results = await searchAll(locals, q, { types, orgId });
	return json({ results });
};
