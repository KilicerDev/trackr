// Hand-maintained mirror of the server's /api/v1 JSON shapes
// (web/src/routes/api/v1/** and web/src/lib/permissions.ts). Conventions:
// timestamps are ISO strings, calendar dates are literal YYYY-MM-DD strings,
// ids are strings, display ids (T-12, TRACKR-15) come precomputed.

// ── Capabilities (mirror of web/src/lib/permissions.ts CapabilityManifest) ──
export interface CapabilityManifest {
  userType: "staff" | "external";
  isAdmin: boolean;
  surfaces: {
    tickets: boolean;
    chat: boolean;
    tasks: boolean;
    projects: boolean;
    wiki: boolean;
    notes: boolean;
    admin: boolean;
  };
  quickCreate: { ticket: boolean; task: boolean; note: boolean };
  global: string[];
  orgs: Record<
    string,
    { role: string; isInternal: boolean; permissions: string[] }
  >;
  projects: Record<string, { role: string; permissions: string[] }>;
}

export interface Org {
  id: string;
  slug: string;
  name: string;
  color: string;
}

export interface MeResponse {
  user: { id: string; name: string; email: string; image: string | null };
  capabilities: CapabilityManifest;
  orgs: Org[];
  unreadCount: number;
}

export interface InstanceInfo {
  name: string;
  version: string;
  api: number;
}

// ── Inbox ────────────────────────────────────────────────────────────────────
export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

// ── Tickets ──────────────────────────────────────────────────────────────────
export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_on_customer"
  | "waiting_on_agent"
  | "paused"
  | "resolved"
  | "closed";

export interface Ticket {
  id: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgColor: string;
  number: number;
  displayId: string;
  subject: string;
  description: string | null;
  status: TicketStatus;
  priority: string;
  category: string;
  channel: string;
  customerId: string | null;
  assignees: string[];
  createdBy: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  authorId: string | null;
  body: string;
  kind: "comment" | "system";
  meta: Record<string, unknown> | null;
  isInternalNote: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail {
  ticket: Ticket;
  messages: TicketMessage[];
  /** Display directory for message authors (emails stripped server-side). */
  authors: Record<string, { name: string; color: string }>;
  canEdit: boolean;
  canComment: boolean;
  canInternalNote: boolean;
}

// ── Chat ─────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  threadId: string;
  authorId: string | null;
  body: string;
  kind: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  editedAt: string | null;
}

export interface ChatThread {
  id: string;
  title: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  tagIds: string[];
  messages: ChatMessage[];
}

// ── Tasks (mirror of the web Task view model, trimmed) ──────────────────────
export interface Task {
  id: string; // display id, e.g. TRACKR-15
  uuid: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  project: string;
  assignees?: string[];
  due: string | null;
  description?: string;
  plannedFor?: string | null;
}

// ── Search ───────────────────────────────────────────────────────────────────
export interface SearchResult {
  type: "ticket" | "task" | "project" | "wiki" | "note";
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
}
