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

struct TaskGroup: Identifiable {
    let id: String
    let label: String
    let color: Color?
    let tasks: [TaskItem]
}

struct TaskFilters: Equatable {
    var group: GroupBy = .status
    var window: TimeWindow = .month
    var statuses: Set<TaskStatus> = []
    var priorities: Set<TaskPriority> = []
    var assignees: Set<UserRef> = []
    var projects: Set<String> = []

    /// Only the multi-select filters count as "active" — group/window always
    /// have a value.
    var hasActiveFilters: Bool {
        !statuses.isEmpty || !priorities.isEmpty || !assignees.isEmpty || !projects.isEmpty
    }

    mutating func reset() {
        statuses = []
        priorities = []
        assignees = []
        projects = []
        window = .month
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

    func grouped(_ tasks: [TaskItem]) -> [TaskGroup] {
        let visible = tasks.filter(matches)

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
