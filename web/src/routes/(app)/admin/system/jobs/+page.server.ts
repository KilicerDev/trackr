import { fail } from '@sveltejs/kit';
import { listJobs, cancelJob, retryJob, sendEmail, EMAIL_PRIORITY } from '$lib/server/jobs';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

// Compact, locale-stable timestamp (DD.MM.YYYY HH:mm) — matches the app's
// formatDateLong date style with a time suffix for the queue view.
function fmt(d: Date | null): string {
	if (!d) return '—';
	const p = (n: number) => String(n).padStart(2, '0');
	return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const load: PageServerLoad = async () => {
	const rows = await listJobs({ limit: 50 });
	return {
		jobs: rows.map((j) => ({
			id: j.id,
			type: j.type,
			status: j.status,
			priority: j.priority,
			attempts: j.attempts,
			maxAttempts: j.maxAttempts,
			lastError: j.lastError,
			createdAt: fmt(j.enqueuedAt),
			updatedAt: fmt(j.updatedAt)
		}))
	};
};

export const actions: Actions = {
	// Smoke-test the mail worker end-to-end: enqueue a high-priority mail.send
	// job addressed to the signed-in superadmin.
	sendTest: async (event) => {
		const email = event.locals.user?.email;
		if (!email) return fail(400, { message: m.jobs_action_error() });
		try {
			await sendEmail(
				{
					to: email,
					subject: 'Trackr test email',
					text: 'This is a test email from the Trackr jobs admin. If it reached your inbox, the mail worker is running.'
				},
				{ priority: EMAIL_PRIORITY.high }
			);
		} catch {
			return fail(500, { message: m.jobs_enqueue_error() });
		}
		return { success: true };
	},

	cancel: async (event) => {
		const id = (await event.request.formData()).get('id')?.toString();
		if (!id) return fail(400, { message: m.jobs_action_error() });
		try {
			await cancelJob(id);
		} catch {
			return fail(500, { message: m.jobs_action_error() });
		}
		return { success: true };
	},

	retry: async (event) => {
		const id = (await event.request.formData()).get('id')?.toString();
		if (!id) return fail(400, { message: m.jobs_action_error() });
		try {
			await retryJob(id);
		} catch {
			return fail(500, { message: m.jobs_action_error() });
		}
		return { success: true };
	}
};
