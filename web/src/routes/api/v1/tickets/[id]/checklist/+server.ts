// Ticket checklist for the app — whole-array replace, mirroring the web
// `checklist` action. Unlike the agent-only PATCH ../, this is open to every
// ticket participant (agents, the org.client admin, the owning org.member),
// gated on view access.
//
//   PUT { checklist: [{ id?, text, done }] } → { ok: true }
import { canViewTicket } from '$lib/server/permissions';
import { getTicket, sanitizeTicketChecklist, updateTicket } from '$lib/server/tickets';
import { m } from '$lib/paraglide/messages';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	requireUser(locals);
	const ticket = await getTicket(params.id);
	if (!ticket) apiError(404, m.tickets_not_found());
	if (!(await canViewTicket(locals, ticket))) apiError(403, m.tickets_no_access());

	const body = await readJson<{ checklist?: unknown }>(request);
	const checklist = sanitizeTicketChecklist(body.checklist);
	if (!checklist) apiError(400, m.tasks_err_invalid_checklist());

	await updateTicket(ticket.id, { checklist });
	return json({ ok: true });
};
