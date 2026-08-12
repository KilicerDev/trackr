import { fail } from '@sveltejs/kit';
import { listSchedules, setScheduleEnabled } from '$lib/server/jobs';
import { isSuperadmin } from '$lib/roles';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

function fmt(d: Date | null): string {
	if (!d) return '';
	const p = (n: number) => String(n).padStart(2, '0');
	return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const load: PageServerLoad = async () => {
	const rows = await listSchedules();
	return {
		schedules: rows.map((s) => ({
			id: s.id,
			jobType: s.jobType,
			interval: s.interval,
			nextRunAt: fmt(s.nextRunAt),
			lastRunAt: s.lastRunAt ? fmt(s.lastRunAt) : null,
			enabled: s.enabled,
			dedupeKey: s.dedupeKey
		}))
	};
};

export const actions: Actions = {
	// Pause/resume a schedule. New rows are created via the schedules table
	// (seed/SQL); this view manages the runtime on/off switch.
	toggle: async (event) => {
		// Layout loads don't run for action POSTs — re-check the caller here
		// (the hooks.server.ts admin guard covers it too; defense in depth).
		if (!isSuperadmin(event.locals.user?.role)) {
			return fail(403, { message: m.schedules_action_error() });
		}
		const fd = await event.request.formData();
		const id = fd.get('id')?.toString();
		const enabled = fd.get('enabled')?.toString() === 'true';
		if (!id) return fail(400, { message: m.schedules_action_error() });
		try {
			await setScheduleEnabled(id, enabled);
		} catch {
			return fail(500, { message: m.schedules_action_error() });
		}
		return { success: true };
	}
};
