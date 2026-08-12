import { m } from "$lib/paraglide/messages";
import type { TicketStatus } from "$lib/api/types";

/* Ticket taxonomy — labels + colors mirror the web app's single source of
   truth (web/src/lib/config/taxonomy.ts). Statuses are always rendered as a
   colored dot next to a plain label, never as a filled badge. */

export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TICKET_CATEGORIES = [
  "general",
  "billing",
  "technical_issue",
  "feature_request",
] as const;

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

export function ticketStatusDot(status: string): string {
  switch (status) {
    case "open":
      return "#7a9cf0";
    case "in_progress":
      return "#f0a85c";
    case "waiting_on_customer":
      return "#b591e3";
    case "waiting_on_agent":
      return "#ef7a6d";
    case "paused":
      return "#e9c46a";
    case "resolved":
      return "#7fc8a9";
    case "closed":
      return "#7c7c84";
    default:
      return "#9aa4b2";
  }
}

/** Priority meta for the PriorityBars glyph (color + 0–4 active bars). */
export function ticketPriorityMeta(priority: string): {
  label: string;
  color: string;
  level: number;
} {
  switch (priority) {
    case "low":
      return { label: m.ticket_priority_low(), color: "#7a9cf0", level: 1 };
    case "medium":
      return { label: m.ticket_priority_medium(), color: "#f0a85c", level: 2 };
    case "high":
      return { label: m.ticket_priority_high(), color: "#ef7a6d", level: 3 };
    case "urgent":
      return { label: m.ticket_priority_urgent(), color: "#ef4f5e", level: 4 };
    default:
      return { label: m.ticket_priority_none(), color: "#5b5b62", level: 0 };
  }
}

export function ticketCategoryLabel(category: string): string {
  switch (category) {
    case "billing":
      return m.ticket_category_billing();
    case "technical_issue":
      return m.ticket_category_technical_issue();
    case "feature_request":
      return m.ticket_category_feature_request();
    case "general":
      return m.ticket_category_general();
    default:
      return category;
  }
}

export function ticketChannelLabel(channel: string): string {
  switch (channel) {
    case "web_form":
      return m.ticket_channel_web_form();
    case "email":
      return m.ticket_channel_email();
    case "chat":
      return m.ticket_channel_chat();
    case "api":
      return m.ticket_channel_api();
    default:
      return channel;
  }
}
