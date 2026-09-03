//
//  SavedView.swift
//  trackr-mobile-ios
//
//  Server-synced saved views — the same entries the web ViewsMenu stores in
//  `user_preferences.view_state` (per page key: tasks/tickets/projects), so
//  a view saved on either surface shows up on the other.
//
//  Each entry's `config` stays raw JSON: it is client-authored and
//  open-ended, and re-saving the array must not drop keys this app doesn't
//  interpret (board grouping, sub-grouping, …). The typed filter structs are
//  derived on demand via the directories below.
//

import SwiftUI

/// Web parity: ViewsMenu.svelte SavedViewEntry — `{ id, name, config }`.
struct SavedViewEntry: Identifiable, Equatable, Hashable {
    let id: String
    var name: String
    var config: JSONValue

    static let maxCount = 20
    static let maxNameLength = 60

    static func list(from json: JSONValue?) -> [SavedViewEntry] {
        guard let views = json?["savedViews"]?.arrayValue else { return [] }
        return views.compactMap { entry in
            guard let id = entry["id"]?.stringValue, !id.isEmpty,
                  let name = entry["name"]?.stringValue, !name.isEmpty
            else { return nil }
            return SavedViewEntry(id: id, name: name, config: entry["config"] ?? .object([:]))
        }
    }

    var asJSON: JSONValue {
        .object(["id": .string(id), "name": .string(name), "config": config])
    }
}

/// Lookup tables for translating between the web's id-based filter values
/// (project keys, user ids, org ids) and the app's resolved models.
///
/// Entity-embedded refs (a ticket's `org`, a task's `assignees`) take
/// precedence over the /me and picker directories: they're the instances the
/// filter sheets offer and the ones matching compares against, so resolving
/// a saved view to the same instances keeps `==` (active checkmark) honest.
struct ViewDirectories {
    var projectKeyForName: [String: String] = [:]
    var projectNameForKey: [String: String] = [:]
    var usersById: [String: UserRef] = [:]
    var orgsById: [String: OrgRef] = [:]

    @MainActor
    init(model: AppModel) {
        for project in model.projects {
            projectKeyForName[project.name] = project.key
            projectNameForKey[project.key] = project.name
        }
        var users: [String: UserRef] = [:]
        for task in model.tasks {
            for assignee in task.assignees {
                if let id = assignee.serverId, users[id] == nil { users[id] = assignee }
            }
        }
        for ticket in model.tickets {
            for assignee in ticket.assignees {
                if let id = assignee.serverId, users[id] == nil { users[id] = assignee }
            }
        }
        for user in model.assignableUsers {
            if let id = user.serverId, users[id] == nil { users[id] = user }
        }
        if let me = model.currentUser, let id = me.serverId, users[id] == nil {
            users[id] = me
        }
        usersById = users
        var orgs: [String: OrgRef] = [:]
        for ticket in model.tickets {
            if let id = ticket.org.serverId, orgs[id] == nil { orgs[id] = ticket.org }
        }
        for org in model.orgs {
            if let id = org.serverId, orgs[id] == nil { orgs[id] = org }
        }
        orgsById = orgs
    }
}

// MARK: - Id-aware ref matching

extension UserRef {
    /// Same person: by server id when both sides have one, else whole-value
    /// equality (sample/preview data). Refs for one user are built from
    /// different sources (/me, picker directories, entity rows) whose
    /// key/color details can differ — id is the identity.
    func sameUser(as other: UserRef) -> Bool {
        if let mine = serverId, let theirs = other.serverId { return mine == theirs }
        return self == other
    }
}

extension OrgRef {
    /// Same org: by server id when both sides have one (a ticket's OrgRef
    /// keys off the display-id prefix, /me's off the slug — never equal as
    /// whole values), else whole-value equality for sample data.
    func sameOrg(as other: OrgRef) -> Bool {
        if let mine = serverId, let theirs = other.serverId { return mine == theirs }
        return self == other
    }
}

// MARK: - Web config ↔ typed filters

extension TimeWindow {
    /// Web TIME_HORIZON values: 7d / 14d / 30d / 90d / all.
    init?(web: String) {
        switch web {
        case "7d": self = .week
        case "14d": self = .twoWeeks
        case "30d": self = .month
        case "90d": self = .threeMonths
        case "all": self = .all
        default: return nil
        }
    }

