import type { ApiClient } from "./client";
import type { Ticket, TicketDetail } from "./types";

export type TicketSegment = "mine" | "watched" | "all";

export function listTickets(
  client: ApiClient,
  segment: TicketSegment,
): Promise<{ tickets: Ticket[] }> {
  return client.get(`/api/v1/tickets?segment=${segment}`);
}

export function getTicket(client: ApiClient, id: string): Promise<TicketDetail> {
  return client.get(`/api/v1/tickets/${id}`);
}

export function postTicketMessage(
  client: ApiClient,
  id: string,
  body: string,
  internal: boolean,
): Promise<{ id: string }> {
  return client.post(`/api/v1/tickets/${id}/messages`, { body, internal });
}

export function updateTicket(
  client: ApiClient,
  id: string,
  patch: {
    status?: string;
    priority?: string;
    category?: string;
    assigneeIds?: string[];
  },
): Promise<{ ok: boolean; ticket?: Ticket }> {
  return client.patch(`/api/v1/tickets/${id}`, patch);
}

export function createTicket(
  client: ApiClient,
  input: { orgId: string; subject: string; description?: string },
): Promise<{ id: string; displayId: string }> {
  return client.post("/api/v1/tickets", input);
}
