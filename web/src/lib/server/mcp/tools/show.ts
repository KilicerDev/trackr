// `show_items` — the only list tool that carries the list widget.
//
// The `list_*` and `search` tools are plain text: hosts fold them into a
// one-line "used tool" entry, so the model can page through as much as it
// likes while it works something out. When it has an answer, it calls this
// tool once with the display ids the user should actually see, and the host
// renders exactly those rows with the grouped list widget. Rows are the same
// summaries the list tools return, so the widget needs no extra shapes.

import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import { can, canViewTicket } from '$lib/server/permissions';
import { loadTasks, resolveTaskByDisplayId } from '$lib/server/tasks';
import { getTicket, resolveTicketByDisplayId, type TicketRow } from '$lib/server/tickets';
import { listProjectsFor } from '$lib/server/projects';
import type { Task } from '$lib/types';
import { normalizeDisplayId, normalizeKey, parseDisplayId } from '../ids';
import {
	listMd,
	projectLine,
	projectSummary,
	taskLine,
	taskSummary,
	taskUrl,
	ticketLine,
	ticketSummary,
	ticketUrl
} from '../format';
import { LIST_UI_URI, uiToolMeta } from '../ui';
import { guarded, READ_ONLY, text, userDirectory, type McpContext } from './shared';
import { projectMetaByKey } from './tasks';

const MAX_KEYS = 100;

/** Tasks the caller may read, by display id, in the order asked; unknown keys skipped. */
async function visibleTasks(ctx: McpContext, keys: readonly string[]): Promise<Task[]> {
	const byProject = new Map<string, Promise<Task[]>>();
	const out: Task[] = [];
	for (const key of keys) {
		const ref = await resolveTaskByDisplayId(key);
		if (!ref) continue;
		if (!(await can(ctx.locals, 'project.tasks.read', { projectId: ref.projectId }))) continue;
		let rows = byProject.get(ref.projectId);
		if (!rows) {
			rows = loadTasks({ projectId: ref.projectId, plannerUserId: ctx.locals.user.id });
			byProject.set(ref.projectId, rows);
		}
		const task = (await rows).find((t) => t.uuid === ref.id);
		if (task) out.push(task);
	}
	return out;
}

/** Tickets the caller may see, by display id, in the order asked; unknown keys skipped. */
async function visibleTickets(ctx: McpContext, keys: readonly string[]): Promise<TicketRow[]> {
	const out: TicketRow[] = [];
	for (const key of keys) {
		const ref = await resolveTicketByDisplayId(key);
		const ticket = ref ? await getTicket(ref.id) : null;
		if (ticket && (await canViewTicket(ctx.locals, ticket))) out.push(ticket);
	}
	return out;
}

export function registerShowTools(server: McpServer, ctx: McpContext): void {
	server.registerTool(
		'show_items',
		{
			title: 'Show items',
			description:
				'Show the user a visual list of specific tasks, tickets and/or projects — this is the only list tool the host renders as an inline widget (grouped like the app: tasks under their project, tickets under their organization). Pass task ids (`WEB-12`), ticket ids (`TRACK-108`) and/or project keys (`WEB`) in the order you want them shown, at most 100. Call it once, at the end, with exactly the items your answer is about; the `list_*` and `search` tools are for finding things and stay text-only. Keys you cannot see or that do not exist are reported in `notFound` and otherwise ignored. Rows are the compact summaries; call `get_task` / `get_ticket` for details.',
			inputSchema: z.object({
				keys: z
					.array(z.string().min(1))
					.min(1)
					.max(MAX_KEYS)
					.describe(
						'Display ids (`WEB-12`, `TRACK-108`) and/or project keys (`WEB`), case-insensitive, in display order.'
					)
			}),
			annotations: READ_ONLY,
			_meta: uiToolMeta(LIST_UI_URI)
		},
		guarded(async ({ keys }) => {
			const seen = new Set<string>();
			const displayIds: string[] = [];
			const projectKeys: string[] = [];
			for (const raw of keys) {
				const norm = normalizeDisplayId(raw);
				if (!norm || seen.has(norm)) continue;
				seen.add(norm);
				(parseDisplayId(norm) ? displayIds : projectKeys).push(norm);
			}

			// A display id could be a task (project key) or a ticket (org key);
			// project and org keys are separate namespaces, so try both.
			const [tasks, tickets, allProjects] = await Promise.all([
				visibleTasks(ctx, displayIds),
				visibleTickets(ctx, displayIds),
				projectKeys.length ? listProjectsFor(ctx.locals) : Promise.resolve([])
			]);
			const projects = projectKeys
				.map((k) => allProjects.find((p) => normalizeKey(p.key) === k))
				.filter((p): p is NonNullable<typeof p> => !!p);

			const found = new Set<string>([
				...tasks.map((t) => t.id),
				...tickets.map((t) => t.displayId),
				...projects.map((p) => normalizeKey(p.key))
			]);
			const notFound = [...seen].filter((k) => !found.has(k));

			const users = await userDirectory([
				...tasks.flatMap((t) => t.assignees ?? []),
				...tickets.flatMap((t) => [t.customerId, ...t.assignees])
			]);
			const meta = await projectMetaByKey(tasks.map((t) => t.project));

			const sections: string[] = [];
			if (tasks.length)
				sections.push(
					listMd(
						'Tasks',
						tasks.map((t) => taskLine(t, users)),
						tasks.length
					)
				);
			if (tickets.length)
				sections.push(
					listMd(
						'Tickets',
						tickets.map((t) => ticketLine(t, users)),
						tickets.length
					)
				);
			if (projects.length)
				sections.push(listMd('Projects', projects.map(projectLine), projects.length));
			if (notFound.length) sections.push(`_Not found or not visible: ${notFound.join(', ')}_`);
			if (!sections.length) sections.push('_Nothing to show._');

			const structured: Record<string, unknown> = {
				total: tasks.length + tickets.length + projects.length,
				notFound
			};
			if (tasks.length)
				structured.tasks = tasks.map((t) => {
					const m = meta.get(t.project);
					return {
						...taskSummary(t, users),
						projectName: m?.name ?? t.project,
						projectColor: m?.color ?? '#7a9cf0',
						url: taskUrl(ctx.origin, t.id)
					};
				});
			if (tickets.length)
				structured.tickets = tickets.map((t) => ({
					id: t.id,
					...ticketSummary(t, users),
					url: ticketUrl(ctx.origin, t.id)
				}));
			if (projects.length) structured.projects = projects.map((p) => projectSummary(p, ctx.origin));

			return text(sections.join('\n\n'), structured);
		})
	);
}
