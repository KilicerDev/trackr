//
//  TicketItem.swift
//  trackr-mobile-ios
//
//  Web parity: server/tickets.ts TicketRow, trimmed to the fields the
//  mobile screens actually render.
//

import SwiftUI

struct OrgRef: Hashable {
    let key: String  // "MEDI" — display-id prefix
    let name: String
    let color: Color
    /// Server org id — nil for sample/preview data.
    var serverId: String? = nil
}

struct TicketMessage: Identifiable, Hashable {
    var id: String = UUID().uuidString
    var user: UserRef
    var date: Date
    var text: String
    var internalNote = false
    var attachments: [AttachmentItem] = []
    /// Optimistic-only: files still uploading for a just-sent message. The
    /// server copy that replaces the row carries real `attachments` instead.
    var pendingFiles: [PickedFile] = []
}

struct TicketItem: Identifiable, Hashable {
    let id: String  // displayId, e.g. "MEDI-14"
    /// Server ticket UUID (the PATCH/message endpoints key) — nil for
    /// sample/preview data.
    var uuid: String? = nil
    var subject: String
    /// Server `description` — read-only on mobile (desktop-only edit). The
    /// UI shows it as the opening message of the conversation (web parity).
    var details = ""
    var status: TicketStatus
    var priority: TaskPriority
    var category: TicketCategory
    var channel: TicketChannel
    var org: OrgRef
    var customer: UserRef?
    /// Who opened the ticket (server createdBy) — author of the opening
    /// message when there's no customer.
    var createdBy: UserRef? = nil
    var assignees: [UserRef] = []
    var tags: [String] = []
    var checklist: [ChecklistItem] = []
    var messages: [TicketMessage] = []
    var activity: [ActivityEvent] = []
    /// Detail-fetch only, like messages — preserved across list refreshes.
    var attachments: [AttachmentItem] = []
    var createdAt: Date
    var firstResponseAt: Date?
    /// Server `updatedAt` — nil for sample data. Feeds the "last activity" sort.
    var updatedAt: Date? = nil
    var resolvedAt: Date?
    /// List rows arrive without their messages — the server's counts fill in
    /// until the detail fetch loads the real conversation.
    var serverMessageCount: Int? = nil
    var serverLastMessageAt: Date? = nil
    /// Tasks converted out of this ticket (detail fetch only, staff-only).
    var linkedTasks: [ConversionLink] = []

    /// The description rendered as the conversation's first message — UI
    /// only, never sent to the server. Nil when there's no description.
    var openingMessage: TicketMessage? {
        guard !details.isEmpty else { return nil }
        let author = customer ?? createdBy
            ?? UserRef(name: "Customer", initials: "?", color: Color(.systemGray))
        return TicketMessage(id: "opening-\(id)", user: author, date: createdAt, text: details)
    }

    var checklistDone: Int { checklist.count { $0.done } }
    var checklistTotal: Int { checklist.count }
    /// Public messages only — internal notes don't count toward the
    /// conversation badge (web parity: messageCount).
    var messageCount: Int {
        messages.isEmpty ? (serverMessageCount ?? 0) : messages.count { !$0.internalNote }
    }
    var lastActivityAt: Date { messages.map(\.date).max() ?? serverLastMessageAt ?? createdAt }

    /// Web parity (utils/ticket-sla.ts slaSignal): one muted management
    /// signal — awaiting first response, or resolved-when. Nil otherwise;
    /// callers fall back to the last-activity time.
    var slaSignal: (label: String, color: Color)? {
        if !status.isClosed && firstResponseAt == nil {
            return ("Awaiting reply · \(createdAt.relativeShort)", Color(hex: 0xE9C46A))
        }
        if status.isClosed, let when = resolvedAt {
            return ("Resolved \(when.relativeShort)", Color(hex: 0x7FC8A9))
        }
        return nil
    }
}

