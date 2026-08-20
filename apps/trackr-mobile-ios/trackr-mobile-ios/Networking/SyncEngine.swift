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

@MainActor @Observable
final class SyncEngine {
    private let client: APIClient
    private let store: SnapshotStore
    private let model: AppModel

    private(set) var me: API.Me?
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
        bootstrapFromCache()
        await refreshAll()
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

    private func bootstrapFromCache() {
        if let cached = store.load("me", as: API.Me.self) {
            apply(me: cached)
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
        _ = await (tasks, tickets, chat, notes, wiki)
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
    }

    // MARK: - Detail loads (screen-appear revalidation)

    /// Ticket conversations aren't in the list payload — load them when the
    /// detail opens and merge into the model row.
    func loadTicketDetail(uuid: String) async {
        guard let detail = try? await client.ticket(uuid: uuid) else { return }
        var mapped = Mapper.ticket(detail.ticket, users: detail.authors, messages: detail.messages)
        mapped.serverMessageCount = nil
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
        let mapped = Mapper.task(detail.task, users: detail.authors, projectName: projectName)
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
        let patch = APIClient.TaskPatch(
            status: task.status.apiValue,
            priority: task.priority.apiValue,
            type: task.type.apiValue,
            description: task.details,
            due: .some(task.due.map { APIDate.dayString($0) }),
            checklist: task.checklist.map {
                API.ChecklistEntry(id: $0.id, text: $0.text, done: $0.done)
            },
            assigneeIds: task.assignees.compactMap(\.serverId)
        )
        Task {
            try? await client.updateTask(uuid: uuid, patch: patch)
            await refreshTasks()
        }
    }

    func pushTicket(_ ticket: TicketItem) {
        guard let uuid = ticket.uuid else { return }
        let patch = APIClient.TicketPatch(
            status: ticket.status.apiValue,
            priority: ticket.priority.apiValue,
            category: ticket.category.apiValue,
            assigneeIds: ticket.assignees.compactMap(\.serverId)
        )
        Task {
            try? await client.updateTicket(uuid: uuid, patch: patch)
            await loadTicketDetail(uuid: uuid)
        }
    }

    func sendTaskComment(taskUUID: String, text: String) {
        Task {
            try? await client.addTaskComment(uuid: taskUUID, text: text)
            await loadTaskDetail(uuid: taskUUID)
        }
    }

    func logTime(taskUUID: String, minutes: Int, date: Date, note: String?) {
        Task {
            try? await client.logTaskTime(uuid: taskUUID, minutes: minutes, date: date, note: note)
            await refreshTasks()
        }
    }

    func sendTicketMessage(ticketUUID: String, text: String, internalNote: Bool) {
        Task {
            try? await client.addTicketMessage(uuid: ticketUUID, text: text, internalNote: internalNote)
            await loadTicketDetail(uuid: ticketUUID)
        }
    }

    func sendChatMessage(threadId: String, text: String) {
        Task {
            try? await client.addChatMessage(threadId: threadId, text: text)
            await loadChatThread(id: threadId)
        }
    }

    /// Create a task with the sheet's full field set: POST accepts only
    /// title/projectKey/description, everything else follows as a PATCH.
    func createTask(
        title: String,
        projectKey: String,
        description: String?,
        status: TaskStatus,
        priority: TaskPriority,
        type: TaskType,
        due: Date?,
        estimate: Int?,
        assignees: [UserRef],
        checklist: [ChecklistItem]
    ) {
        Task {
            guard let created = try? await client.createTask(
                .init(title: title, projectKey: projectKey, description: description)
            ) else { return }
            var patch = APIClient.TaskPatch()
            if status != .todo { patch.status = status.apiValue }
            if priority != .none { patch.priority = priority.apiValue }
            if type != .task { patch.type = type.apiValue }
            if let due { patch.due = .some(APIDate.dayString(due)) }
            if !checklist.isEmpty {
                patch.checklist = checklist.map {
                    API.ChecklistEntry(id: $0.id, text: $0.text, done: $0.done)
                }
            }
            let assigneeIds = assignees.compactMap(\.serverId)
            if !assigneeIds.isEmpty { patch.assigneeIds = assigneeIds }
            let hasPatch = patch.status != nil || patch.priority != nil || patch.type != nil
                || patch.due != nil || patch.checklist != nil || patch.assigneeIds != nil
            if hasPatch {
                try? await client.updateTask(uuid: created.id, patch: patch)
            }
            await refreshTasks()
        }
    }

    func createTicket(orgId: String, subject: String, description: String?, assignees: [UserRef]) {
        Task {
            guard let created = try? await client.createTicket(
                .init(orgId: orgId, subject: subject, description: description)
            ) else { return }
            let assigneeIds = assignees.compactMap(\.serverId)
            if !assigneeIds.isEmpty {
                try? await client.updateTicket(
                    uuid: created.id,
                    patch: .init(assigneeIds: assigneeIds)
                )
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
                try? await client.addTaskComment(uuid: created.id, text: comment.text)
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
        model.tasks = fresh.tasks.map {
            Mapper.task($0, users: fresh.users, projectName: projectName)
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
                ticket.uuid.map { ($0, (ticket.messages, ticket.activity)) }
            }
        )
        model.tickets = fresh.tickets.map { dto in
            var mapped = Mapper.ticket(dto, users: fresh.users)
            if let existing = loadedMessages[dto.id], !existing.0.isEmpty {
                mapped.messages = existing.0
                mapped.activity = existing.1
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

    func setFavorite(projectKey: String, favorite: Bool) {
        var keys = favoriteKeys
        if favorite { keys.insert(projectKey) } else { keys.remove(projectKey) }
        favoriteKeys = keys
    }
}
