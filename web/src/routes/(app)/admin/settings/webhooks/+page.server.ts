import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { assertCan } from '$lib/server/permissions';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
import { createSubscription, listSubscriptions } from '$lib/server/webhooks';
import { loadFilterOptions, parseSubscriptionForm } from '$lib/server/webhooks/admin';

export const load: PageServerLoad = async ({ locals }) => {
	await assertCan(locals, 'admin.settings.manage');
	const [subscriptions, options] = await Promise.all([listSubscriptions(), loadFilterOptions()]);
	return { subscriptions, options };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		await assertCan(locals, 'admin.settings.manage');
		if (!locals.user) return fail(401, { message: m.settings_err_not_authenticated() });
		const parsed = await parseSubscriptionForm(await request.formData());
		if (!parsed.ok) return fail(400, { message: parsed.message });
		const { subscription, secret } = await createSubscription(parsed.input, locals.user.id);
		void recordAudit({
			type: 'webhook.create',
			actorId: locals.user.id,
			targetType: 'webhook',
			targetId: subscription.id,
			targetLabel: subscription.name,
			meta: { url: subscription.url, eventTypes: subscription.eventTypes }
		});
		return { success: true, id: subscription.id, secret };
	}
};