extension Date {
    /// Web parity (ticket-sla.ts relTime): "just now" / "5m ago" / "3h ago"
    /// / "2d ago", absolute date beyond a week.
    var relativeShort: String {
        let mins = Int(Date.now.timeIntervalSince(self) / 60)
        if mins < 1 { return "just now" }
        if mins < 60 { return "\(mins)m ago" }
        let hours = mins / 60
        if hours < 24 { return "\(hours)h ago" }
        let days = hours / 24
        if days < 7 { return "\(days)d ago" }
        return formatted(.dateTime.day().month(.abbreviated))
    }
}

// MARK: - Sample data (UI design phase only — replaced by /api/v1 later)

extension TicketItem {
    static let sampleOrgs = [
        OrgRef(key: "SIWEB", name: "Siweb GmbH", color: Color(hex: 0xC08BD6)),
        OrgRef(key: "WEBIM", name: "webim.agency", color: Color(hex: 0x7A9CF0)),
        OrgRef(key: "MAJA", name: "maja.studio", color: Color(hex: 0x7FC8A9)),
    ]

    static let sampleCustomers = [
        UserRef(name: "Renée Carter", initials: "RC", color: Color(hex: 0xE9C46A)),
        UserRef(name: "Sabine Koch", initials: "SK", color: Color(hex: 0xEF7A6D)),
        UserRef(name: "Josie Marlow", initials: "JM", color: Color(hex: 0xB591E3)),
    ]

