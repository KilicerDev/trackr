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
}

struct TicketMessage: Identifiable, Hashable {
    let id = UUID()
    var user: UserRef
    var date: Date
    var text: String
    var internalNote = false
}

struct TicketItem: Identifiable, Hashable {
    let id: String  // displayId, e.g. "MEDI-14"
    var subject: String
    var status: TicketStatus
    var priority: TaskPriority
    var category: TicketCategory
    var channel: TicketChannel
    var org: OrgRef
    var customer: UserRef?
    var assignees: [UserRef] = []
    var tags: [String] = []
    var checklist: [ChecklistItem] = []
    var messages: [TicketMessage] = []
    var activity: [ActivityEvent] = []
    var createdAt: Date
    var firstResponseAt: Date?
    var resolvedAt: Date?

    var checklistDone: Int { checklist.count { $0.done } }
    var checklistTotal: Int { checklist.count }
    /// Public messages only — internal notes don't count toward the
    /// conversation badge (web parity: messageCount).
    var messageCount: Int { messages.count { !$0.internalNote } }
    var lastActivityAt: Date { messages.map(\.date).max() ?? createdAt }

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
        OrgRef(key: "MEDI", name: "Medizell", color: Color(hex: 0xC08BD6)),
        OrgRef(key: "BAUM", name: "Baumann & Co", color: Color(hex: 0x7A9CF0)),
        OrgRef(key: "SWN", name: "Stadtwerke Nord", color: Color(hex: 0x7FC8A9)),
    ]

    static let sampleCustomers = [
        UserRef(name: "Dr. Anna Brandt", initials: "AB", color: Color(hex: 0xE9C46A)),
        UserRef(name: "Peter Lang", initials: "PL", color: Color(hex: 0xEF7A6D)),
        UserRef(name: "Sofia Ritter", initials: "SR", color: Color(hex: 0xB591E3)),
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
            TicketItem(id: "MEDI-24", subject: "Practice software freezes when opening patient files",
                       status: .open, priority: .urgent, category: .technicalIssue, channel: .email,
                       org: orgs[0], customer: customers[0],
                       tags: ["outage"],
                       messages: [
                           TicketMessage(user: customers[0], date: ago(hours: 2),
                                         text: "Since this morning the practice software freezes whenever we open a patient file. Reception is completely blocked — please call as soon as possible."),
                       ],
                       createdAt: ago(hours: 2)),
            TicketItem(id: "BAUM-31", subject: "VPN drops every 30 minutes for home office users",
                       status: .inProgress, priority: .high, category: .technicalIssue, channel: .webForm,
                       org: orgs[1], customer: customers[1],
                       assignees: [agents[1]],
                       tags: ["vpn", "network"],
                       checklist: [
                           ChecklistItem(text: "Reproduce with a test account", done: true),
                           ChecklistItem(text: "Check firewall session timeout", done: true),
                           ChecklistItem(text: "Roll out new client config"),
                       ],
                       messages: [
                           TicketMessage(user: customers[1], date: ago(hours: 30),
                                         text: "Three colleagues in home office lose the VPN connection roughly every half hour and have to reconnect manually."),
                           TicketMessage(user: agents[1], date: ago(hours: 27),
                                         text: "Thanks Peter — that pattern sounds like a session timeout on the firewall. We're reproducing it with a test account and will get back to you today."),
                           TicketMessage(user: agents[1], date: ago(hours: 5),
                                         text: "Timeout confirmed: the firewall killed idle SSL sessions after 30 minutes. Keepalive interval is fixed in the new client config.", internalNote: true),
                       ],
                       activity: [
                           ActivityEvent(user: agents[1], date: ago(hours: 28),
                                         text: "assigned themselves", icon: "person.badge.plus"),
                           ActivityEvent(user: agents[1], date: ago(hours: 26),
                                         text: "changed status to In Progress",
                                         icon: "arrow.triangle.2.circlepath"),
                       ],
                       createdAt: ago(hours: 30), firstResponseAt: ago(hours: 27)),
            TicketItem(id: "SWN-12", subject: "Quote for 15 new workstations incl. monitors",
                       status: .waitingOnCustomer, priority: .medium, category: .general, channel: .email,
                       org: orgs[2], customer: customers[2],
                       assignees: [agents[0]],
                       tags: ["hardware", "quote"],
                       messages: [
                           TicketMessage(user: customers[2], date: ago(hours: 76),
                                         text: "We're expanding the service team and need a quote for 15 workstations with two monitors each."),
                           TicketMessage(user: agents[0], date: ago(hours: 70),
                                         text: "Quote is attached — two options, both with 3-year on-site warranty. Happy to walk you through the differences."),
                       ],
                       createdAt: ago(hours: 76), firstResponseAt: ago(hours: 70)),
            TicketItem(id: "MEDI-23", subject: "Invoice 2026-081 lists wrong license count",
                       status: .waitingOnAgent, priority: .medium, category: .billing, channel: .webForm,
                       org: orgs[0], customer: customers[0],
                       assignees: [agents[0], agents[1]],
                       tags: ["invoice"],
                       messages: [
                           TicketMessage(user: customers[0], date: ago(hours: 52),
                                         text: "The August invoice bills 12 Office licenses but we reduced to 10 in July."),
                           TicketMessage(user: agents[0], date: ago(hours: 49),
                                         text: "You're right, the reduction missed the cutoff. We'll issue a corrected invoice."),
                           TicketMessage(user: customers[0], date: ago(hours: 6),
                                         text: "Any update on the corrected invoice? Our accounting closes the month on Friday."),
                       ],
                       activity: [
                           ActivityEvent(user: agents[0], date: ago(hours: 48),
                                         text: "changed status to Waiting on agent",
                                         icon: "arrow.triangle.2.circlepath"),
                       ],
                       createdAt: ago(hours: 52), firstResponseAt: ago(hours: 49)),
            TicketItem(id: "BAUM-29", subject: "Add shared mailbox for the sales team",
                       status: .paused, priority: .low, category: .featureRequest, channel: .chat,
                       org: orgs[1], customer: customers[1],
                       assignees: [agents[2]],
                       messages: [
                           TicketMessage(user: customers[1], date: ago(hours: 120),
                                         text: "Could we get sales@ as a shared mailbox for the four sales colleagues?"),
                           TicketMessage(user: agents[2], date: ago(hours: 115),
                                         text: "Sure — we'll set it up together with the Exchange maintenance next week, that avoids a second downtime."),
                       ],
                       createdAt: ago(hours: 120), firstResponseAt: ago(hours: 115)),
            TicketItem(id: "SWN-11", subject: "Printer in building C prints blank pages",
                       status: .resolved, priority: .medium, category: .technicalIssue, channel: .email,
                       org: orgs[2], customer: customers[2],
                       assignees: [agents[2]],
                       messages: [
                           TicketMessage(user: customers[2], date: ago(hours: 100),
                                         text: "The Kyocera in building C only prints blank pages since yesterday."),
                           TicketMessage(user: agents[2], date: ago(hours: 96),
                                         text: "Drum unit was worn out — replaced it on site, test pages look clean again."),
                       ],
                       activity: [
                           ActivityEvent(user: agents[2], date: ago(hours: 95),
                                         text: "marked the ticket as Resolved",
                                         icon: "checkmark.circle"),
                       ],
                       createdAt: ago(hours: 100), firstResponseAt: ago(hours: 96),
                       resolvedAt: ago(hours: 95)),
            TicketItem(id: "MEDI-21", subject: "Onboarding for two new employees",
                       status: .closed, priority: .low, category: .general, channel: .webForm,
                       org: orgs[0], customer: customers[0],
                       assignees: [agents[1]],
                       checklist: [
                           ChecklistItem(text: "Create AD accounts", done: true),
                           ChecklistItem(text: "Prepare notebooks", done: true),
                           ChecklistItem(text: "Practice software access", done: true),
                       ],
                       messages: [
                           TicketMessage(user: customers[0], date: ago(hours: 240),
                                         text: "Two new colleagues start on the 1st — please prepare accounts and notebooks."),
                           TicketMessage(user: agents[1], date: ago(hours: 235),
                                         text: "All set up — notebooks are configured and will be delivered Thursday."),
                       ],
                       createdAt: ago(hours: 240), firstResponseAt: ago(hours: 235),
                       resolvedAt: ago(hours: 180)),
        ]
    }()
}