    var webValue: String {
        switch self {
        case .week: "7d"
        case .twoWeeks: "14d"
        case .month: "30d"
        case .threeMonths: "90d"
        case .all: "all"
        }
    }
}

private func filterValues(_ config: JSONValue, _ key: String) -> [String] {
    config["filters"]?[key]?.stringArrayValue ?? []
}

private func filtersJSON(_ fields: [String: [String]]) -> JSONValue {
    // Web normalize() drops empty arrays — do the same so active-view
    // comparison over there matches.
    .object(fields.filter { !$0.value.isEmpty }.mapValues { .array($0.map(JSONValue.string)) })
}

extension TaskFilters {
    @MainActor
    init(webConfig config: JSONValue, directories: ViewDirectories) {
        self.init()
        if let group = config["listGroup"]?.stringValue.flatMap(GroupBy.init(rawValue:)) {
            self.group = group
        }
        if let window = config["time"]?.stringValue.flatMap(TimeWindow.init(web:)) {
            self.window = window
        }
        if let sort = config["listSort"],
           let key = sort["by"]?.stringValue.flatMap(TaskSortKey.init(rawValue:)) {
            sortBy = key
            sortAscending = sort["dir"]?.stringValue == "asc"
        }
        statuses = Set(filterValues(config, "status").compactMap(TaskStatus.init(api:)))
        priorities = Set(filterValues(config, "priority").compactMap(TaskPriority.init(api:)))
        assignees = Set(filterValues(config, "assignee").compactMap { directories.usersById[$0] })
        projects = Set(filterValues(config, "project").compactMap { directories.projectNameForKey[$0] })
    }

    /// Full config for a *new* view, web-shaped so /tasks can apply it
    /// (board/sub slots get the web defaults).
    func webConfig(directories: ViewDirectories) -> JSONValue {
        .object([
            "view": .string("list"),
            "listGroup": .string(group.rawValue),
            "boardGroup": .string("project"),
            "sub": .string("status"),
            "time": .string(window.webValue),
            "listSort": listSortJSON,
            "boardSort": .object(["by": .string("priority"), "dir": .string("desc")]),
            "filters": filtersJSON([
                "status": statuses.map(\.apiValue).sorted(),
                "priority": priorities.map(\.apiValue).sorted(),
                "assignee": assignees.compactMap(\.serverId).sorted(),
                "project": projects.compactMap { directories.projectKeyForName[$0] }.sorted(),
            ]),
        ])
    }

    /// Web `SortSpec` shape ({ by, dir }) — the list sort is the one the
    /// mobile list shows, so that is what syncs.
    private var listSortJSON: JSONValue {
        .object(["by": .string(sortBy.rawValue), "dir": .string(sortAscending ? "asc" : "desc")])
    }

    /// The persisted per-page state (localStorage/server `view_state.tasks`
    /// parity) — what "remember my current filters" writes.
    func webPatch(directories: ViewDirectories) -> JSONValue {
        .object([
            "listGroup": .string(group.rawValue),
            "time": .string(window.webValue),
            "listSort": listSortJSON,
            "filters": filtersJSON([
                "status": statuses.map(\.apiValue).sorted(),
                "priority": priorities.map(\.apiValue).sorted(),
                "assignee": assignees.compactMap(\.serverId).sorted(),
                "project": projects.compactMap { directories.projectKeyForName[$0] }.sorted(),
            ]),
        ])
    }

    var summary: String {
        var parts: [String] = []
        if !statuses.isEmpty {
            parts.append(statuses.map(\.label).sorted().joined(separator: ", "))
        }
        if !priorities.isEmpty {
            parts.append(priorities.map(\.label).sorted().joined(separator: " & "))
        }
        if !assignees.isEmpty {
            parts.append(assignees.map(\.name).sorted().joined(separator: ", "))
        }
        if !projects.isEmpty {
            parts.append(projects.sorted().joined(separator: ", "))
        }
        if window != .month {
            parts.append(window.label)
        }
        if group != .status {
            parts.append("by \(group.label.lowercased())")
        }
        return parts.isEmpty ? "All tasks" : parts.joined(separator: " · ")
    }
}

