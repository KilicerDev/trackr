//
//  TaskFilters.swift
//  trackr-mobile-ios
//
//  Mobile subset of the web tasks toolbar: group-by, due-within window and
//  multi-select filters (subgroup and tags intentionally left out).
//

import SwiftUI

enum GroupBy: String, CaseIterable, Identifiable {
    case status, priority, assignee, project, none

    var id: String { rawValue }

    var label: String {
        switch self {
        case .status: "Status"
        case .priority: "Priority"
        case .assignee: "Assignee"
        case .project: "Project"
        case .none: "None"
        }
    }
}

enum TimeWindow: String, CaseIterable, Identifiable {
    case week, twoWeeks, month, threeMonths, all

    var id: String { rawValue }

    var label: String {
        switch self {
        case .week: "Next 7 days"
        case .twoWeeks: "Next 2 weeks"
        case .month: "Next month"
        case .threeMonths: "Next 3 months"
        case .all: "All"
        }
    }

    var days: Int? {
        switch self {
        case .week: 7
        case .twoWeeks: 14
        case .month: 30
        case .threeMonths: 90
        case .all: nil
        }
    }
}

enum TaskSortKey: String, CaseIterable, Identifiable {
    case due, priority, updated, created, title

    var id: String { rawValue }

    var label: String {
        switch self {
        case .due: "Due date"
        case .priority: "Priority"
        case .updated: "Last updated"
        case .created: "Created"
        case .title: "Title"
        }
    }

    /// Direction a freshly picked key starts in (web NATURAL_DIR parity):
    /// dates and priority newest/highest first, due date and title A→Z.
    var naturalAscending: Bool {
        switch self {
        case .due, .title: true
        case .priority, .updated, .created: false
        }
    }
}

struct TaskGroup: Identifiable {
    let id: String
    let label: String
    let color: Color?
    let tasks: [TaskItem]
}

struct TaskFilters: Equatable {
    var group: GroupBy = .status
    var window: TimeWindow = .month
    /// Row order inside each group. Defaults reproduce the server order
    /// (newest first) — web `listSort` parity.
    var sortBy: TaskSortKey = .created
    var sortAscending = false
    var statuses: Set<TaskStatus> = []
    var priorities: Set<TaskPriority> = []
    var assignees: Set<UserRef> = []
    var projects: Set<String> = []

    /// Only the multi-select filters count as "active" — group/window always
    /// have a value.
    var hasActiveFilters: Bool {
        !statuses.isEmpty || !priorities.isEmpty || !assignees.isEmpty || !projects.isEmpty
    }

    var isDefaultSort: Bool { sortBy == .created && !sortAscending }

    /// Picking a key resets the direction to that key's natural one so the
    /// first tap does the expected thing; the arrow button flips it after.
    mutating func setSortKey(_ key: TaskSortKey) {
        sortBy = key
        sortAscending = key.naturalAscending
    }

    mutating func reset() {
        statuses = []
        priorities = []
        assignees = []
        projects = []
        window = .month
        sortBy = .created
        sortAscending = false
    }

    func matches(_ task: TaskItem) -> Bool {
        guard withinWindow(task) else { return false }
        if !statuses.isEmpty, !statuses.contains(task.status) { return false }
        if !priorities.isEmpty, !priorities.contains(task.priority) { return false }
        if !assignees.isEmpty {
            // By server id: the filter's refs may come from a different
            // source (saved view, picker directory) than the task row's.
            let assigned = task.assignees.contains { member in
                assignees.contains { $0.sameUser(as: member) }
            }
            guard assigned else { return false }
        }
        if !projects.isEmpty, !projects.contains(task.project) { return false }
        return true
    }

