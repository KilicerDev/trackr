import { redirect, type ServerLoad } from '@sveltejs/kit';
import { loadTaskSummaries } from '$lib/server/tasks';
import { accessibleProjectIds } from '$lib/server/permissions';
import { getPreferences } from '$lib/server/preferences';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { taskTimeLog } from '$lib/server/db/app.schema';

// Rows shown in the unscheduled "others" tab (the page slices to the same).
const UNSCHEDULED_LIMIT = 16;

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
	const out = new Date(d);
	out.setUTCHours(0, 0, 0, 0);
	const dow = out.getUTCDay(); // 0=Sun
	const offset = (dow + 6) % 7; // days since Monday
	out.setUTCDate(out.getUTCDate() - offset);
	return out;
}

export const load: ServerLoad = async ({ locals, url, depends }) => {
	if (!locals.user) throw redirect(303, '/sign-in');
	// Task mutations call `invalidate('app:tasks')` to refresh just this list.
	depends('app:tasks');

	const preferences = locals.preferences ?? (await getPreferences(locals.user.id));
	const savedView = (preferences.viewState?.week ?? {}) as Record<string, unknown>;
	const savedWeekStart =
		typeof savedView.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(savedView.weekStart)
			? savedView.weekStart
			: null;

	// Anchor the visible week on ?week=YYYY-MM-DD when valid; otherwise on
	// the user's last-viewed week; otherwise today. We snap the anchor to
	// its Monday so any day within a week loads the same view.
	const weekParam = url.searchParams.get('week');
	const validParam = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam);
	const anchorIso = validParam ? weekParam : savedWeekStart;
	const anchor = anchorIso ? new Date(anchorIso + 'T00:00:00Z') : new Date();
	const weekStart = startOfWeek(Number.isNaN(anchor.getTime()) ? new Date() : anchor);

	const todayIso = isoDate(new Date());
	const dates: string[] = [];
	for (let i = 0; i < 7; i++) {
		const d = new Date(weekStart);
		d.setUTCDate(weekStart.getUTCDate() + i);
		dates.push(isoDate(d));
	}

	const access = accessibleProjectIds(locals);
	const scope = {
		plannerUserId: locals.user.id,
		projectIds: access.all ? undefined : [...access.ids]
	};
	// The week needs two sets, not the whole corpus: everything in my plan
	// (dated for any week, or undated), which feeds the day columns and the
	// "past" and "mine" tabs; and the newest open tasks nobody planned into my
	// week yet, for the "others" tab, capped the way the page caps that tab.
	// Plus my time per task per day this week, so a task also shows on the
	// days I worked on it.
	const [inPlan, unplanned, logRows] = await Promise.all([
		loadTaskSummaries({ ...scope, inMyPlanOnly: true }),
		loadTaskSummaries({ ...scope, unplannedOpenOnly: true, limit: UNSCHEDULED_LIMIT }),
		db
			.select({
				taskUuid: taskTimeLog.taskId,
				date: taskTimeLog.loggedAt,
				minutes: sql<number>`coalesce(sum(${taskTimeLog.minutes}), 0)::int`
			})
			.from(taskTimeLog)
			.where(
				and(
					eq(taskTimeLog.userId, locals.user.id),
					gte(taskTimeLog.loggedAt, dates[0]),
					lte(taskTimeLog.loggedAt, dates[6])
				)
			)
			.groupBy(taskTimeLog.taskId, taskTimeLog.loggedAt)
	]);
	const tasks = [...inPlan, ...unplanned];

	// Tasks I logged time on this week that neither set holds (never planned
	// by me, or not among the newest open ones). Same visibility scope.
	const loaded = new Set(tasks.map((t) => t.uuid));
	const missing = [...new Set(logRows.map((r) => r.taskUuid))].filter((id) => !loaded.has(id));
	if (missing.length > 0) tasks.push(...(await loadTaskSummaries({ ...scope, ids: missing })));
	const dayLogs = logRows.map((r) => ({
		taskUuid: r.taskUuid,
		date: String(r.date).slice(0, 10),
		minutes: Number(r.minutes)
	}));

	return {
		tasks,
		dayLogs,
		todayIso,
		weekStartIso: isoDate(weekStart),
		weekDates: dates,
		savedView
	};
};
