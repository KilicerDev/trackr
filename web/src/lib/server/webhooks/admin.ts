/**
 * Admin-page helpers shared by the list and detail routes: filter options for
 * the form, and form parsing + validation into a SubscriptionInput.
 */

import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization, organizationMember, project } from '$lib/server/db/app.schema';
import { user } from '$lib/server/db/auth.schema';
import { m } from '$lib/paraglide/messages';
import { normalizeEventTypes, normalizeIdList, type SubscriptionInput } from './subscriptions';
import { validateWebhookUrl, type UrlPolicyError } from './url';

export type FilterOptions = {
	orgs: { id: string; name: string; key: string; isInternal: boolean }[];
	projects: { id: string; key: string; name: string; orgId: string | null }[];
	users: { id: string; name: string }[];
};

export async function loadFilterOptions(): Promise<FilterOptions> {
	const [orgs, projects, users] = await Promise.all([
		db
			.select({
				id: organization.id,
				name: organization.name,
				key: organization.key,
				isInternal: organization.isInternal
			})
			.from(organization)
			.orderBy(asc(organization.name)),
		db
			.select({ id: project.id, key: project.key, name: project.name, orgId: project.orgId })
			.from(project)
			.orderBy(asc(project.key)),
		db
			.selectDistinct({ id: user.id, name: user.name })
			.from(user)
			.innerJoin(organizationMember, eq(organizationMember.userId, user.id))
			.innerJoin(organization, eq(organization.id, organizationMember.orgId))
			.where(eq(organization.isInternal, true))
			.orderBy(asc(user.name))
	]);
	return { orgs, projects, users };
}

export type ParsedForm = { ok: true; input: SubscriptionInput } | { ok: false; message: string };

function urlErrorMessage(e: UrlPolicyError): string {
	switch (e) {
		case 'scheme':
			return m.webhooks_err_url_https();
		case 'private':
			return m.webhooks_err_url_private();
		case 'unresolvable':
			return m.webhooks_err_url_unresolvable();
		case 'credentials':
			return m.webhooks_err_url_credentials();
		default:
			return m.webhooks_err_url_invalid();
	}
}

export async function parseSubscriptionForm(form: FormData): Promise<ParsedForm> {
	const name = String(form.get('name') ?? '')
		.trim()
		.slice(0, 120);
	if (!name) return { ok: false, message: m.webhooks_err_name_required() };

	const rawUrl = String(form.get('url') ?? '').trim();
	if (!rawUrl) return { ok: false, message: m.webhooks_err_url_invalid() };
	const check = await validateWebhookUrl(rawUrl);
	if (!check.ok) return { ok: false, message: urlErrorMessage(check.error) };

	const description =
		String(form.get('description') ?? '')
			.trim()
			.slice(0, 500) || null;

	const eventTypes = normalizeEventTypes(form.getAll('events').map(String));
	if (eventTypes.length === 0) return { ok: false, message: m.webhooks_err_events_required() };

	const orgIds = normalizeIdList(form.getAll('orgs').map(String));
	const projectIds = normalizeIdList(form.getAll('projects').map(String));
	const assigneeUserId = String(form.get('assignee') ?? '').trim() || null;
	const includeInternalMessages = form.get('includeInternal') === 'on';

	return {
		ok: true,
		input: {
			name,
			url: check.url,
			description,
			eventTypes,
			orgIds,
			projectIds,
			assigneeUserId,
			includeInternalMessages
		}
	};
}