    /// Web parity (tasks/+page.svelte withinWindow): undated tasks always
    /// show (backlog, not future), past dates always pass — the window only
    /// cuts off far-future due dates.
    private func withinWindow(_ task: TaskItem) -> Bool {
        guard let days = window.days else { return true }
        let dates = [task.due, task.plannedFor].compactMap(\.self)
        guard let soonest = dates.min() else { return true }
        let horizon = Calendar.current.date(byAdding: .day, value: days, to: Date.now.startOfDay)!
        return soonest.startOfDay <= horizon
    }

    /// Primary key in the chosen direction, then priority (high first), then
    /// created (new first). Tasks without a value for the key always sort
    /// last — an undated task is backlog, not "due first". Stable.
    func sorted(_ tasks: [TaskItem]) -> [TaskItem] {
        func key(_ t: TaskItem) -> SortValue? {
            switch sortBy {
            case .due: t.due.map(SortValue.date)
            case .priority: .number(t.priority.rank)
            case .updated: t.updatedAt.map(SortValue.date)
            case .created: t.createdAt.map(SortValue.date)
            case .title: .text(t.title.lowercased())
            }
        }
        func compare(_ a: SortValue?, _ b: SortValue?, ascending: Bool) -> Bool? {
            switch (a, b) {
            case (nil, nil): return nil
            case (nil, _): return false
            case (_, nil): return true
            case let (a?, b?):
                if a == b { return nil }
                return ascending ? a < b : b < a
            }
        }
        return tasks.enumerated().sorted { lhs, rhs in
            let (i, a) = lhs
            let (j, b) = rhs
            if let r = compare(key(a), key(b), ascending: sortAscending) { return r }
            if sortBy != .priority,
               let r = compare(.number(a.priority.rank), .number(b.priority.rank), ascending: false) {
                return r
            }
            if sortBy != .created,
               let r = compare(a.createdAt.map(SortValue.date), b.createdAt.map(SortValue.date),
                               ascending: false) {
                return r
            }
            return i < j
        }.map(\.element)
    }

    func grouped(_ tasks: [TaskItem]) -> [TaskGroup] {
        let visible = sorted(tasks.filter(matches))

        func nonEmpty(_ groups: [TaskGroup]) -> [TaskGroup] {
            groups.filter { !$0.tasks.isEmpty }
        }

        switch group {
        case .status:
            return nonEmpty(TaskStatus.allCases.map { status in
                TaskGroup(id: status.rawValue, label: status.label, color: status.color,
                          tasks: visible.filter { $0.status == status })
            })
        case .priority:
            // Urgent first, like the web's reversed priority grouping.
            return nonEmpty(TaskPriority.allCases.reversed().map { priority in
                TaskGroup(id: priority.rawValue, label: priority.label, color: priority.color,
                          tasks: visible.filter { $0.priority == priority })
            })
        case .assignee:
            // Grouped under the primary (first) assignee.
            let users = Dictionary(grouping: visible) { $0.assignees.first }
            let named = users.keys.compactMap(\.self).sorted { $0.name < $1.name }
            var groups = named.map { user in
                TaskGroup(id: user.name, label: user.name, color: user.color,
                          tasks: users[user] ?? [])
            }
            if let unassigned = users[nil] {
                groups.append(TaskGroup(id: "unassigned", label: "Unassigned", color: nil,
                                        tasks: unassigned))
            }
            return groups
        case .project:
            let projects = Dictionary(grouping: visible) { $0.project }
            return projects.keys.sorted().map { project in
                TaskGroup(id: project, label: project, color: nil,
                          tasks: projects[project] ?? [])
            }
        case .none:
            return [TaskGroup(id: "all", label: "", color: nil, tasks: visible)]
        }
    }
}

/// Comparable wrapper so one comparator handles dates, ranks and strings.
private enum SortValue: Comparable {
    case date(Date)
    case number(Int)
    case text(String)

    static func < (lhs: SortValue, rhs: SortValue) -> Bool {
        switch (lhs, rhs) {
        case let (.date(a), .date(b)): a < b
        case let (.number(a), .number(b)): a < b
        case let (.text(a), .text(b)): a < b
        default: false
        }
    }
}
