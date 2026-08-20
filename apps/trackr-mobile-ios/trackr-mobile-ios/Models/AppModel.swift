//
//  AppModel.swift
//  trackr-mobile-ios
//
//  Shared app state: tasks, tab selection, tasks-tab navigation path, and
//  the running work session (the "now playing" of trackr).
//

import SwiftUI

enum AppTab: Hashable {
    case home, tickets, tasks, plan, search
}

/// Value-based routes for the Home tab's navigation stack.
enum HomeRoute: Hashable {
    case allProjects, notes, meetings, wiki, chat, inbox
}

struct ProjectRef: Identifiable, Hashable {
    let name: String
    let color: Color
    var id: String { name }
    var initial: String { String(name.prefix(1)) }
}

struct WorkSession {
    var project: ProjectRef?
    var title = ""
    var startedAt: Date?
    var notes: [TaskComment] = []
    var isRunning: Bool { startedAt != nil }
}

@Observable @MainActor
final class AppModel {
    var tasks: [TaskItem] = []
    var projects: [ProjectItem] = []
    var tickets: [TicketItem] = []
    var notes: [NoteItem] = []
    var wikiPages: [WikiPageItem] = []
    var chatThreads: [ChatThread] = []
    var selectedTab: AppTab = .home
    var taskPath: [TaskItem] = []
    var session = WorkSession()
    var showingPlayer = false

    // Session context, filled by SyncEngine from /api/v1/me.
    var currentUser: UserRef?
    var currentUserEmail = ""
    var isStaff = true
    var unreadCount = 0
    var orgs: [OrgRef] = []
    var assignableUsers: [UserRef] = []
    var chatTags: [ChatTag] = []
    /// Set when the app runs against a real server; nil in previews.
    weak var sync: SyncEngine?
    /// Wired by RootView — the profile sheet's Sign Out calls it.
    var onSignOut: (() -> Void)?

    /// Previews and design work run on the bundled sample data; the real app
    /// starts empty and is filled by SyncEngine (cache first, then network).
    init(sampleData: Bool = true) {
        if sampleData {
            tasks = TaskItem.samples
            projects = ProjectItem.samples
            tickets = TicketItem.samples
            notes = NoteItem.samples
            wikiPages = WikiPageItem.samples
            chatThreads = ChatThread.samples
            currentUser = TaskItem.sampleUsers[0]
            orgs = TicketItem.sampleOrgs
            assignableUsers = TaskItem.sampleUsers
            chatTags = ChatThread.sampleTags
        }
    }

    var me: UserRef { currentUser ?? TaskItem.sampleUsers[0] }

    var favoriteProjects: [ProjectRef] {
        projects.filter(\.isFavorite).map(\.ref)
    }

    func toggleFavorite(projectKey: String) {
        guard let index = projects.firstIndex(where: { $0.key == projectKey }) else { return }
        projects[index].isFavorite.toggle()
        sync?.setFavorite(projectKey: projectKey, favorite: projects[index].isFavorite)
    }

    func addProjectComment(projectKey: String, text: String) {
        guard let index = projects.firstIndex(where: { $0.key == projectKey }) else { return }
        projects[index].history.append(
            ProjectEvent(user: me, date: .now, text: text)
        )
        projects[index].updatedAt = .now
    }

    func startSession(for project: ProjectRef) {
        guard !session.isRunning else { return }
        session = WorkSession(project: project, startedAt: .now)
    }

    func discardSession() {
        session = WorkSession()
        showingPlayer = false
    }

    /// Materialize the session into a task — elapsed time becomes a time
    /// log, session notes become comments — and open its detail page.
    func finishSession(as status: TaskStatus) {
        guard let startedAt = session.startedAt, let project = session.project else { return }
        let minutes = max(1, Int(Date.now.timeIntervalSince(startedAt) / 60))
        let nextNumber = tasks
            .compactMap { Int($0.id.split(separator: "-").last ?? "") }
            .max()
            .map { $0 + 1 } ?? 1
        let title = session.title.trimmingCharacters(in: .whitespaces)
        let task = TaskItem(
            id: "TRK-\(nextNumber)",
            title: title.isEmpty ? "Work session" : title,
            status: status,
            priority: .none,
            type: .task,
            project: project.name,
            assignees: [me],
            timeLogs: [TimeLog(user: me, minutes: minutes, date: .now)],
            comments: session.notes
        )
        tasks.insert(task, at: 0)
        session = WorkSession()
        showingPlayer = false
        selectedTab = .tasks
        taskPath = [task]
        // Materialize server-side; the placeholder row is replaced when the
        // refetch lands (see SyncEngine.pushWorkSession).
        let projectKey = projects.first(where: { $0.name == project.name })?.key
        sync?.pushWorkSession(task: task, projectKey: projectKey)
    }
}
