import type { RequestHandler } from '@sveltejs/kit';
import { assertCan } from '$lib/server/permissions';
import { queryAuditLog, type AuditRow, type AuditActor } from '$lib/server/audit/query';

const MAX_ROWS = 10_000; // safety cap so an export can't run unbounded
const COLUMNS = ['timestamp', 'type', 'kind', 'actor', 'target', 'ip', 'device'] as const;

function csvCell(v: string): string {
	return `"${v.replace(/"/g, '""')}"`;
}

// CSV export of the audit log honoring the current filters. Pages through with
// the keyset cursor up to MAX_ROWS.
export const GET: RequestHandler = async ({ locals, url }) => {
	await assertCan(locals, 'admin.logs.view');

	const kind = url.searchParams.get('kind') ?? 'all';
	const range = url.searchParams.get('range') ?? '30';
	const q = (url.searchParams.get('q') ?? '').trim();

	const rows: AuditRow[] = [];
	let actors: Record<string, AuditActor> = {};
	let before: string | null = null;
	while (rows.length < MAX_ROWS) {
		const result = await queryAuditLog({ kind, range, q, before, limit: 500 });
		rows.push(...result.events);
		actors = { ...actors, ...result.actors };
		if (!result.hasMore || !result.nextCursor) break;
		before = result.nextCursor;
	}

	const lines = [COLUMNS.join(',')];
	for (const r of rows) {
		const actor = r.actor
			? (actors[r.actor]?.name ?? r.actorLabel ?? r.actor)
			: (r.actorLabel ?? 'Anonymous');
		lines.push(
			[r.at, r.type, r.kind, actor, r.target, r.ip, r.device]
				.map((v) => csvCell(String(v ?? '')))
				.join(',')
		);
	}

	const body = lines.join('\n');
	return new Response(body, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="audit-log.csv"'
		}
	});
};
