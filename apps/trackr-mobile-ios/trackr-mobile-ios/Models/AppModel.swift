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
    /// Local id of the task this session was started from (nil = free
    /// session that materializes into a new task on Done).
    var taskId: String?
    var isRunning: Bool { startedAt != nil }
    var isTaskBound: Bool { taskId != nil }
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
    var ticketPath: [TicketItem] = []
    var homePath = NavigationPath()
    var session = WorkSession()
    var showingPlayer = false
    /// A chat thread is on top of the home stack — HomeView hides the tab
    /// bar while set; cleared when the path pops (see HomeView).
    var chatThreadOpen = false

    // Per-page view state, shared across tab switches and synced with the
    // web's view_state (SyncEngine persists it locally + server-side).
    var taskFilters = TaskFilters() {
        didSet { if taskFilters != oldValue { sync?.filtersChanged(.tasks) } }
    }
    var ticketFilters = TicketFilters() {
        didSet { if ticketFilters != oldValue { sync?.filtersChanged(.tickets) } }
    }
    var projectFilters = ProjectFilters() {
        didSet { if projectFilters != oldValue { sync?.filtersChanged(.projects) } }
    }
    var savedTaskViews: [SavedViewEntry] = []
    var savedTicketViews: [SavedViewEntry] = []
    var savedProjectViews: [SavedViewEntry] = []

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

    /// Deep-link from a tapped push notification: `url` is the server's
    /// in-app route (e.g. "/tickets/<uuid>"). Switches tab and pushes the
    /// entity's detail, fetching it first when it isn't loaded yet.
    func handlePushURL(_ raw: String) {
        let path = raw.hasPrefix("http") ? (URL(string: raw)?.path ?? raw) : raw
        let parts = path.split(separator: "/").map(String.init)
        switch parts.first {
        case "tickets":
            selectedTab = .tickets
            guard parts.count > 1 else { return }
            let id = parts[1]
            if let ticket = tickets.first(where: { $0.uuid == id || $0.id == id }) {
                ticketPath = [ticket]
            } else {
                Task {
                    await sync?.loadTicketDetail(uuid: id)
                    if let ticket = tickets.first(where: { $0.uuid == id }) {
                        ticketPath = [ticket]
                    }
                }
            }
        case "tasks":
            selectedTab = .tasks
            guard parts.count > 1 else { return }
            let id = parts[1]
            if let task = tasks.first(where: { $0.uuid == id || $0.id == id }) {
                taskPath = [task]
            } else {
                Task {
                    await sync?.refreshTasks()
                    if let task = tasks.first(where: { $0.uuid == id || $0.id == id }) {
                        taskPath = [task]
                    }
                }
            }
        case "chat":
            selectedTab = .home
            var fresh = NavigationPath()
            fresh.append(HomeRoute.chat)
            if parts.count > 1, let thread = chatThreads.first(where: { $0.id == parts[1] }) {
                fresh.append(thread)
            }
            homePath = fresh
        case "inbox":
            selectedTab = .home
            var fresh = NavigationPath()
            fresh.append(HomeRoute.inbox)
            homePath = fresh
        case "week":
            selectedTab = .plan
        default:
            selectedTab = .home
        }
    }

    func startSession(for project: ProjectRef) {
        guard !session.isRunning else { return }
        session = WorkSession(project: project, startedAt: .now)
    }

    /// Session bound to an existing task: Done logs the elapsed time and
    /// notes onto that task instead of creating a new one.
    func startSession(for task: TaskItem) {
        guard !session.isRunning else { return }
        let project = projects.first(where: { $0.name == task.project })?.ref
            ?? ProjectRef(name: task.project, color: .accentColor)
        session = WorkSession(project: project, title: task.title, startedAt: .now, taskId: task.id)
        showingPlayer = true
    }

    /// Bound-session outcome: log time + notes on the task; `status` nil
    /// keeps the task's current status.
    private func finishBoundSession(taskId: String, status: TaskStatus?, minutes: Int) {
        guard let index = tasks.firstIndex(where: { $0.id == taskId }) else { return }
        let log = TimeLog(user: me, minutes: minutes, date: .now)
        tasks[index].timeLogs.append(log)
        tasks[index].comments.append(contentsOf: session.notes)
        let statusChanged = status.map { $0 != tasks[index].status } ?? false
        if let status { tasks[index].status = status }
        let task = tasks[index]
        sessionEnding = true
        showingPlayer = false
        selectedTab = .tasks
        taskPath = [task]
        guard let uuid = task.uuid, let sync else { return }
        for note in session.notes {
            sync.sendTaskComment(taskUUID: uuid, text: note.text)
        }
        if statusChanged { sync.pushTask(task) }
        sync.logTime(taskUUID: uuid, minutes: minutes, date: log.date, note: nil)
    }

    /// Closes the player; the session itself is cleared in
    /// `clearSessionAfterDismiss` once the cover has slid away, so the
    /// content doesn't blank out mid-animation.
    func discardSession() {
        sessionEnding = true
        showingPlayer = false
    }

    /// Set while the player is dismissing after Done/Discard — the
    /// fullScreenCover's onDismiss resets the session then.
    var sessionEnding = false

    func clearSessionAfterDismiss() {
        guard sessionEnding else { return }
        sessionEnding = false
        session = WorkSession()
    }

    /// Materialize the session into a task — elapsed time becomes a time
    /// log, session notes become comments — and open its detail page.
    func finishSession(as status: TaskStatus?) {
        guard let startedAt = session.startedAt, let project = session.project else { return }
        let minutes = max(1, Int(Date.now.timeIntervalSince(startedAt) / 60))
        if let taskId = session.taskId {
            finishBoundSession(taskId: taskId, status: status, minutes: minutes)
            return
        }
        let nextNumber = tasks
            .compactMap { Int($0.id.split(separator: "-").last ?? "") }
            .max()
            .map { $0 + 1 } ?? 1
        let title = session.title.trimmingCharacters(in: .whitespaces)
        let task = TaskItem(
            id: "TRK-\(nextNumber)",
            title: title.isEmpty ? "Work session" : title,
            status: status ?? .inProgress,
            priority: .none,
            type: .task,
            project: project.name,
            assignees: [me],
            timeLogs: [TimeLog(user: me, minutes: minutes, date: .now)],
            comments: session.notes
        )
        tasks.insert(task, at: 0)
        sessionEnding = true
        showingPlayer = false
        selectedTab = .tasks
        taskPath = [task]
        // Materialize server-side; the placeholder row is replaced when the
        // refetch lands (see SyncEngine.pushWorkSession).
        let projectKey = projects.first(where: { $0.name == project.name })?.key
        sync?.pushWorkSession(task: task, projectKey: projectKey)
    }
}
