import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Readiness probe: the replica should only receive traffic while it can
// reach its database. The platform's rollout waits on this, so a version
// that cannot talk to Postgres never goes live.
export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`select 1`);
		return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return new Response('database unreachable', {
			status: 503,
			headers: { 'Cache-Control': 'no-store' }
		});
	}
};
