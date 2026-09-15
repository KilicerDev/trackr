//
//  SyncEngine.swift
//  trackr-mobile-ios
//
//  Data orchestration between the API client and the UI's AppModel:
//    · bootstraps every screen instantly from the JSON snapshot cache
//    · revalidates on events, never on timers — launch/foreground, screen
//      appear, after every mutation, pull-to-refresh, and SSE pushes
//    · applies mutations optimistically (the view already updated the model;
//      the engine pushes and then refetches the truth)
//
//  The SSE stream (/api/v1/events) delivers tiny invalidation hints while
//  the app is foregrounded; each hint triggers a refetch of just the domain
//  it names.
//

import Foundation
import SwiftUI
import UserNotifications

/// The view_state page keys the app manages (web ALLOWED_KEYS subset).
enum ViewKey: String, CaseIterable {
    case tasks, tickets, projects
}

@MainActor @Observable
final class SyncEngine {
    private let client: APIClient
    private let store: SnapshotStore
    private let model: AppModel

    private(set) var me: API.Me?
    /// True from start() until the first refresh completes, but only when
    /// the snapshot cache was empty — the boot screen stays up meanwhile.
    /// Capped so a stalled network never traps the user on it.
    private(set) var isColdStarting = false
    private var eventTask: Task<Void, Never>?
    private var favoriteKeys: Set<String> {
        get { Set(UserDefaults.standard.stringArray(forKey: "trackr.favoriteProjects") ?? []) }
        set { UserDefaults.standard.set(Array(newValue), forKey: "trackr.favoriteProjects") }
    }
    /// Latest per-org chat directories, needed to map new messages.
    private var chatContext: [String: API.ChatFeedResponse] = [:]

    init(client: APIClient, model: AppModel, host: URL) {
        self.client = client
        self.model = model
        self.store = SnapshotStore(host: host)
        model.sync = self
    }

    // MARK: - Lifecycle

    /// Cache-first startup: paint every screen from the last snapshot, then
    /// refresh everything and open the live event stream.
    func start() async {
        let hadCache = bootstrapFromCache()
        isColdStarting = !hadCache
        model.workspaceName = UserDefaults.standard.string(forKey: "trackr.workspaceName")
        model.workspaceLogoURL = UserDefaults.standard.string(forKey: "trackr.workspaceLogo").flatMap { URL(string: $0) }
        Task { [weak self] in
            guard let self, let instance = try? await client.instance() else { return }
            if let name = instance.branding?.name, !name.isEmpty {
                model.workspaceName = name
                UserDefaults.standard.set(name, forKey: "trackr.workspaceName")
            }
            // Server contract: name is never empty ("Trackr" when unset),
            // logoUrl is null without an uploaded logo → the trackr bars.
            let logo = instance.branding?.logoUrl.flatMap { URL(string: $0) }
            model.workspaceLogoURL = logo
            UserDefaults.standard.set(logo?.absoluteString, forKey: "trackr.workspaceLogo")
        }
        let cap = Task {  [weak self] in
            try? await Task.sleep(for: .seconds(6))
            self?.isColdStarting = false
        }
        await refreshAll()
        cap.cancel()
        isColdStarting = false
        startEventStream()
    }

    func stop() {
        eventTask?.cancel()
        eventTask = nil
    }

    func appDidForeground() {
        Task {
            await refreshAll()
        }
        startEventStream()
    }

    func appDidBackground() {
        stop()
    }

    // MARK: - Cache bootstrap

    /// Returns whether anything was painted from the cache.
    @discardableResult
    private func bootstrapFromCache() -> Bool {
        if let cached = store.load("me", as: API.Me.self) {
            apply(me: cached)
        }
        if let cached = store.load("views", as: API.ViewStateResponse.self) {
            apply(views: cached)
        }
        if let cached = store.load("projects", as: API.ProjectsResponse.self) {
            apply(projects: cached)
        }
        if let cached = store.load("tasks", as: API.TasksResponse.self) {
            apply(tasks: cached)
        }
        if let cached = store.load("tickets", as: API.TicketsResponse.self) {
            apply(tickets: cached)
        }
        if let cached = store.load("notes", as: API.NotesListResponse.self) {
            apply(notes: cached)
        }
        if let cached = store.load("wiki", as: API.WikiTreeResponse.self) {
            apply(wiki: cached)
        }
        let orgIds = me?.orgs.map(\.id) ?? []
        var threads: [ChatThread] = []
        for orgId in orgIds {
            if let cached = store.load("chat-\(orgId)", as: API.ChatFeedResponse.self) {
                chatContext[orgId] = cached
                threads.append(contentsOf: mapChat(cached, orgId: orgId))
            }
        }
        if !threads.isEmpty { model.chatThreads = sortThreads(threads) }
        return me != nil || !model.projects.isEmpty || !model.tasks.isEmpty
    }

    // MARK: - Refresh (event-driven, never polled)

