import { redirect, type ServerLoad } from '@sveltejs/kit';
import { loadTasks } from '$lib/server/tasks';
import { accessibleProjectIds } from '$lib/server/permissions';
import { getPreferences } from '$lib/server/preferences';

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

export const load: ServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/sign-in');

	const access = accessibleProjectIds(locals);
	const [tasks, preferences] = await Promise.all([
		loadTasks({
			plannerUserId: locals.user.id,
			projectIds: access.all ? undefined : [...access.ids]
		}),
		getPreferences(locals.user.id)
	]);

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

	return {
		tasks,
		todayIso,
		weekStartIso: isoDate(weekStart),
		weekDates: dates,
		savedView
	};
};
