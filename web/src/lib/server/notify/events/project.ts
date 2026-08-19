// Event fan-out for project discussions: `projectMentioned` for @-mentions in
// a project comment (the only notification a project comment produces today).
// Recipient eligibility comes from `projectMentionRecipients()`;
// preference/channel routing stays inside `notify()`.
import { notify } from '../index';
import { projectMentionRecipients } from '../recipients';
import { parseMentionIds } from '$lib/utils/mentions';
import { m } from '$lib/paraglide/messages';

export async function notifyProjectComment(opts: {
	projectId: string;
	projectName: string;
	orgId: string | null;
	body: string;
	actorId: string;
	origin: string;
}): Promise<void> {
	const mentioned = await projectMentionRecipients(opts.projectId, parseMentionIds(opts.body));
	if (mentioned.size === 0) return;
	await notify({
		kind: 'projectMentioned',
		recipients: mentioned,
		actorId: opts.actorId,
		orgId: opts.orgId,
		render: (locale) => ({
			title: m.notify_mentioned({ label: opts.projectName }, { locale }),
			body: opts.body
		}),
		url: `/projects/${opts.projectId}`,
		entity: { type: 'project', id: opts.projectId },
		baseUrl: opts.origin
	});
}
