//
//  AppModel.swift
//  trackr-mobile-ios
//
//  Shared app state: tasks, tab selection, tasks-tab navigation path, and
//  the running work session (the "now playing" of trackr).
//

import SwiftUI

/// Every surface hosted by the tab shell. The bottom bar shows the four
/// `mainTabs`; the rest are reached from the top bar (inbox bell, account
/// menu) and render in the same shell without a highlighted tab.
enum AppTab: Hashable, CaseIterable {
    case week, tickets, tasks, search
    case inbox, projects, chat, notes, meetings, wiki, settings

    static let mainTabs: [AppTab] = [.week, .tickets, .tasks, .search]

    var title: String {
        switch self {
        case .week: "My week"
        case .tickets: "Tickets"
        case .tasks: "Tasks"
        case .search: "Search"
        case .inbox: "Inbox"
        case .projects: "Projects"
        case .chat: "Chat"
        case .notes: "Notes"
        case .meetings: "Meetings"
        case .wiki: "Wiki"
        case .settings: "Account"
        }
    }

    var systemImage: String {
        switch self {
        case .week: "calendar"
        case .tickets: "ticket"
        case .tasks: "checkmark.square"
        case .search: "magnifyingglass"
        case .inbox: "bell"
        case .projects: "folder"
        case .chat: "bubble.left.and.bubble.right"
        case .notes: "note.text"
        case .meetings: "person.2"
        case .wiki: "book"
        case .settings: "gearshape"
        }
    }
}

/// What the create sheet builds — seeded from the current tab.
enum CreateKind: String, CaseIterable, Identifiable {
    case ticket, task, session
    var id: String { rawValue }
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
    /// Seconds spent paused so far (excluded from the elapsed time).
    var pausedAccumulated: TimeInterval = 0
    /// When the current pause began; nil while recording.
    var pauseStartedAt: Date?

    var isRunning: Bool { startedAt != nil }
    var isTaskBound: Bool { taskId != nil }
    var isPaused: Bool { pauseStartedAt != nil }

    /// Instant a count-up timer should start from to show working time
    /// (start shifted by the pauses) — for `Text(_, style: .timer)`.
    var effectiveStart: Date? { startedAt.map { $0.addingTimeInterval(pausedAccumulated) } }

    /// Working time so far, frozen while paused.
    func elapsed(at now: Date) -> TimeInterval {
        guard let startedAt else { return 0 }
        let end = pauseStartedAt ?? now
        return max(0, end.timeIntervalSince(startedAt) - pausedAccumulated)
    }
}

@Observable @MainActor
final class AppModel {
    var tasks: [TaskItem] = []
    var projects: [ProjectItem] = []
    var tickets: [TicketItem] = []
    var notes: [NoteItem] = []
    var wikiPages: [WikiPageItem] = []
    var chatThreads: [ChatThread] = []
    var selectedTab: AppTab = .week
    var taskPath: [TaskItem] = []
    var ticketPath: [TicketItem] = []
    /// Navigation stacks of the other surfaces (week pushes task details,
    /// search/inbox push anything, chat pushes threads, projects push
    /// project details). Centralized so the shell knows when a detail is
    /// on top (bottom chrome hides) and deep links can push into them.
    var weekPath = NavigationPath()
    var searchPath = NavigationPath()
    var inboxPath = NavigationPath()
    var projectsPath = NavigationPath()
    var chatPath = NavigationPath()
    var notesPath = NavigationPath()
    var meetingsPath = NavigationPath()
    var wikiPath = NavigationPath()
    var settingsPath = NavigationPath()

    /// True while the selected surface shows a pushed detail — the tab bar
    /// and top bar belong to the roots only (prototype: details are full
    /// screen with their own bottom composer).
    var isShowingDetail: Bool {
        switch selectedTab {
        case .tasks: !taskPath.isEmpty
        case .tickets: !ticketPath.isEmpty
        case .week: !weekPath.isEmpty
        case .search: !searchPath.isEmpty
        case .inbox: !inboxPath.isEmpty
        case .projects: !projectsPath.isEmpty
        case .chat: !chatPath.isEmpty
        case .notes: !notesPath.isEmpty
        case .meetings: !meetingsPath.isEmpty
        case .wiki: !wikiPath.isEmpty
        case .settings: !settingsPath.isEmpty
        }
    }

    /// Switch to a surface at its root (top-bar menu items).
    func go(_ tab: AppTab) {
        selectedTab = tab
        showingWorkspaces = false
        showingAccountMenu = false
    }

    /// Open a task's detail on the Tasks tab from anywhere.
    func open(_ task: TaskItem) {
        selectedTab = .tasks
        taskPath = [task]
    }

    /// Open a ticket's detail on the Tickets tab from anywhere.
    func open(_ ticket: TicketItem) {
        selectedTab = .tickets
        ticketPath = [ticket]
    }

    // Shell overlays (top-bar popovers, create sheet, toast).
    var showingWorkspaces = false
    var showingAccountMenu = false
    var showingCreate = false
    var createKind: CreateKind = .task
    /// The list/detail that was on screen when "+" was tapped — the create
    /// sheet seeds its scope from it.
    var createProjectName: String?
    var createOrgKey: String?
    /// Week "+ Add task": the day the new task is planned for.
    var createPlannedFor: Date?

