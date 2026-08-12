import { m } from "$lib/paraglide/messages";
import type { TicketStatus } from "$lib/api/types";
import type { StatusTone } from "$lib/components/ui/types";

export const TICKET_STATUSES: TicketStatus[] = [
  "open",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_agent",
  "paused",
  "resolved",
  "closed",
];

export function ticketStatusLabel(status: string): string {
  switch (status) {
    case "open":
      return m.ticket_status_open();
    case "in_progress":
      return m.ticket_status_in_progress();
    case "waiting_on_customer":
      return m.ticket_status_waiting_on_customer();
    case "waiting_on_agent":
      return m.ticket_status_waiting_on_agent();
    case "paused":
      return m.ticket_status_paused();
    case "resolved":
      return m.ticket_status_resolved();
    case "closed":
      return m.ticket_status_closed();
    default:
      return status;
  }
}

export function ticketStatusTone(status: string): StatusTone {
  switch (status) {
    case "open":
      return "info";
    case "in_progress":
      return "pending";
    case "waiting_on_customer":
    case "waiting_on_agent":
    case "paused":
      return "neutral";
    case "resolved":
    case "closed":
      return "success";
    default:
      return "neutral";
  }
}

/** Raw dot color for the minimal list row (status dot only, no badge). */
export function ticketStatusDot(status: string): string {
  switch (status) {
    case "open":
      return "var(--color-status-info-dot)";
    case "in_progress":
      return "var(--color-status-pending-dot)";
    case "resolved":
    case "closed":
      return "var(--color-status-success-dot)";
    default:
      return "var(--color-status-neutral-dot)";
  }
}
