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
    case allProjects, notes, meetings, wiki, chat
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

@Observable
final class AppModel {
    var tasks = TaskItem.samples
    var projects = ProjectItem.samples
    var tickets = TicketItem.samples
    var notes = NoteItem.samples
    var wikiPages = WikiPageItem.samples
    var chatThreads = ChatThread.samples
    var selectedTab: AppTab = .home
    var taskPath: [TaskItem] = []
    var session = WorkSession()
    var showingPlayer = false

    var favoriteProjects: [ProjectRef] {
        projects.filter(\.isFavorite).map(\.ref)
    }

    func toggleFavorite(projectKey: String) {
        guard let index = projects.firstIndex(where: { $0.key == projectKey }) else { return }
        projects[index].isFavorite.toggle()
    }

    func addProjectComment(projectKey: String, text: String) {
        guard let index = projects.firstIndex(where: { $0.key == projectKey }) else { return }
        projects[index].history.append(
            ProjectEvent(user: TaskItem.sampleUsers[0], date: .now, text: text)  // current user later
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
        let me = TaskItem.sampleUsers[0]  // current user later
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
    }
}