    func refreshAll() async {
        await refreshMe()
        // Projects before tasks: task rows resolve project keys to names.
        await refreshProjects()
        async let tasks: Void = refreshTasks()
        async let tickets: Void = refreshTickets()
        async let chat: Void = refreshChat()
        async let notes: Void = refreshNotes()
        async let wiki: Void = refreshWiki()
        async let views: Void = refreshViews()
        _ = await (tasks, tickets, chat, notes, wiki, views)
        // Directories (projects, user ids) are loaded now — the cached
        // filters can resolve their ids.
        restoreFiltersIfNeeded()
    }

    func refreshMe() async {
        guard let fresh = try? await client.me() else { return }
        store.save("me", fresh)
        apply(me: fresh)
    }

    func refreshProjects() async {
        guard let fresh = try? await client.projects() else { return }
        store.save("projects", fresh)
        apply(projects: fresh)
    }

    func refreshTasks() async {
        guard let fresh = try? await client.tasks() else { return }
        store.save("tasks", fresh)
        apply(tasks: fresh)
        model.pruneOrphanedSession()
    }

    func refreshTickets() async {
        guard let fresh = try? await client.tickets() else { return }
        store.save("tickets", fresh)
        apply(tickets: fresh)
    }

    func refreshChat() async {
        guard let me else { return }
        var threads: [ChatThread] = []
        var tags: [ChatTag] = []
        for org in me.orgs {
            // Orgs without chat access 403 — skip them silently.
            guard let feed = try? await client.chatFeed(orgId: org.id) else { continue }
            store.save("chat-\(org.id)", feed)
            chatContext[org.id] = feed
            threads.append(contentsOf: mapChat(feed, orgId: org.id))
            tags.append(contentsOf: feed.tags.map {
                ChatTag(label: $0.label, color: Color(css: $0.color, default: Color(hex: 0x7A9CF0)))
            })
        }
        model.chatThreads = sortThreads(threads)
        model.chatTags = tags
    }

    func refreshNotes() async {
        guard me?.capabilities.surfaces.notes ?? false else { return }
        guard let fresh = try? await client.notesList() else { return }
        store.save("notes", fresh)
        apply(notes: fresh)
    }

    func refreshWiki() async {
        guard me?.capabilities.surfaces.wiki ?? false else { return }
        guard let fresh = try? await client.wikiTree() else { return }
        store.save("wiki", fresh)
        apply(wiki: fresh)
    }

    func refreshBadge() async {
        guard let badge = try? await client.inboxBadge() else { return }
        model.unreadCount = badge.unread
        // Keep the app icon badge in sync — pushes set it (aps.badge), and
        // reading on any device clears it here via the SSE inbox hint.
        try? await UNUserNotificationCenter.current().setBadgeCount(badge.unread)
    }

    func refreshViews() async {
        guard let fresh = try? await client.views() else { return }
        store.save("views", fresh)
        apply(views: fresh)
    }

    // MARK: - Detail loads (screen-appear revalidation)

    /// Ticket conversations aren't in the list payload — load them when the
    /// detail opens and merge into the model row.
    func loadTicketDetail(uuid: String) async {
        guard let detail = try? await client.ticket(uuid: uuid) else { return }
        var mapped = Mapper.ticket(detail.ticket, users: detail.authors, messages: detail.messages)
        mapped.serverMessageCount = nil
        mapped.attachments = (detail.attachments ?? []).map(Mapper.attachment)
        mapped.linkedTasks = (detail.linkedTasks ?? []).map {
            ConversionLink(
                uuid: $0.id,
                displayId: $0.displayId,
                title: $0.title,
                status: TaskStatus(api: $0.status) ?? .todo
            )
        }
        if let index = model.tickets.firstIndex(where: { $0.uuid == uuid }) {
            model.tickets[index] = mapped
        } else {
            model.tickets.insert(mapped, at: 0)
        }
        if !detail.assignableUsers.isEmpty {
            model.assignableUsers = detail.assignableUsers.map(Mapper.user)
        }
    }

    func loadTaskDetail(uuid: String) async {
        guard let detail = try? await client.task(uuid: uuid) else { return }
        var mapped = Mapper.task(detail.task, users: detail.authors, projectName: projectName)
        mapped.attachments = (detail.attachments ?? []).map(Mapper.attachment)
        if let index = model.tasks.firstIndex(where: { $0.uuid == uuid }) {
            model.tasks[index] = mapped
        }
        if !detail.assignableUsers.isEmpty {
            model.assignableUsers = detail.assignableUsers.map(Mapper.user)
        }
    }

    func loadNoteBody(id: String) async {
        guard let response = try? await client.note(id: id) else { return }
        let merge: (inout [NoteItem]) -> Void = { notes in
            if let index = notes.firstIndex(where: { $0.id == id }) {
                notes[index] = Mapper.noteDetail(response.note, into: notes[index])
            }
        }
        merge(&model.notes)
    }

