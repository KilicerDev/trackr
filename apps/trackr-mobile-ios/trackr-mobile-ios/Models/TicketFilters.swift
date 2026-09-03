//
//  TicketFilters.swift
//  trackr-mobile-ios
//
//  Mobile subset of the web tickets toolbar: group-by and multi-select
//  filters (board view, sub-grouping and saved views intentionally left
//  out — the list is the mobile experience).
//

import SwiftUI

enum TicketGroupBy: String, CaseIterable, Identifiable {
    case status, priority, category, org, assignee, none

    var id: String { rawValue }

    var label: String {
        switch self {
        case .status: "Status"
        case .priority: "Priority"
        case .category: "Category"
        case .org: "Organization"
        case .assignee: "Assignee"
        case .none: "None"
        }
    }
}

enum TicketSortKey: String, CaseIterable, Identifiable {
    case priority, activity, created, subject

    var id: String { rawValue }

    var label: String {
        switch self {
        case .priority: "Priority"
        case .activity: "Last activity"
        case .created: "Created"
        case .subject: "Subject"
        }
    }

    /// Direction a freshly picked key starts in (web NATURAL_DIR parity).
    var naturalAscending: Bool {
        switch self {
        case .subject: true
        case .priority, .activity, .created: false
        }
    }
}

struct TicketGroup: Identifiable {
    let id: String
    let label: String
    let color: Color?
    let tickets: [TicketItem]
}

struct TicketFilters: Equatable {
    var group: TicketGroupBy = .status
    /// Row order inside each group. Defaults reproduce the server order
    /// (newest first) — web `listSort` parity.
    var sortBy: TicketSortKey = .created
    var sortAscending = false
    var statuses: Set<TicketStatus> = []
    var priorities: Set<TaskPriority> = []
    var categories: Set<TicketCategory> = []
    var orgs: Set<OrgRef> = []
    var assignees: Set<UserRef> = []

    var hasActiveFilters: Bool {
        !statuses.isEmpty || !priorities.isEmpty || !categories.isEmpty
            || !orgs.isEmpty || !assignees.isEmpty
    }

    var isDefaultSort: Bool { sortBy == .created && !sortAscending }

    mutating func setSortKey(_ key: TicketSortKey) {
        sortBy = key
        sortAscending = key.naturalAscending
    }

    mutating func reset() {
        statuses = []
        priorities = []
        categories = []
        orgs = []
        assignees = []
        sortBy = .created
        sortAscending = false
    }

    func matches(_ ticket: TicketItem) -> Bool {
        if !statuses.isEmpty, !statuses.contains(ticket.status) { return false }
        if !priorities.isEmpty, !priorities.contains(ticket.priority) { return false }
        if !categories.isEmpty, !categories.contains(ticket.category) { return false }
        // Org/assignee refs compare by server id: the filter's refs and the
        // ticket's refs come from different sources (saved views resolve via
        // /me, ticket rows embed their own) and differ as whole values.
        if !orgs.isEmpty, !orgs.contains(where: { $0.sameOrg(as: ticket.org) }) { return false }
        if !assignees.isEmpty {
            let assigned = ticket.assignees.contains { member in
                assignees.contains { $0.sameUser(as: member) }
            }
            guard assigned else { return false }
        }
        return true
    }

    /// Primary key in the chosen direction, then priority (high first), then
    /// last activity (recent first). Stable. Mirrors web sortTickets().
    func sorted(_ tickets: [TicketItem]) -> [TicketItem] {
        func activity(_ t: TicketItem) -> Date {
            t.messages.map(\.date).max() ?? t.serverLastMessageAt ?? t.updatedAt ?? t.createdAt
        }
        func key(_ t: TicketItem) -> SortValue {
            switch sortBy {
            case .priority: .number(t.priority.rank)
            case .activity: .date(activity(t))
            case .created: .date(t.createdAt)
            case .subject: .text(t.subject.lowercased())
            }
        }
        func compare(_ a: SortValue, _ b: SortValue, ascending: Bool) -> Bool? {
            if a == b { return nil }
            return ascending ? a < b : b < a
        }
        return tickets.enumerated().sorted { lhs, rhs in
            let (i, a) = lhs
            let (j, b) = rhs
            if let r = compare(key(a), key(b), ascending: sortAscending) { return r }
            if sortBy != .priority,
               let r = compare(.number(a.priority.rank), .number(b.priority.rank), ascending: false) {
                return r
            }
            if sortBy != .activity,
               let r = compare(.date(activity(a)), .date(activity(b)), ascending: false) {
                return r
            }
            return i < j
        }.map(\.element)
    }

    func grouped(_ tickets: [TicketItem]) -> [TicketGroup] {
        let visible = sorted(tickets.filter(matches))

        func nonEmpty(_ groups: [TicketGroup]) -> [TicketGroup] {
            groups.filter { !$0.tickets.isEmpty }
        }

        switch group {
        case .status:
            return nonEmpty(TicketStatus.allCases.map { status in
                TicketGroup(id: status.rawValue, label: status.label, color: status.color,
                            tickets: visible.filter { $0.status == status })
            })
        case .priority:
            // Urgent first, like the web's reversed priority grouping.
            return nonEmpty(TaskPriority.ticketCases.reversed().map { priority in
                TicketGroup(id: priority.rawValue, label: priority.label, color: priority.color,
                            tickets: visible.filter { $0.priority == priority })
            })
        case .category:
            return nonEmpty(TicketCategory.allCases.map { category in
                TicketGroup(id: category.rawValue, label: category.label, color: category.color,
                            tickets: visible.filter { $0.category == category })
            })
        case .org:
            let orgs = Dictionary(grouping: visible) { $0.org }
            return orgs.keys.sorted { $0.name < $1.name }.map { org in
                TicketGroup(id: org.key, label: org.name, color: org.color,
                            tickets: orgs[org] ?? [])
            }
        case .assignee:
            // Grouped under the primary (first) assignee.
            let users = Dictionary(grouping: visible) { $0.assignees.first }
            let named = users.keys.compactMap(\.self).sorted { $0.name < $1.name }
            var groups = named.map { user in
                TicketGroup(id: user.name, label: user.name, color: user.color,
                            tickets: users[user] ?? [])
            }
            if let unassigned = users[nil] {
                groups.append(TicketGroup(id: "unassigned", label: "Unassigned", color: nil,
                                          tickets: unassigned))
            }
            return groups
        case .none:
            return [TicketGroup(id: "all", label: "", color: nil, tickets: visible)]
        }
    }
}
