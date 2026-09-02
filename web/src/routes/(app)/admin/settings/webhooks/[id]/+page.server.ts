import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { assertCan } from '$lib/server/permissions';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
import {
	deleteSubscription,
	emitPing,
	getDelivery,
	getSubscription,
	getSubscriptionRow,
	listDeliveries,
	redeliver,
	rotateSecret,
	setSubscriptionEnabled,
	updateSubscription
} from '$lib/server/webhooks';
import { loadFilterOptions, parseSubscriptionForm } from '$lib/server/webhooks/admin';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	await assertCan(locals, 'admin.settings.manage');
	const subscription = await getSubscription(params.id);
	if (!subscription) error(404, m.webhooks_err_not_found());

	const beforeRaw = url.searchParams.get('before');
	const before = beforeRaw ? new Date(beforeRaw) : null;
	const selectedId = url.searchParams.get('delivery');

	const [deliveries, options, selected] = await Promise.all([
		listDeliveries(params.id, { before: before && !isNaN(before.getTime()) ? before : null }),
		loadFilterOptions(),
		selectedId ? getDelivery(params.id, selectedId) : Promise.resolve(null)
	]);
	return { subscription, deliveries, options, selected };
};

async function guard(locals: App.Locals) {
	await assertCan(locals, 'admin.settings.manage');
	if (!locals.user) throw error(401, m.settings_err_not_authenticated());
	return locals.user;
}

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const me = await guard(locals);
		const parsed = await parseSubscriptionForm(await request.formData());
		if (!parsed.ok) return fail(400, { message: parsed.message });
		const updated = await updateSubscription(params.id, parsed.input);
		if (!updated) return fail(404, { message: m.webhooks_err_not_found() });
		void recordAudit({
			type: 'webhook.update',
			actorId: me.id,
			targetType: 'webhook',
			targetId: params.id,
			targetLabel: updated.name,
			meta: { url: updated.url, eventTypes: updated.eventTypes }
		});
		return { success: true, saved: true };
	},

	rotate: async ({ locals, params }) => {
		const me = await guard(locals);
		const secret = await rotateSecret(params.id);
		if (!secret) return fail(404, { message: m.webhooks_err_not_found() });
		void recordAudit({
			type: 'webhook.rotate_secret',
			actorId: me.id,
			targetType: 'webhook',
			targetId: params.id
		});
		return { success: true, secret };
	},

	enable: async ({ locals, params }) => {
		const me = await guard(locals);
		if (!(await setSubscriptionEnabled(params.id, true)))
			return fail(404, { message: m.webhooks_err_not_found() });
		void recordAudit({ type: 'webhook.enable', actorId: me.id, targetType: 'webhook', targetId: params.id });
		return { success: true };
	},

	disable: async ({ locals, params }) => {
		const me = await guard(locals);
		if (!(await setSubscriptionEnabled(params.id, false)))
			return fail(404, { message: m.webhooks_err_not_found() });
		void recordAudit({ type: 'webhook.disable', actorId: me.id, targetType: 'webhook', targetId: params.id });
		return { success: true };
	},

	delete: async ({ locals, params }) => {
		const me = await guard(locals);
		const existing = await getSubscription(params.id);
		if (!existing) return fail(404, { message: m.webhooks_err_not_found() });
		await deleteSubscription(params.id);
		void recordAudit({
			type: 'webhook.delete',
			actorId: me.id,
			targetType: 'webhook',
			targetId: params.id,
			targetLabel: existing.name,
			meta: { url: existing.url }
		});
		redirect(303, '/admin/settings/webhooks');
	},

	redeliver: async ({ request, locals, params }) => {
		await guard(locals);
		const form = await request.formData();
		const deliveryId = String(form.get('deliveryId') ?? '').trim();
		if (!deliveryId) return fail(400, { message: m.webhooks_err_not_found() });
		if (!(await redeliver(params.id, deliveryId)))
			return fail(404, { message: m.webhooks_err_not_found() });
		return { success: true, redelivered: deliveryId };
	},

	test: async ({ locals, params }) => {
		const me = await guard(locals);
		const sub = await getSubscriptionRow(params.id);
		if (!sub) return fail(404, { message: m.webhooks_err_not_found() });
		if (!sub.enabled) return fail(400, { message: m.webhooks_err_disabled_test() });
		const deliveryId = await emitPing(sub, { id: me.id, name: me.name });
		return { success: true, tested: deliveryId };
	}
};