    func loadWikiBody(id: String) async {
        guard let response = try? await client.wikiPage(id: id) else { return }
        if let index = model.wikiPages.firstIndex(where: { $0.id == id }) {
            model.wikiPages[index].bodyHtml = response.page.bodyHtml
            model.wikiPages[index].updatedAt = APIDate.parse(response.page.updatedAt) ?? .now
        }
    }

    func loadChatThread(id: String) async {
        guard let detail = try? await client.chatThread(id: id) else { return }
        if let index = model.chatThreads.firstIndex(where: { $0.id == id }) {
            model.chatThreads[index].messages = detail.messages.map {
                Mapper.chatMessage($0, authors: detail.authors)
            }
            model.chatThreads[index].unread = false
        }
    }

    // MARK: - Mutations (optimistic in the view, pushed + refetched here)

    /// Pushes every app-editable field of a task. The server ignores no-op
    /// values (same status → no notification), so sending the full editable
    /// set keeps call sites trivial.
    func pushTask(_ task: TaskItem) {
        guard let uuid = task.uuid else { return }
        var patch = APIClient.TaskPatch(
            status: task.status.apiValue,
            priority: task.priority.apiValue,
            type: task.type.apiValue,
            description: task.details,
            due: .some(task.due.map { APIDate.dayString($0) }),
            estimate: .some(task.estimate),
            tags: task.tags,
            checklist: task.checklist.map {
                API.ChecklistEntry(id: $0.id, text: $0.text, done: $0.done)
            },
            assigneeIds: task.assignees.compactMap(\.serverId),
            plannedFor: .some(task.plannedFor.map { APIDate.dayString($0) })
        )
        // Title can't be cleared server-side — only send a non-empty edit.
        let title = task.title.trimmingCharacters(in: .whitespaces)
        if !title.isEmpty { patch.title = title }
        Task {
            try? await client.updateTask(uuid: uuid, patch: patch)
            await refreshTasks()
        }
    }

    /// Ticket checklist edits have their own endpoint (participant-editable,
    /// unlike the agent-only property PATCH). Whole-array replace.
    func pushTicketChecklist(_ ticket: TicketItem) {
        guard let uuid = ticket.uuid else { return }
        let items = ticket.checklist.map {
            API.ChecklistEntry(id: $0.id, text: $0.text, done: $0.done)
        }
        Task {
            do {
                try await client.updateTicketChecklist(uuid: uuid, items: items)
            } catch {
                print("[sync] ticket checklist push failed:", error)
            }
        }
    }

    func pushTicket(_ ticket: TicketItem) {
        guard let uuid = ticket.uuid else { return }
        let patch = APIClient.TicketPatch(
            status: ticket.status.apiValue,
            priority: ticket.priority.apiValue,
            category: ticket.category.apiValue,
            assigneeIds: ticket.assignees.compactMap(\.serverId),
            tags: ticket.tags
        )
        Task {
            try? await client.updateTicket(uuid: uuid, patch: patch)
            await loadTicketDetail(uuid: uuid)
        }
    }

    /// Optimistic delete: the card disappears immediately, the server soft
    /// delete follows; the refetch confirms it (or resurrects the row when
    /// the server refused, e.g. missing the delete grant).
    func deleteTask(_ task: TaskItem) {
        model.tasks.removeAll { $0.id == task.id }
        guard let uuid = task.uuid else { return }
        Task {
            try? await client.deleteTask(uuid: uuid)
            await refreshTasks()
        }
    }

    func deleteTicket(_ ticket: TicketItem) {
        model.tickets.removeAll { $0.id == ticket.id }
        guard let uuid = ticket.uuid else { return }
        Task {
            try? await client.deleteTicket(uuid: uuid)
            await refreshTickets()
        }
    }

    /// Files ride along in the same request (multipart) so the server has
    /// them before it fans out — the webhook payload lists them.
    func sendTaskComment(taskUUID: String, text: String, files: [PickedFile] = []) {
        Task {
            guard (try? await client.addTaskComment(uuid: taskUUID, text: text, files: files)) != nil
            else { return }
            await loadTaskDetail(uuid: taskUUID)
        }
    }

    func logTime(taskUUID: String, minutes: Int, date: Date, note: String?) {
        Task {
            try? await client.logTaskTime(uuid: taskUUID, minutes: minutes, date: date, note: note)
            await refreshTasks()
        }
    }

    func sendTicketMessage(
        ticketUUID: String, text: String, internalNote: Bool, files: [PickedFile] = []
    ) {
        Task {
            guard (try? await client.addTicketMessage(
                uuid: ticketUUID, text: text, internalNote: internalNote, files: files
            )) != nil else { return }
            await loadTicketDetail(uuid: ticketUUID)
        }
    }

    func sendChatMessage(threadId: String, text: String, files: [PickedFile] = []) {
        Task {
            guard (try? await client.addChatMessage(threadId: threadId, text: text, files: files)) != nil
            else { return }
            await loadChatThread(id: threadId)
        }
    }

