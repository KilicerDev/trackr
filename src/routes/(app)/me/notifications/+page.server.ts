import { fail } from '@sveltejs/kit';
import { upsertPreferences } from '$lib/server/preferences';
import type { NotificationPrefs } from '$lib/server/db/app.schema';
import type { Actions } from './$types';

const EVENTS = [
	'taskAssigned',
	'taskMentioned',
	'taskCommented',
	'taskStatusChanged',
	'taskDueSoon',
	'ticketCreated',
	'ticketAssigned',
	'ticketMessage',
	'wikiUpdated'
] as const satisfies readonly (keyof NotificationPrefs)[];

export const actions: Actions = {
	update: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not authenticated' });
		const form = await request.formData();
		const next: NotificationPrefs = {};
		for (const k of EVENTS) {
			next[k] = {
				email: form.get(`${k}.email`) === 'on',
				inApp: form.get(`${k}.inApp`) === 'on'
			};
		}
		await upsertPreferences(locals.user.id, { notifications: next });
		return { success: true };
	}
};
