// Event fan-out for tasks. One function = the complete notification set for
// one user action, shared by the web actions, the /api/v1 endpoints and the
// ticket→task convert so the paths cannot drift. Recipient eligibility comes
// from `taskRecipients()` / `projectMentionRecipients()`; preference/channel
// routing stays inside `notify()`. Each emit also carries structured email
// content (eyebrow / meta rows / quote / CTA) for the email channel.
import { notify } from '../index';
import { projectMentionRecipients, taskRecipients } from '../recipients';
import { parseMentionIds } from '$lib/utils/mentions';
import { m } from '$lib/paraglide/messages';
import { statusLabel } from '$lib/utils/labels';
import type { Locale } from '$lib/paraglide/runtime';
import { emailDate, type NotifyActor } from './shared';

// The slice of a task every event needs. Callers already hold the loaded task
// (from createTask()/resolveTaskByDisplayId()) — no re-querying here.
export type TaskNotifyCtx = {
	id: string;
	displayId: string;
	title: string;
	orgId: string | null;
};

function taskMeta(
	actor: NotifyActor,
	locale: Locale,
	status?: string | null
): { label: string; value: string }[] {
	const rows: { label: string; value: string }[] = [
		{ label: m.email_meta_from(undefined, { locale }), value: actor.name }
	];
	if (status) {
		rows.push({
			label: m.email_meta_status(undefined, { locale }),
			value: statusLabel(status, locale)
		});
	}
	rows.push({ label: m.email_meta_date(undefined, { locale }), value: emailDate(locale) });
	return rows;
}

// Users (newly) assigned to a task. notify() drops the actor itself, so
// self-assignment stays silent.
export async function notifyTaskAssigned(opts: {
	task: TaskNotifyCtx;
	assigneeIds: string[];
	actor: NotifyActor;
	origin: string;
}): Promise<void> {
	const { task: t, actor } = opts;
	if (opts.assigneeIds.length === 0) return;
	await notify({
		kind: 'taskAssigned',
		recipients: opts.assigneeIds,
		actorId: actor.id,
		orgId: t.orgId,
		render: (locale) => ({
			title: m.notify_task_assigned({ ref: t.displayId, title: t.title }, { locale })
		}),
		email: (locale) => ({
			subjectLabel: m.email_ev_assigned(undefined, { locale }),
			eyebrow: `${m.email_kind_task(undefined, { locale })} · ${m.email_ev_assigned(undefined, { locale })}`,
			ref: t.displayId,
			heading: t.title,
			meta: taskMeta(actor, locale),
			ctaLabel: m.email_cta_task(undefined, { locale })
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
	actor: NotifyActor;
	origin: string;
}): Promise<void> {
	const { task: t, actor } = opts;
	const recipients = taskRecipients({
		creatorId: opts.creatorId,
		assigneeIds: opts.assigneeIds
	});
	await notify({
		kind: 'taskStatusChanged',
		recipients,
		actorId: actor.id,
		orgId: t.orgId,
		render: (locale) => ({
			title: m.notify_task_status(
				{ ref: t.displayId, status: statusLabel(opts.newStatus, locale), title: t.title },
				{ locale }
			)
		}),
		email: (locale) => ({
			subjectLabel: m.email_ev_status(undefined, { locale }),
			eyebrow: `${m.email_kind_task(undefined, { locale })} · ${m.email_ev_status(undefined, { locale })}`,
			ref: t.displayId,
			heading: t.title,
			meta: taskMeta(actor, locale, opts.newStatus),
			ctaLabel: m.email_cta_task(undefined, { locale })
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
	actor: NotifyActor;
	origin: string;
}): Promise<void> {
	const { task: t, actor } = opts;
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
		actorId: actor.id,
		orgId: t.orgId,
		render: (locale) => ({
			title: m.notify_task_commented({ ref: t.displayId, title: t.title }, { locale }),
			body: opts.body
		}),
		email: (locale) => ({
			subjectLabel: m.email_ev_comment(undefined, { locale }),
			eyebrow: `${m.email_kind_task(undefined, { locale })} · ${m.email_ev_comment(undefined, { locale })}`,
			ref: t.displayId,
			heading: t.title,
			meta: taskMeta(actor, locale),
			quote: opts.body,
			ctaLabel: m.email_cta_task(undefined, { locale })
		}),
		url: taskUrl,
		entity: { type: 'task', id: t.id },
		baseUrl: opts.origin
	});

	if (mentioned.size > 0) {
		await notify({
			kind: 'taskMentioned',
			recipients: mentioned,
			actorId: actor.id,
			orgId: t.orgId,
			render: (locale) => ({
				title: m.notify_mentioned({ label: `${t.displayId} — ${t.title}` }, { locale }),
				body: opts.body
			}),
			email: (locale) => ({
				subjectLabel: m.email_ev_mentioned(undefined, { locale }),
				eyebrow: m.email_ev_mentioned(undefined, { locale }),
				ref: t.displayId,
				heading: t.title,
				meta: taskMeta(actor, locale),
				quote: opts.body,
				ctaLabel: m.email_cta_task(undefined, { locale })
			}),
			url: taskUrl,
			entity: { type: 'task', id: t.id },
			baseUrl: opts.origin
		});
	}
}
