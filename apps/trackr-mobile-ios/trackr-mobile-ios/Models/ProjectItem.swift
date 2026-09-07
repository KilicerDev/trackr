//
//  ProjectItem.swift
//  trackr-mobile-ios
//
//  Web parity: routes/(app)/projects ProjectListItem — name, key, color,
//  description, status, lead, members, updated.
//

import SwiftUI

struct ProjectItem: Identifiable, Hashable {
    let key: String  // "TRK"
    /// Server project id — nil for sample/preview data.
    var serverId: String? = nil
    var name: String
    var color: Color
    var about = ""
    var status: ProjectStatus = .active
    /// Free-form tags, same vocabulary style as task/ticket tags.
    var tags: [String] = []
    var lead: UserRef?
    var members: [UserRef] = []
    var updatedAt = Date.now
    var isFavorite = false
    var history: [ProjectEvent] = []

    var id: String { key }
    var initial: String { String(name.prefix(1)) }
    /// Lightweight ref used by work sessions and home cards.
    var ref: ProjectRef { ProjectRef(name: name, color: color) }
}

/// One history entry: a comment (icon == nil, text is the body) or a
/// typed event ("changed status of TRK-118 to In Progress").
struct ProjectEvent: Identifiable, Hashable {
    let id = UUID()
    var user: UserRef
    var date: Date
    var text: String
    var icon: String?
    /// Server activity id — nil for sample data and optimistic local rows.
    var serverId: String? = nil

    var isComment: Bool { icon == nil }
}

struct ProjectFilters: Equatable {
    var statuses: Set<ProjectStatus> = []
    var members: Set<UserRef> = []

    var hasActiveFilters: Bool { !statuses.isEmpty || !members.isEmpty }

    func matches(_ project: ProjectItem) -> Bool {
        if !statuses.isEmpty, !statuses.contains(project.status) { return false }
        if !members.isEmpty {
            // By server id — filter refs and project member refs can come
            // from different directories with differing colors/initials.
            let hasMember = project.members.contains { member in
                members.contains { $0.sameUser(as: member) }
            }
            guard hasMember else { return false }
        }
        return true
    }
}

// MARK: - Sample data (UI design phase only — replaced by /api/v1 later)

extension ProjectItem {
    static let samples: [ProjectItem] = {
        let users = TaskItem.sampleUsers
        let cal = Calendar.current
        func ago(hours: Int) -> Date {
            cal.date(byAdding: .hour, value: -hours, to: .now)!
        }
        return [
            ProjectItem(key: "TRK", name: "Trackr Web", color: Color(hex: 0xFF4867),
                        about: "Ticketing, tasks and notes platform for KiloHertz IT.",
                        status: .active, lead: users[0], members: users,
                        updatedAt: ago(hours: 2), isFavorite: true,
                        history: [
                            ProjectEvent(user: users[0], date: ago(hours: 50),
                                         text: "created TRK-139", icon: "plus.circle"),
                            ProjectEvent(user: users[1], date: ago(hours: 30),
                                         text: "Outlook fix is trickier than expected — the VML fallback breaks the rounded corners."),
                            ProjectEvent(user: users[1], date: ago(hours: 26),
                                         text: "logged 45m on TRK-139", icon: "clock"),
                            ProjectEvent(user: users[0], date: ago(hours: 4),
                                         text: "changed status of TRK-131 to In Review",
                                         icon: "arrow.triangle.2.circlepath"),
                            ProjectEvent(user: users[2], date: ago(hours: 2),
                                         text: "was added to the project", icon: "person.badge.plus"),
                        ]),
            ProjectItem(key: "MOB", name: "Mobile App", color: Color(hex: 0x7A9CF0),
                        about: "Native iOS app in SwiftUI plus the /api/v1 bearer surface.",
                        status: .active, lead: users[0], members: [users[0], users[2]],
                        updatedAt: ago(hours: 1), isFavorite: true,
                        history: [
                            ProjectEvent(user: users[0], date: ago(hours: 20),
                                         text: "created TRK-142", icon: "plus.circle"),
                            ProjectEvent(user: users[0], date: ago(hours: 1),
                                         text: "First native screens are on TestFlight-ready footing — tasks, filters, detail, comments."),
                        ]),
            ProjectItem(key: "INF", name: "Infrastructure", color: Color(hex: 0x7FC8A9),
                        about: "Servers, Postgres, Stalwart mail and deployments.",
                        status: .active, lead: users[1], members: [users[1]],
                        updatedAt: ago(hours: 26), isFavorite: true),
            ProjectItem(key: "MEDIZ", name: "Medizell Website", color: Color(hex: 0xC08BD6),
                        about: "Redesign with a new tech stack — no rework, fresh build.",
                        status: .planned, lead: users[2], members: [users[2], users[1]],
                        updatedAt: ago(hours: 3 * 24)),
            ProjectItem(key: "KHZ", name: "KiloHertz Site", color: Color(hex: 0xE9C46A),
                        about: "Marketing site refresh with the new brand.",
                        status: .prospect, lead: users[0], members: [users[0]],
                        updatedAt: ago(hours: 10 * 24)),
            ProjectItem(key: "LEG", name: "Legacy Portal", color: Color(hex: 0x9AA4B2),
                        about: "Old customer portal, kept for reference.",
                        status: .archived, members: [users[1]],
                        updatedAt: ago(hours: 40 * 24)),
        ]
    }()
}
