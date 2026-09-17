// `checklist_toggle` — the one-item convenience over the whole-array replace
// semantics of `update_ticket` / `update_task`: read, flip, write back through
// the same W2 helpers so side effects stay identical.

import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import { can } from '$lib/server/permissions';
import { applyTicketUpdate } from '$lib/server/tickets'; // W2
import { applyTaskUpdate } from '$lib/server/tasks'; // W2
import {
	checklistMd,
	checklistSummary,
	taskDetailDto,
	ticketDetailDto,
	type ChecklistItemLike
} from '../format';
import { fail, guarded, text, WRITE_IDEMPOTENT, type McpContext } from './shared';
import { loadTicketDetail, loadVisibleTicket } from './tickets';
import { loadTaskDetail } from './tasks';

function pickItem(
	items: readonly ChecklistItemLike[],
	itemId: string | undefined,
	itemText: string | undefined
): ChecklistItemLike {
	if (itemId) {
		const hit = items.find((i) => i.id === itemId);
		if (!hit) fail(404, `No checklist item with id ${itemId}. Items:\n${checklistMd(items)}`);
		return hit;
	}
	const needle = (itemText ?? '').trim().toLowerCase();
	if (!needle) fail(400, 'Pass `itemId` or `itemText`.');
	const exact = items.filter((i) => i.text.trim().toLowerCase() === needle);
	const hits = exact.length ? exact : items.filter((i) => i.text.toLowerCase().includes(needle));
	if (hits.length === 0)
		fail(404, `No checklist item matches "${itemText}". Items:\n${checklistMd(items)}`);
	if (hits.length > 1) {
		fail(400, `"${itemText}" matches ${hits.length} items — pass itemId:\n${checklistMd(hits)}`);
	}
	return hits[0];
}

export function registerChecklistTools(server: McpServer, ctx: McpContext): void {
	server.registerTool(
		'checklist_toggle',
		{
			title: 'Toggle checklist item',
			description:
				'Set one checklist item done/undone on a ticket or task without resending the whole list. Identify the item by `itemId` (from `get_ticket` / `get_task`) or by `itemText` (exact, else unique substring). Same permissions as `update_ticket` / `update_task`. Returns the updated checklist.',
			inputSchema: z.object({
				target: z.enum(['ticket', 'task']).describe('Where the checklist lives.'),
				key: z.string().describe('Display id (e.g. `TRACK-108` or `WEB-12`).'),
				itemId: z.string().optional().describe('Checklist item id.'),
				itemText: z
					.string()
					.optional()
					.describe('Item text (exact or unique substring) when no id is known.'),
				done: z.boolean().default(true).describe('New state (default true = done).')
			}),
			annotations: WRITE_IDEMPOTENT
		},
		guarded(async ({ target, key, itemId, itemText, done }) => {
			if (target === 'ticket') {
				const ticket = await loadVisibleTicket(ctx, key);
				if (!(await can(ctx.locals, 'org.tickets.edit.any', { orgId: ticket.orgId }))) {
					fail(403, `You cannot edit ${ticket.displayId}.`);
				}
				const item = pickItem(ticket.checklist, itemId, itemText);
				const next = ticket.checklist.map((i) => (i.id === item.id ? { ...i, done } : i));
				const changed = item.done !== done;
				if (changed) {
					await applyTicketUpdate(
						ctx.locals,
						ticket.id,
						{ checklist: next },
						{ origin: ctx.origin, via: 'mcp' }
					);
				}
				const fresh = await loadTicketDetail(ctx, ticket.displayId);
				return text(
					`${changed ? 'Updated' : 'Unchanged'} **${ticket.displayId}** checklist (${checklistSummary(next)}):\n${checklistMd(next)}`,
					{
						key: ticket.displayId,
						changed,
						item: { ...item, done },
						checklist: next,
						ticket: ticketDetailDto({ ...fresh, origin: ctx.origin })
					}
				);
			}
			const { task } = await loadTaskDetail(ctx, key);
			const items = task.checklist ?? [];
			const item = pickItem(items, itemId, itemText);
			const next = items.map((i) => (i.id === item.id ? { ...i, done } : i));
			const changed = item.done !== done;
			if (changed) {
				await applyTaskUpdate(
					ctx.locals,
					task.uuid!,
					{ checklist: next },
					{ origin: ctx.origin, via: 'mcp' }
				);
			}
			const fresh = await loadTaskDetail(ctx, task.id);
			return text(
				`${changed ? 'Updated' : 'Unchanged'} **${task.id}** checklist (${checklistSummary(next)}):\n${checklistMd(next)}`,
				{
					key: task.id,
					changed,
					item: { ...item, done },
					checklist: next,
					task: taskDetailDto(fresh.task, fresh.users, ctx.origin)
				}
			);
		})
	);
}