    /// Create a task with the sheet's full field set + staged files in one
    /// multipart POST (the v1 endpoint accepts the same fields as the web
    /// create action; files attach server-side before the `task.created`
    /// webhook fires). Checklist still lands via a follow-up PATCH — the
    /// create endpoint doesn't take one, matching the web modal.
    func createTask(
        title: String,
        projectKey: String,
        description: String?,
        status: TaskStatus,
        priority: TaskPriority,
        type: TaskType,
        due: Date?,
        plannedFor: Date? = nil,
        estimate: Int?,
        assignees: [UserRef],
        tags: [String] = [],
        checklist: [ChecklistItem],
        files: [PickedFile] = []
    ) {
        Task {
            let created: API.CreatedResponse
            do {
                created = try await client.createTask(
                    .init(
                        title: title,
                        projectKey: projectKey,
                        description: description,
                        status: status.apiValue,
                        priority: priority.apiValue,
                        type: type.apiValue,
                        due: due.map { APIDate.dayString($0) },
                        estimate: estimate,
                        tags: tags.isEmpty ? nil : tags,
                        assigneeIds: assignees.compactMap(\.serverId),
                        plannedFor: plannedFor.map { APIDate.dayString($0) }
                    ),
                    files: files
                )
            } catch {
                print("[sync] task create failed (\(files.count) files):", error)
                return
            }
            if !checklist.isEmpty {
                var patch = APIClient.TaskPatch()
                patch.checklist = checklist.map {
                    API.ChecklistEntry(id: $0.id, text: $0.text, done: $0.done)
                }
                try? await client.updateTask(uuid: created.id, patch: patch)
            }
            await refreshTasks()
        }
    }

    /// Convert a ticket into a linked project task (staff-only server-side).
    /// The server carries the open checklist + attachments and drops an
    /// internal breadcrumb note on the ticket, so refresh both sides.
    func convertTicketToTask(
        ticketUUID: String,
        title: String,
        projectKey: String,
        description: String?,
        status: TaskStatus,
        priority: TaskPriority,
        type: TaskType,
        due: Date?,
        estimate: Int?,
        assignees: [UserRef]
    ) {
        Task {
            do {
                let created = try await client.convertTicketToTask(
                    uuid: ticketUUID,
                    body: .init(
                        title: title,
                        projectKey: projectKey,
                        description: description,
                        status: status.apiValue,
                        priority: priority.apiValue,
                        type: type.apiValue,
                        due: due.map { APIDate.dayString($0) },
                        estimate: estimate,
                        assigneeIds: assignees.compactMap(\.serverId)
                    )
                )
                print("[sync] ticket→task created \(created.displayId ?? created.id)")
            } catch {
                print("[sync] ticket→task convert failed:", error)
                return
            }
            await refreshTasks()
            await loadTicketDetail(uuid: ticketUUID)
        }
    }

    /// One multipart POST with the sheet's fields + staged files — the
    /// v1 endpoint attaches them before the `ticket.created` webhook fires
    /// so the payload carries their URLs. Assignees go in the same request
    /// (agents only; the server ignores them for customers).
    func createTicket(
        orgId: String,
        subject: String,
        description: String?,
        priority: TaskPriority,
        category: TicketCategory,
        assignees: [UserRef],
        files: [PickedFile] = []
    ) {
        Task {
            let assigneeIds = assignees.compactMap(\.serverId)
            do {
                _ = try await client.createTicket(
                    .init(
                        orgId: orgId,
                        subject: subject,
                        description: description,
                        priority: priority.apiValue,
                        category: category.apiValue,
                        assigneeIds: assigneeIds.isEmpty ? nil : assigneeIds
                    ),
                    files: files
                )
            } catch {
                print("[sync] ticket create failed (\(files.count) files):", error)
                return
            }
            await refreshTickets()
        }
    }

    func createChatThread(orgId: String, title: String, body: String) {
        Task {
            _ = try? await client.createChatThread(orgId: orgId, title: title, body: body)
            await refreshChat()
        }
    }

    func createQuickNote(title: String, body: String?) {
        Task {
            _ = try? await client.createQuickNote(title: title, body: body)
            await refreshNotes()
        }
    }

    /// Materialize a finished work session server-side: create the task,
    /// push status, log the elapsed time, replay the notes as comments —
    /// then reload so the local placeholder becomes the real task.
    func pushWorkSession(task: TaskItem, projectKey: String?) {
        guard let projectKey else { return }
        Task {
            guard let created = try? await client.createTask(
                .init(title: task.title, projectKey: projectKey, description: nil)
            ) else { return }
            if task.status != .todo {
                try? await client.updateTask(
                    uuid: created.id,
                    patch: .init(status: task.status.apiValue)
                )
            }
            if let log = task.timeLogs.first {
                try? await client.logTaskTime(
                    uuid: created.id, minutes: log.minutes, date: log.date, note: log.note
                )
            }
            for comment in task.comments {
                _ = try? await client.addTaskComment(uuid: created.id, text: comment.text)
            }
            await refreshTasks()
            // Swap the local placeholder in the open navigation path for the
            // real, server-backed task.
            if let real = model.tasks.first(where: { $0.uuid == created.id }),
               model.taskPath.last?.id == task.id
            {
                model.taskPath = [real]
            }
        }
    }