    static let samples: [TicketItem] = {
        let cal = Calendar.current
        func ago(hours: Int) -> Date {
            cal.date(byAdding: .hour, value: -hours, to: .now)!
        }
        let agents = TaskItem.sampleUsers
        let orgs = sampleOrgs
        let customers = sampleCustomers
        return [
            TicketItem(id: "SIWEB-24", subject: "Checkout freezes when a voucher code is applied",
                       status: .open, priority: .urgent, category: .technicalIssue, channel: .email,
                       org: orgs[0], customer: customers[0],
                       tags: ["outage"],
                       messages: [
                           TicketMessage(user: customers[0], date: ago(hours: 2),
                                         text: "Since this morning the checkout freezes whenever a customer applies a voucher code. Nobody can complete an order — please call as soon as possible."),
                       ],
                       createdAt: ago(hours: 2)),
            TicketItem(id: "WEBIM-31", subject: "Landing page form drops submissions every few minutes",
                       status: .inProgress, priority: .high, category: .technicalIssue, channel: .webForm,
                       org: orgs[1], customer: customers[1],
                       assignees: [agents[1]],
                       tags: ["forms", "hosting"],
                       checklist: [
                           ChecklistItem(text: "Reproduce with a test submission", done: true),
                           ChecklistItem(text: "Check reverse-proxy idle timeout", done: true),
                           ChecklistItem(text: "Roll out new form config"),
                       ],
                       messages: [
                           TicketMessage(user: customers[1], date: ago(hours: 30),
                                         text: "Roughly every half hour the campaign form on the spring landing page returns an error and the submission is lost."),
                           TicketMessage(user: agents[1], date: ago(hours: 27),
                                         text: "Thanks Sabine — that pattern sounds like an idle timeout on the reverse proxy. We're reproducing it with a test submission and will get back to you today."),
                           TicketMessage(user: agents[1], date: ago(hours: 5),
                                         text: "Timeout confirmed: the proxy closed idle upstream connections after 30 seconds. Keepalive is fixed in the new form config.", internalNote: true),
                       ],
                       activity: [
                           ActivityEvent(user: agents[1], date: ago(hours: 28),
                                         text: "assigned themselves", icon: "person.badge.plus"),
                           ActivityEvent(user: agents[1], date: ago(hours: 26),
                                         text: "changed status to In Progress",
                                         icon: "arrow.triangle.2.circlepath"),
                       ],
                       createdAt: ago(hours: 30), firstResponseAt: ago(hours: 27)),
            TicketItem(id: "MAJA-12", subject: "Quote for a portfolio relaunch incl. CMS",
                       status: .waitingOnCustomer, priority: .medium, category: .general, channel: .email,
                       org: orgs[2], customer: customers[2],
                       assignees: [agents[0]],
                       tags: ["relaunch", "quote"],
                       messages: [
                           TicketMessage(user: customers[2], date: ago(hours: 76),
                                         text: "We're expanding the studio and need a quote for a portfolio relaunch with a small CMS for case studies."),
                           TicketMessage(user: agents[0], date: ago(hours: 70),
                                         text: "Quote is attached — two options, both with a year of hosting included. Happy to walk you through the differences."),
                       ],
                       createdAt: ago(hours: 76), firstResponseAt: ago(hours: 70)),
            TicketItem(id: "SIWEB-23", subject: "Invoice 2026-081 lists wrong hosting plan",
                       status: .waitingOnAgent, priority: .medium, category: .billing, channel: .webForm,
                       org: orgs[0], customer: customers[0],
                       assignees: [agents[0], agents[1]],
                       tags: ["invoice"],
                       messages: [
                           TicketMessage(user: customers[0], date: ago(hours: 52),
                                         text: "The August invoice bills the Pro hosting plan but we moved to Standard in July."),
                           TicketMessage(user: agents[0], date: ago(hours: 49),
                                         text: "You're right, the downgrade missed the cutoff. We'll issue a corrected invoice."),
                           TicketMessage(user: customers[0], date: ago(hours: 6),
                                         text: "Any update on the corrected invoice? Our accounting closes the month on Friday."),
                       ],
                       activity: [
                           ActivityEvent(user: agents[0], date: ago(hours: 48),
                                         text: "changed status to Waiting on agent",
                                         icon: "arrow.triangle.2.circlepath"),
                       ],
                       createdAt: ago(hours: 52), firstResponseAt: ago(hours: 49)),
            TicketItem(id: "WEBIM-29", subject: "Add shared inbox for the campaign team",
                       status: .paused, priority: .low, category: .featureRequest, channel: .chat,
                       org: orgs[1], customer: customers[1],
                       assignees: [agents[2]],
                       messages: [
                           TicketMessage(user: customers[1], date: ago(hours: 120),
                                         text: "Could we get campaigns@ as a shared inbox for the four campaign managers?"),
                           TicketMessage(user: agents[2], date: ago(hours: 115),
                                         text: "Sure — we'll set it up together with the mail migration next week, that avoids a second downtime."),
                       ],
                       createdAt: ago(hours: 120), firstResponseAt: ago(hours: 115)),
            TicketItem(id: "MAJA-11", subject: "Contact form sends blank emails",
                       status: .resolved, priority: .medium, category: .technicalIssue, channel: .email,
                       org: orgs[2], customer: customers[2],
                       assignees: [agents[2]],
                       messages: [
                           TicketMessage(user: customers[2], date: ago(hours: 100),
                                         text: "The contact form on the portfolio site sends empty emails since yesterday."),
                           TicketMessage(user: agents[2], date: ago(hours: 96),
                                         text: "The template variable was renamed in the last deploy — fixed, test submissions arrive complete again."),
                       ],
                       activity: [
                           ActivityEvent(user: agents[2], date: ago(hours: 95),
                                         text: "marked the ticket as Resolved",
                                         icon: "checkmark.circle"),
                       ],
                       createdAt: ago(hours: 100), firstResponseAt: ago(hours: 96),
                       resolvedAt: ago(hours: 95)),
            TicketItem(id: "SIWEB-21", subject: "Onboarding for two new shop editors",
                       status: .closed, priority: .low, category: .general, channel: .webForm,
                       org: orgs[0], customer: customers[0],
                       assignees: [agents[1]],
                       checklist: [
                           ChecklistItem(text: "Create CMS accounts", done: true),
                           ChecklistItem(text: "Set up staging access", done: true),
                           ChecklistItem(text: "Editor training", done: true),
                       ],
                       messages: [
                           TicketMessage(user: customers[0], date: ago(hours: 240),
                                         text: "Two new editors start on the 1st — please prepare CMS accounts and staging access."),
                           TicketMessage(user: agents[1], date: ago(hours: 235),
                                         text: "All set up — accounts are ready and the training is booked for Thursday."),
                       ],
                       createdAt: ago(hours: 240), firstResponseAt: ago(hours: 235),
                       resolvedAt: ago(hours: 180)),
        ]
    }()
}
