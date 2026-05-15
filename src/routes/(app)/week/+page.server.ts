import { redirect, type ServerLoad } from '@sveltejs/kit';
import { loadTasks } from '$lib/server/tasks';

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

export const load: ServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/sign-in');

	const tasks = await loadTasks({ plannerUserId: locals.user.id });

	const todayIso = isoDate(new Date());
	const weekStart = startOfWeek(new Date());
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
		weekDates: dates
	};
};
