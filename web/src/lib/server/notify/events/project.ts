// Event fan-out for project discussions: `projectMentioned` for @-mentions in
// a project comment (the only notification a project comment produces today).
// Recipient eligibility comes from `projectMentionRecipients()`;
// preference/channel routing stays inside `notify()`.
import { notify } from '../index';
import { projectMentionRecipients } from '../recipients';
import { parseMentionIds } from '$lib/utils/mentions';
import { m } from '$lib/paraglide/messages';
import { emailDate, type NotifyActor } from './shared';

export async function notifyProjectComment(opts: {
	projectId: string;
	projectName: string;
	orgId: string | null;
	body: string;
	actor: NotifyActor;
	origin: string;
}): Promise<void> {
	const { actor } = opts;
	const mentioned = await projectMentionRecipients(opts.projectId, parseMentionIds(opts.body));
	if (mentioned.size === 0) return;
	await notify({
		kind: 'projectMentioned',
		recipients: mentioned,
		actorId: actor.id,
		orgId: opts.orgId,
		render: (locale) => ({
			title: m.notify_mentioned({ label: opts.projectName }, { locale }),
			body: opts.body
		}),
		email: (locale) => ({
			subjectLabel: m.email_ev_mentioned(undefined, { locale }),
			eyebrow: `${m.email_kind_project(undefined, { locale })} · ${m.email_ev_mentioned(undefined, { locale })}`,
			heading: opts.projectName,
			meta: [
				{ label: m.email_meta_from(undefined, { locale }), value: actor.name },
				{ label: m.email_meta_date(undefined, { locale }), value: emailDate(locale) }
			],
			quote: opts.body,
			ctaLabel: m.email_cta_project(undefined, { locale })
		}),
		url: `/projects/${opts.projectId}`,
		entity: { type: 'project', id: opts.projectId },
		baseUrl: opts.origin
	});
}
