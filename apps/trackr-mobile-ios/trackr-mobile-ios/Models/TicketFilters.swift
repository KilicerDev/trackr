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

struct TicketGroup: Identifiable {
    let id: String
    let label: String
    let color: Color?
    let tickets: [TicketItem]
}

struct TicketFilters: Equatable {
    var group: TicketGroupBy = .status
    var statuses: Set<TicketStatus> = []
    var priorities: Set<TaskPriority> = []
    var categories: Set<TicketCategory> = []
    var orgs: Set<OrgRef> = []
    var assignees: Set<UserRef> = []

    var hasActiveFilters: Bool {
        !statuses.isEmpty || !priorities.isEmpty || !categories.isEmpty
            || !orgs.isEmpty || !assignees.isEmpty
    }

    mutating func reset() {
        statuses = []
        priorities = []
        categories = []
        orgs = []
        assignees = []
    }

    func matches(_ ticket: TicketItem) -> Bool {
        if !statuses.isEmpty, !statuses.contains(ticket.status) { return false }
        if !priorities.isEmpty, !priorities.contains(ticket.priority) { return false }
        if !categories.isEmpty, !categories.contains(ticket.category) { return false }
        if !orgs.isEmpty, !orgs.contains(ticket.org) { return false }
        if !assignees.isEmpty {
            guard ticket.assignees.contains(where: assignees.contains) else { return false }
        }
        return true
    }

    func grouped(_ tickets: [TicketItem]) -> [TicketGroup] {
        let visible = tickets.filter(matches)

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