    private(set) var toastMessage: String?
    private var toastTask: Task<Void, Never>?

    /// Transient confirmation pill above the bottom chrome (~1.8 s).
    func toast(_ message: String) {
        toastTask?.cancel()
        toastMessage = message
        toastTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1.8))
            guard !Task.isCancelled else { return }
            self?.toastMessage = nil
        }
    }

    /// "+" on the tab bar: ticket on the tickets tab, otherwise a task.
    /// Screens pass their scope (project page, week day, org) as seeds; the
    /// seeds are cleared when the sheet closes (`clearCreateSeeds`).
    func presentCreate(kind: CreateKind? = nil, projectName: String? = nil,
                       orgKey: String? = nil, plannedFor: Date? = nil) {
        createKind = kind ?? (selectedTab == .tickets ? .ticket : .task)
        createProjectName = projectName
        createOrgKey = orgKey
        createPlannedFor = plannedFor
        showingCreate = true
    }

    func clearCreateSeeds() {
        createProjectName = nil
        createOrgKey = nil
        createPlannedFor = nil
    }
    /// Mirrored to disk on every change so a killed process can resume it
    /// (SessionStore) — the Live Activity keeps counting meanwhile.
    var session = WorkSession() {
        didSet { if persistsSession { SessionStore.save(session) } }
    }
    /// Sample-data runs (previews, `--sample-data`) never write the session
    /// to disk — a sample task would otherwise resurface after sign-in.
    private let persistsSession: Bool
    var showingPlayer = false

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
    /// Server branding name (GET /api/v1/instance) — the top bar's workspace
    /// label; falls back to the host.
    var workspaceName: String?
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
        persistsSession = !sampleData
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
            workspaceName = "KiloHertz GmbH"
        }
    }

    /// Top-bar label: branding name, else the server host, else "trackr".
    var workspaceLabel: String {
        if let workspaceName, !workspaceName.isEmpty { return workspaceName }
        return ServerConfig.savedHost?.host() ?? "trackr"
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

    /// Optimistically insert a locally-built task and push it to the server.
    /// Shared by the Tasks list and the project detail page so both create
    /// paths stay identical.
    func addTask(_ task: TaskItem, files: [PickedFile] = []) {
        tasks.insert(task, at: 0)
        guard let key = projects.first(where: { $0.name == task.project })?.key else { return }
        sync?.createTask(
            title: task.title,
            projectKey: key,
            description: task.details.isEmpty ? nil : task.details,
            status: task.status,
            priority: task.priority,
            type: task.type,
            due: task.due,
            plannedFor: task.plannedFor,
            estimate: task.estimate,
            assignees: task.assignees,
            tags: task.tags,
            checklist: task.checklist,
            files: files
        )
    }

    /// Optimistically insert a locally-built ticket and push it to the
    /// server (with staged files in the same request).
    func addTicket(_ ticket: TicketItem, files: [PickedFile] = []) {
        tickets.insert(ticket, at: 0)
        guard let orgId = ticket.org.serverId else { return }
        sync?.createTicket(
            orgId: orgId,
            subject: ticket.subject,
            description: ticket.messages.first?.text,
            priority: ticket.priority,
            category: ticket.category,
            assignees: ticket.assignees,
            files: files
        )
    }

    func addProjectComment(projectKey: String, text: String) {
        guard let index = projects.firstIndex(where: { $0.key == projectKey }) else { return }
        projects[index].history.append(
            ProjectEvent(user: me, date: .now, text: text)
        )
        projects[index].updatedAt = .now
        sync?.addProjectComment(projectKey: projectKey, text: text)
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
            selectedTab = .chat
            var fresh = NavigationPath()
            if parts.count > 1, let thread = chatThreads.first(where: { $0.id == parts[1] }) {
                fresh.append(thread)
            }
            chatPath = fresh
        case "inbox":
            selectedTab = .inbox
            inboxPath = NavigationPath()
        case "week":
            selectedTab = .week
        case "projects":
            selectedTab = .projects
        default:
            selectedTab = .week
        }
    }

    /// Pause / resume the running session (mini bar + session sheet).
    func togglePause() {
        guard session.isRunning else { return }
        if let pauseStartedAt = session.pauseStartedAt {
            session.pausedAccumulated += Date.now.timeIntervalSince(pauseStartedAt)
            session.pauseStartedAt = nil
        } else {
            session.pauseStartedAt = .now
        }
    }

    /// App launch: pick up a session the previous process left running.
    func restoreSession() {
        guard !session.isRunning, let saved = SessionStore.restore(author: me) else { return }
        session = saved
    }

    /// After the task list is loaded: a restored session bound to a task
    /// that no longer exists (deleted, or from another account) is dropped.
    func pruneOrphanedSession() {
        guard let taskId = session.taskId, !tasks.isEmpty,
              !tasks.contains(where: { $0.id == taskId }) else { return }
        session = WorkSession()
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
        guard session.startedAt != nil, let project = session.project else { return }
        let minutes = max(1, Int(session.elapsed(at: .now) / 60))
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