    // MARK: - Attachments

    /// List an entity's attachments directly — used where no detail response
    /// carries them (notes, wiki, older servers).
    func loadAttachments(entityType: AttachmentEntityType, entityId: String) async -> [AttachmentItem] {
        guard let response = try? await client.attachments(
            entityType: entityType.rawValue, entityId: entityId
        ) else { return [] }
        return response.attachments.map(Mapper.attachment)
    }

    /// Upload one file and merge the result into the entity's model row.
    /// Throws so pickers can surface size/type rejections to the user.
    func uploadAttachment(
        entityType: AttachmentEntityType,
        entityId: String,
        data: Data,
        filename: String,
        mimeType: String
    ) async throws -> AttachmentItem {
        guard data.count <= AttachmentRules.maxUploadBytes else {
            throw APIError.server(status: 413, message: "Files can be at most 25 MB.")
        }
        let dto = try await client.uploadAttachment(
            entityType: entityType.rawValue,
            entityId: entityId,
            data: data,
            filename: filename,
            mimeType: mimeType
        )
        let item = Mapper.attachment(dto)
        updateAttachments(entityType: entityType, entityId: entityId) { list in
            list.insert(item, at: 0)
        }
        return item
    }

    /// Optimistic delete, mirroring the entity delete pattern: the row
    /// disappears immediately, a failed server call resurfaces it on the
    /// next detail load.
    func deleteAttachment(_ attachment: AttachmentItem, entityType: AttachmentEntityType, entityId: String) {
        updateAttachments(entityType: entityType, entityId: entityId) { list in
            list.removeAll { $0.id == attachment.id }
        }
        Task {
            try? await client.deleteAttachment(id: attachment.id)
        }
    }

    private func updateAttachments(
        entityType: AttachmentEntityType,
        entityId: String,
        _ mutate: (inout [AttachmentItem]) -> Void
    ) {
        switch entityType {
        case .task:
            if let index = model.tasks.firstIndex(where: { $0.uuid == entityId }) {
                mutate(&model.tasks[index].attachments)
            }
        case .ticket:
            if let index = model.tickets.firstIndex(where: { $0.uuid == entityId }) {
                mutate(&model.tickets[index].attachments)
            }
        default:
            // Message/note/wiki attachments live in view-local state or the
            // next detail reload — nothing to merge here.
            break
        }
    }

    func search(_ query: String) async -> [API.SearchResult] {
        (try? await client.search(query))?.results ?? []
    }

    func fetchInbox(cursor: String?) async -> API.InboxResponse? {
        try? await client.inbox(cursor: cursor)
    }

    // MARK: - Preferences & profile

    private(set) var preferences: API.Preferences?

    func loadPreferences() async {
        if preferences == nil, let cached = store.load("preferences", as: API.Preferences.self) {
            preferences = cached
        }
        guard let fresh = try? await client.preferences() else { return }
        store.save("preferences", fresh)
        preferences = fresh
    }

    /// Optimistic: `apply` mutates the local copy immediately, the PATCH is
    /// merge-tolerant server-side, and the response is the resolved truth.
    func updatePreferences(
        _ patch: APIClient.PreferencesPatch,
        apply: ((inout API.Preferences) -> Void)? = nil
    ) {
        if var current = preferences, let apply {
            apply(&current)
            preferences = current
        }
        Task {
            guard let fresh = try? await client.updatePreferences(patch) else { return }
            store.save("preferences", fresh)
            preferences = fresh
        }
    }

    func updateProfile(name: String?) {
        if let name, let user = model.currentUser {
            model.currentUser = UserRef(
                name: name,
                initials: Mapper.initials(for: name),
                color: user.color,
                serverId: user.serverId
            )
        }
        Task {
            try? await client.updateProfile(name: name, image: nil)
            await refreshMe()
        }
    }

    func markInboxAllRead() {
        model.unreadCount = 0
        Task {
            try? await client.markInboxAllRead()
            await refreshBadge()
        }
    }

    // MARK: - Saved views & filter persistence

    /// Last server view_state snapshot, per page key.
    private var serverViewState: [String: JSONValue] = [:]
    private var filtersRestored = false
    /// Guards the didSet → filtersChanged loop while a restore/apply writes
    /// the model filters programmatically.
    private var restoringFilters = false
    private var viewPushTasks: [ViewKey: Task<Void, Never>] = [:]

    private func localViewKey(_ key: ViewKey) -> String { "trackr.view.\(key.rawValue)" }