extension TicketFilters {
    @MainActor
    init(webConfig config: JSONValue, directories: ViewDirectories) {
        self.init()
        if let group = config["listGroup"]?.stringValue.flatMap(TicketGroupBy.init(rawValue:)) {
            self.group = group
        }
        if let sort = config["listSort"],
           let key = sort["by"]?.stringValue.flatMap(TicketSortKey.init(rawValue:)) {
            sortBy = key
            sortAscending = sort["dir"]?.stringValue == "asc"
        }
        statuses = Set(filterValues(config, "status").compactMap(TicketStatus.init(api:)))
        priorities = Set(filterValues(config, "priority").compactMap(TaskPriority.init(api:)))
        categories = Set(filterValues(config, "category").compactMap(TicketCategory.init(api:)))
        orgs = Set(filterValues(config, "org").compactMap { directories.orgsById[$0] })
        assignees = Set(filterValues(config, "assignee").compactMap { directories.usersById[$0] })
    }

    func webConfig(directories: ViewDirectories) -> JSONValue {
        .object([
            "view": .string("list"),
            "listGroup": .string(group.rawValue),
            "boardGroup": .string("status"),
            "sub": .string("none"),
            "listSort": listSortJSON,
            "boardSort": .object(["by": .string("priority"), "dir": .string("desc")]),
            "filters": filtersJSON([
                "status": statuses.map(\.apiValue).sorted(),
                "priority": priorities.map(\.apiValue).sorted(),
                "category": categories.map(\.apiValue).sorted(),
                "org": orgs.compactMap(\.serverId).sorted(),
                "assignee": assignees.compactMap(\.serverId).sorted(),
            ]),
        ])
    }

    private var listSortJSON: JSONValue {
        .object(["by": .string(sortBy.rawValue), "dir": .string(sortAscending ? "asc" : "desc")])
    }

    func webPatch(directories: ViewDirectories) -> JSONValue {
        .object([
            "listGroup": .string(group.rawValue),
            "listSort": listSortJSON,
            "filters": filtersJSON([
                "status": statuses.map(\.apiValue).sorted(),
                "priority": priorities.map(\.apiValue).sorted(),
                "category": categories.map(\.apiValue).sorted(),
                "org": orgs.compactMap(\.serverId).sorted(),
                "assignee": assignees.compactMap(\.serverId).sorted(),
            ]),
        ])
    }

    var summary: String {
        var parts: [String] = []
        if !statuses.isEmpty {
            parts.append(statuses.map(\.label).sorted().joined(separator: ", "))
        }
        if !priorities.isEmpty {
            parts.append(priorities.map(\.label).sorted().joined(separator: " & "))
        }
        if !categories.isEmpty {
            parts.append(categories.map(\.label).sorted().joined(separator: ", "))
        }
        if !orgs.isEmpty {
            parts.append(orgs.map(\.name).sorted().joined(separator: ", "))
        }
        if !assignees.isEmpty {
            parts.append(assignees.map(\.name).sorted().joined(separator: ", "))
        }
        if group != .status {
            parts.append("by \(group.label.lowercased())")
        }
        return parts.isEmpty ? "All tickets" : parts.joined(separator: " · ")
    }
}

extension ProjectFilters {
    @MainActor
    init(webConfig config: JSONValue, directories: ViewDirectories) {
        self.init()
        statuses = Set(filterValues(config, "status").compactMap(ProjectStatus.init(api:)))
        members = Set(filterValues(config, "assignee").compactMap { directories.usersById[$0] })
    }

    func webConfig(directories: ViewDirectories) -> JSONValue {
        .object([
            "view": .string("grid"),
            "gridGroup": .string("none"),
            "listGroup": .string("status"),
            "boardGroup": .string("status"),
            "filters": filtersJSON([
                "status": statuses.map(\.rawValue).sorted(),
                "assignee": members.compactMap(\.serverId).sorted(),
            ]),
        ])
    }

    func webPatch(directories: ViewDirectories) -> JSONValue {
        .object([
            "filters": filtersJSON([
                "status": statuses.map(\.rawValue).sorted(),
                "assignee": members.compactMap(\.serverId).sorted(),
            ]),
        ])
    }

    var summary: String {
        var parts: [String] = []
        if !statuses.isEmpty {
            parts.append(statuses.map(\.label).sorted().joined(separator: ", "))
        }
        if !members.isEmpty {
            parts.append(members.map(\.name).sorted().joined(separator: ", "))
        }
        return parts.isEmpty ? "All projects" : parts.joined(separator: " · ")
    }
}
