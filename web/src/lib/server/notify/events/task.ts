// Event fan-out for tasks. One function = the complete notification set for
// one user action, shared by the web actions, the /api/v1 endpoints and the
// ticket→task convert so the paths cannot drift. Recipient eligibility comes
// from `taskRecipients()` / `projectMentionRecipients()`; preference/channel
// routing stays inside `notify()`.
import { notify } from '../index';
import { projectMentionRecipients, taskRecipients } from '../recipients';
import { parseMentionIds } from '$lib/utils/mentions';
import { m } from '$lib/paraglide/messages';
import { statusLabel } from '$lib/utils/labels';

// The slice of a task every event needs. Callers already hold the loaded task
// (from createTask()/resolveTaskByDisplayId()) — no re-querying here.
export type TaskNotifyCtx = {
	id: string;
	displayId: string;
	title: string;
	orgId: string | null;
};

// Users (newly) assigned to a task. notify() drops the actor itself, so
// self-assignment stays silent.
export async function notifyTaskAssigned(opts: {
	task: TaskNotifyCtx;
	assigneeIds: string[];
	actorId: string;
	origin: string;
}): Promise<void> {
	const { task: t } = opts;
	if (opts.assigneeIds.length === 0) return;
	await notify({
		kind: 'taskAssigned',
		recipients: opts.assigneeIds,
		actorId: opts.actorId,
		orgId: t.orgId,
		render: (locale) => ({
			title: m.notify_task_assigned({ ref: t.displayId, title: t.title }, { locale })
		}),
		url: `/tasks?task=${t.displayId}`,
		entity: { type: 'task', id: t.id },
		baseUrl: opts.origin
	});
}

// Status change → watchers (current assignees + the creator).
export async function notifyTaskStatusChanged(opts: {
	task: TaskNotifyCtx;
	creatorId: string | null;
	assigneeIds: string[];
	newStatus: string;
	actorId: string;
	origin: string;
}): Promise<void> {
	const { task: t } = opts;
	const recipients = taskRecipients({
		creatorId: opts.creatorId,
		assigneeIds: opts.assigneeIds
	});
	await notify({
		kind: 'taskStatusChanged',
		recipients,
		actorId: opts.actorId,
		orgId: t.orgId,
		render: (locale) => ({
			title: m.notify_task_status(
				{ ref: t.displayId, status: statusLabel(opts.newStatus, locale), title: t.title },
				{ locale }
			)
		}),
		url: `/tasks?task=${t.displayId}`,
		entity: { type: 'task', id: t.id },
		baseUrl: opts.origin
	});
}

// A new comment: `taskCommented` to assignees + creator + prior commenters,
// then `taskMentioned` for @-mentions (project members only).
export async function notifyTaskComment(opts: {
	task: TaskNotifyCtx;
	projectId: string;
	creatorId: string | null;
	assigneeIds: string[];
	priorCommenterIds: string[];
	body: string;
	actorId: string;
	origin: string;
}): Promise<void> {
	const { task: t } = opts;
	const taskUrl = `/tasks?task=${t.displayId}`;
	const recipients = taskRecipients({
		creatorId: opts.creatorId,
		assigneeIds: opts.assigneeIds,
		extraIds: opts.priorCommenterIds
	});
	// Mention wins: an @-mentioned user gets only `taskMentioned` (the more
	// specific kind), never a `taskCommented` duplicate for the same comment.
	const mentioned = await projectMentionRecipients(opts.projectId, parseMentionIds(opts.body));
	for (const mid of mentioned) recipients.delete(mid);
	await notify({
		kind: 'taskCommented',
		recipients,
		actorId: opts.actorId,
		orgId: t.orgId,
		render: (locale) => ({
			title: m.notify_task_commented({ ref: t.displayId, title: t.title }, { locale }),
			body: opts.body
		}),
		url: taskUrl,
		entity: { type: 'task', id: t.id },
		baseUrl: opts.origin
	});

	if (mentioned.size > 0) {
		await notify({
			kind: 'taskMentioned',
			recipients: mentioned,
			actorId: opts.actorId,
			orgId: t.orgId,
			render: (locale) => ({
				title: m.notify_mentioned({ label: `${t.displayId} — ${t.title}` }, { locale }),
				body: opts.body
			}),
			url: taskUrl,
			entity: { type: 'task', id: t.id },
			baseUrl: opts.origin
		});
	}
}