    private func loadLocalView(_ key: ViewKey) -> JSONValue? {
        guard let data = UserDefaults.standard.data(forKey: localViewKey(key)) else { return nil }
        return try? JSONDecoder().decode(JSONValue.self, from: data)
    }

    private func saveLocalView(_ key: ViewKey, _ value: JSONValue) {
        if let data = try? JSONEncoder().encode(value) {
            UserDefaults.standard.set(data, forKey: localViewKey(key))
        }
    }

    private func apply(views fresh: API.ViewStateResponse) {
        serverViewState = fresh.viewState
        model.savedTaskViews = SavedViewEntry.list(from: fresh.viewState["tasks"])
        model.savedTicketViews = SavedViewEntry.list(from: fresh.viewState["tickets"])
        model.savedProjectViews = SavedViewEntry.list(from: fresh.viewState["projects"])
    }

    /// Called from AppModel whenever the user edits a page's filters: cache
    /// on-device immediately, push to view_state debounced (web parity:
    /// localStorage sync + 400 ms server flush).
    func filtersChanged(_ key: ViewKey) {
        guard !restoringFilters else { return }
        let directories = ViewDirectories(model: model)
        let patch: JSONValue = switch key {
        case .tasks: model.taskFilters.webPatch(directories: directories)
        case .tickets: model.ticketFilters.webPatch(directories: directories)
        case .projects: model.projectFilters.webPatch(directories: directories)
        }
        saveLocalView(key, patch)
        viewPushTasks[key]?.cancel()
        let client = self.client
        viewPushTasks[key] = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            try? await client.updateViews(key: key.rawValue, patch: patch)
        }
    }

    /// Restore last-used filters once per launch, after the directories
    /// (projects, users) are loaded so ids resolve. The device-local cache
    /// wins over the server snapshot (web parity: localStorage first).
    private func restoreFiltersIfNeeded() {
        guard !filtersRestored else { return }
        filtersRestored = true
        let directories = ViewDirectories(model: model)
        restoringFilters = true
        defer { restoringFilters = false }
        for key in ViewKey.allCases {
            guard let state = loadLocalView(key) ?? serverViewState[key.rawValue] else { continue }
            switch key {
            case .tasks:
                model.taskFilters = TaskFilters(webConfig: state, directories: directories)
            case .tickets:
                model.ticketFilters = TicketFilters(webConfig: state, directories: directories)
            case .projects:
                model.projectFilters = ProjectFilters(webConfig: state, directories: directories)
            }
        }
    }

    func savedViews(for key: ViewKey) -> [SavedViewEntry] {
        switch key {
        case .tasks: model.savedTaskViews
        case .tickets: model.savedTicketViews
        case .projects: model.savedProjectViews
        }
    }

    private func setSavedViews(_ key: ViewKey, _ views: [SavedViewEntry]) {
        switch key {
        case .tasks: model.savedTaskViews = views
        case .tickets: model.savedTicketViews = views
        case .projects: model.savedProjectViews = views
        }
    }

    /// Snapshot the page's current filters as a new saved view (web parity:
    /// ViewsMenu "Save current" appends and resends the whole array).
    func createSavedView(_ key: ViewKey, name: String) {
        let trimmed = String(name.trimmingCharacters(in: .whitespacesAndNewlines)
            .prefix(SavedViewEntry.maxNameLength))
        guard !trimmed.isEmpty else { return }
        var list = savedViews(for: key)
        guard list.count < SavedViewEntry.maxCount else { return }
        let directories = ViewDirectories(model: model)
        let config: JSONValue = switch key {
        case .tasks: model.taskFilters.webConfig(directories: directories)
        case .tickets: model.ticketFilters.webConfig(directories: directories)
        case .projects: model.projectFilters.webConfig(directories: directories)
        }
        list.append(SavedViewEntry(
            id: UUID().uuidString.lowercased(), name: trimmed, config: config
        ))
        setSavedViews(key, list)
        pushSavedViews(key, list)
    }

    func renameSavedView(_ key: ViewKey, id: String, to name: String) {
        let trimmed = String(name.trimmingCharacters(in: .whitespacesAndNewlines)
            .prefix(SavedViewEntry.maxNameLength))
        guard !trimmed.isEmpty else { return }
        var list = savedViews(for: key)
        guard let index = list.firstIndex(where: { $0.id == id }) else { return }
        list[index].name = trimmed
        setSavedViews(key, list)
        pushSavedViews(key, list)
    }

    /// Overwrite a saved view with the page's current filters. Merges the
    /// mobile-controlled fields (the same ones `webPatch` persists) into the
    /// existing config so web-only slots (board group, subgroup, …) and any
    /// keys this app doesn't know survive — web ViewsMenu "update" parity.
    func updateSavedView(_ key: ViewKey, id: String) {
        var list = savedViews(for: key)
        guard let index = list.firstIndex(where: { $0.id == id }) else { return }
        let directories = ViewDirectories(model: model)
        let patch: JSONValue = switch key {
        case .tasks: model.taskFilters.webPatch(directories: directories)
        case .tickets: model.ticketFilters.webPatch(directories: directories)
        case .projects: model.projectFilters.webPatch(directories: directories)
        }
        var merged = list[index].config.objectValue ?? [:]
        for (field, value) in patch.objectValue ?? [:] { merged[field] = value }
        list[index].config = .object(merged)
        setSavedViews(key, list)
        pushSavedViews(key, list)
    }

    func deleteSavedView(_ key: ViewKey, id: String) {
        let list = savedViews(for: key).filter { $0.id != id }
        setSavedViews(key, list)
        pushSavedViews(key, list)
    }

    /// Apply a saved view's config to the page filters. The filter didSet
    /// then persists the applied state, like the web writing it back.
    func applySavedView(_ key: ViewKey, entry: SavedViewEntry) {
        let directories = ViewDirectories(model: model)
        switch key {
        case .tasks:
            model.taskFilters = TaskFilters(webConfig: entry.config, directories: directories)
        case .tickets:
            model.ticketFilters = TicketFilters(webConfig: entry.config, directories: directories)
        case .projects:
            model.projectFilters = ProjectFilters(webConfig: entry.config, directories: directories)
        }
    }

    private func pushSavedViews(_ key: ViewKey, _ views: [SavedViewEntry]) {
        let patch = JSONValue.object(["savedViews": .array(views.map(\.asJSON))])
        Task {
            do {
                try await client.updateViews(key: key.rawValue, patch: patch)
            } catch {
                // Keep the optimistic list on screen (a refresh would revert
                // it) and say so — a silent revert reads as "nothing happened".
                print("[sync] saved views push failed for \(key.rawValue):", error)
                model.toast("Couldn't save the view — \(error.localizedDescription)")
                return
            }
            await refreshViews()
        }
    }

    // MARK: - SSE

    private func startEventStream() {
        guard eventTask == nil else { return }
        let baseURL = client.baseURL
        let client = self.client
        eventTask = Task { [weak self] in
            var failures = 0
            while !Task.isCancelled {
                do {
                    let config = URLSessionConfiguration.ephemeral
                    config.httpShouldSetCookies = false
                    config.timeoutIntervalForRequest = 3600
                    let session = URLSession(configuration: config)
                    var request = URLRequest(url: baseURL.appending(path: "/api/v1/events"))
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    if let token = await client.currentToken() {
                        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                    }
                    let (bytes, response) = try await session.bytes(for: request)
                    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                        throw APIError.invalidURL
                    }
                    failures = 0
                    for try await line in bytes.lines {
                        guard line.hasPrefix("data:") else { continue }
                        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        guard
                            let data = payload.data(using: .utf8),
                            let event = try? JSONDecoder().decode(API.Event.self, from: data)
                        else { continue }
                        await self?.handle(event: event)
                    }
                } catch {
                    // Fall through to reconnect below.
                }
                if Task.isCancelled { break }
                failures += 1
                let backoff = min(30, 2 << min(failures, 4))
                try? await Task.sleep(for: .seconds(Double(backoff)))
            }
        }
    }

    private func handle(event: API.Event) async {
        switch event.type {
        case "inbox":
            await refreshBadge()
        case "entity":
            switch event.entityType {
            case "task":
                await refreshTasks()
            case "ticket":
                await refreshTickets()
                if let id = event.entityId, model.tickets.contains(where: { $0.uuid == id }) {
                    await loadTicketDetail(uuid: id)
                }
            case "thread":
                await refreshChat()
            default:
                await refreshAll()
            }
        default:
            break
        }
    }

    // MARK: - Apply helpers

    private func projectName(_ key: String) -> String {
        model.projects.first(where: { $0.key == key })?.name ?? key
    }

    private func apply(me fresh: API.Me) {
        self.me = fresh
        model.currentUser = UserRef(
            name: fresh.user.name,
            initials: Mapper.initials(for: fresh.user.name),
            color: Mapper.derivedColor(forUserId: fresh.user.id),
            serverId: fresh.user.id
        )
        model.currentUserEmail = fresh.user.email
        model.isStaff = fresh.capabilities.userType == "staff"
        model.unreadCount = fresh.unreadCount
        model.orgs = fresh.orgs.map { org in
            OrgRef(
                key: org.slug.uppercased(),
                name: org.name,
                color: Color(css: org.color, default: Color(hex: 0x7A9CF0)),
                serverId: org.id
            )
        }
    }

    private func apply(projects fresh: API.ProjectsResponse) {
        let favorites = favoriteKeys
        model.projects = fresh.projects.map {
            Mapper.project($0, isFavorite: favorites.contains($0.key))
        }
    }

    private func apply(tasks fresh: API.TasksResponse) {
        // List rows carry no attachments — keep ones a detail fetch loaded.
        let loadedAttachments = Dictionary(
            uniqueKeysWithValues: model.tasks.compactMap { task in
                task.uuid.map { ($0, task.attachments) }
            }
        )
        model.tasks = fresh.tasks.map { dto in
            var mapped = Mapper.task(dto, users: fresh.users, projectName: projectName)
            if let uuid = dto.uuid, let kept = loadedAttachments[uuid], !kept.isEmpty {
                mapped.attachments = kept
            }
            return mapped
        }
        // The tasks directory doubles as the internal-team picker fallback
        // until a detail response provides the exact assignable set.
        if model.assignableUsers.isEmpty {
            model.assignableUsers = fresh.users
                .compactMap { Mapper.user(id: $0.key, in: fresh.users) }
                .sorted { $0.name < $1.name }
        }
    }

    private func apply(tickets fresh: API.TicketsResponse) {
        // Keep already-loaded conversations: list rows have no messages, so
        // merge them over the fresh row instead of wiping the detail state.
        let loadedMessages = Dictionary(
            uniqueKeysWithValues: model.tickets.compactMap { ticket in
                ticket.uuid.map { ($0, (ticket.messages, ticket.activity, ticket.attachments)) }
            }
        )
        model.tickets = fresh.tickets.map { dto in
            var mapped = Mapper.ticket(dto, users: fresh.users)
            if let existing = loadedMessages[dto.id], !existing.0.isEmpty {
                mapped.messages = existing.0
                mapped.activity = existing.1
                mapped.attachments = existing.2
                mapped.serverMessageCount = nil
            }
            return mapped
        }
    }

    private func apply(notes fresh: API.NotesListResponse) {
        // Preserve fetched bodies across list refreshes.
        let bodies = Dictionary(uniqueKeysWithValues: model.notes.map { ($0.id, $0.bodyHtml) })
        var notes: [NoteItem] = []
        notes.append(contentsOf: fresh.quick.map { Mapper.note($0) })
        notes.append(contentsOf: fresh.meetings.map { Mapper.note($0) })
        notes.append(contentsOf: fresh.shared.map { dto in
            var note = Mapper.note(dto)
            note.sharedBy = UserRef(name: "Shared", initials: "↗", color: .gray)
            return note
        })
        model.notes = notes.map { note in
            var merged = note
            if let body = bodies[note.id], !body.isEmpty { merged.bodyHtml = body }
            return merged
        }
    }

    private func apply(wiki fresh: API.WikiTreeResponse) {
        let bodies = Dictionary(uniqueKeysWithValues: model.wikiPages.map { ($0.id, $0.bodyHtml) })
        model.wikiPages = fresh.pages.map { dto in
            var page = Mapper.wikiPage(dto)
            if let body = bodies[page.id], !body.isEmpty { page.bodyHtml = body }
            return page
        }
    }

    private func mapChat(_ feed: API.ChatFeedResponse, orgId: String) -> [ChatThread] {
        let org = model.orgs.first(where: { $0.serverId == orgId })
            ?? OrgRef(key: "?", name: "Unknown", color: .gray, serverId: orgId)
        let tagsById = Dictionary(uniqueKeysWithValues: feed.tags.map { ($0.id, $0) })
        let unread = Set(feed.unreadThreadIds)
        return feed.threads.map {
            Mapper.chatThread(
                $0,
                org: org,
                tagsById: tagsById,
                authors: feed.authors,
                unread: unread.contains($0.id)
            )
        }
    }

    private func sortThreads(_ threads: [ChatThread]) -> [ChatThread] {
        threads.sorted { $0.lastActivityAt > $1.lastActivityAt }
    }

    // MARK: - Favorites (device-local)

    /// Load the project's history feed into `model.projects[…].history`.
    /// Called when the history sheet opens; the list itself only carries
    /// the project summary.
    func loadProjectHistory(projectKey: String) async {
        guard let index = model.projects.firstIndex(where: { $0.key == projectKey }),
              let uuid = model.projects[index].serverId,
              let response = try? await client.projectActivity(uuid: uuid)
        else { return }
        // Re-resolve the index — the list may have been refreshed meanwhile.
        guard let fresh = model.projects.firstIndex(where: { $0.key == projectKey }) else { return }
        model.projects[fresh].history = response.items.map(Mapper.projectEvent)
    }

    /// Post a project-level comment, then reload so the optimistic row is
    /// replaced by the server's copy.
    func addProjectComment(projectKey: String, text: String) {
        guard let uuid = model.projects.first(where: { $0.key == projectKey })?.serverId else { return }
        Task {
            guard (try? await client.addProjectComment(uuid: uuid, text: text)) != nil else { return }
            await loadProjectHistory(projectKey: projectKey)
        }
    }

    func setFavorite(projectKey: String, favorite: Bool) {
        var keys = favoriteKeys
        if favorite { keys.insert(projectKey) } else { keys.remove(projectKey) }
        favoriteKeys = keys
    }
}
