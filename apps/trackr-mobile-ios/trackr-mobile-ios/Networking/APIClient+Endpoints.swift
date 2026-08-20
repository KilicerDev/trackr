//
//  APIClient+Endpoints.swift
//  trackr-mobile-ios
//
//  Typed wrappers over the /api/v1 surface — one thin function per endpoint,
//  grouped by domain. All shapes live in DTOs.swift.
//

import Foundation

extension APIClient {
    // MARK: - Instance & session

    func instance() async throws -> API.Instance {
        try await get("/api/v1/instance", authenticated: false)
    }

    /// better-auth get-session: 200 with a literal `null` body means the
    /// token is dead — that must NOT trigger the global sign-out hook (it's
    /// the probe deciding whether we're signed in at all).
    func validateSession() async throws -> Bool {
        let (data, _) = try await raw("GET", "/api/auth/get-session", allowUnauthorized: true)
        let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return !(text == nil || text == "null" || text!.isEmpty)
    }

    func signOutRemote() async {
        struct Empty: Encodable {}
        // Best effort — local wipe happens regardless.
        let _: API.OkResponse? = try? await post("/api/auth/sign-out", body: Empty())
    }

    func me() async throws -> API.Me {
        try await get("/api/v1/me")
    }

    // MARK: - Tasks

    func tasks(scope: String = "all") async throws -> API.TasksResponse {
        try await get("/api/v1/tasks", query: [URLQueryItem(name: "scope", value: scope)])
    }

    func task(uuid: String) async throws -> API.TaskDetailResponse {
        try await get("/api/v1/tasks/\(uuid)")
    }

    struct TaskPatch: Encodable {
        var status: String?
        var priority: String?
        var type: String?
        var title: String?
        var description: String?
        var due: String??
        var estimate: Int??
        var tags: [String]?
        var checklist: [API.ChecklistEntry]?
        var assigneeIds: [String]?
        var plannedFor: String??

        // due/estimate/plannedFor are double-optional: outer nil = not part
        // of the patch, inner nil = clear the value. Encode explicit nulls
        // only for the inner case.
        enum CodingKeys: String, CodingKey {
            case status, priority, type, title, description, due, estimate,
                 tags, checklist, assigneeIds, plannedFor
        }
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encodeIfPresent(status, forKey: .status)
            try container.encodeIfPresent(priority, forKey: .priority)
            try container.encodeIfPresent(type, forKey: .type)
            try container.encodeIfPresent(title, forKey: .title)
            try container.encodeIfPresent(description, forKey: .description)
            if let due {
                try container.encode(due, forKey: .due)
            }
            if let estimate {
                try container.encode(estimate, forKey: .estimate)
            }
            try container.encodeIfPresent(tags, forKey: .tags)
            try container.encodeIfPresent(checklist, forKey: .checklist)
            try container.encodeIfPresent(assigneeIds, forKey: .assigneeIds)
            if let plannedFor {
                try container.encode(plannedFor, forKey: .plannedFor)
            }
        }
    }

    func updateTask(uuid: String, patch: TaskPatch) async throws {
        let _: API.OkResponse = try await self.patch("/api/v1/tasks/\(uuid)", body: patch)
    }

    struct CreateTaskBody: Encodable {
        let title: String
        let projectKey: String
        var description: String? = nil
        var status: String? = nil
        var priority: String? = nil
        var type: String? = nil
        var due: String? = nil
        var estimate: Int? = nil
        var tags: [String]? = nil
        var assigneeIds: [String]? = nil
        var plannedFor: String? = nil
    }

    func createTask(_ body: CreateTaskBody) async throws -> API.CreatedResponse {
        try await post("/api/v1/tasks", body: body)
    }

    func addTaskComment(uuid: String, text: String) async throws {
        struct Body: Encodable { let body: String }
        let _: API.CreatedResponse = try await post("/api/v1/tasks/\(uuid)/comments", body: Body(body: text))
    }

    func logTaskTime(uuid: String, minutes: Int, date: Date, note: String?) async throws {
        struct Body: Encodable {
            let minutes: Int
            let date: String
            let note: String?
        }
        let _: API.OkResponse = try await post(
            "/api/v1/tasks/\(uuid)/time",
            body: Body(minutes: minutes, date: APIDate.dayString(date), note: note)
        )
    }

    // MARK: - Tickets

    func tickets(segment: String = "all") async throws -> API.TicketsResponse {
        try await get("/api/v1/tickets", query: [URLQueryItem(name: "segment", value: segment)])
    }

    func ticket(uuid: String) async throws -> API.TicketDetailResponse {
        try await get("/api/v1/tickets/\(uuid)")
    }

    struct TicketPatch: Encodable {
        var status: String?
        var priority: String?
        var category: String?
        var assigneeIds: [String]?
    }

    func updateTicket(uuid: String, patch: TicketPatch) async throws {
        struct Response: Decodable { let ok: Bool }
        let _: Response = try await self.patch("/api/v1/tickets/\(uuid)", body: patch)
    }

    struct CreateTicketBody: Encodable {
        let orgId: String
        let subject: String
        let description: String?
    }

    func createTicket(_ body: CreateTicketBody) async throws -> API.CreatedResponse {
        try await post("/api/v1/tickets", body: body)
    }

    func addTicketMessage(uuid: String, text: String, internalNote: Bool) async throws {
        struct Body: Encodable {
            let body: String
            let `internal`: Bool
        }
        let _: API.CreatedResponse = try await post(
            "/api/v1/tickets/\(uuid)/messages",
            body: Body(body: text, internal: internalNote)
        )
    }

    // MARK: - Chat

    func chatFeed(orgId: String) async throws -> API.ChatFeedResponse {
        try await get("/api/v1/chat/threads", query: [URLQueryItem(name: "orgId", value: orgId)])
    }

    func chatThread(id: String) async throws -> API.ChatThreadDetailResponse {
        try await get("/api/v1/chat/threads/\(id)")
    }

    func createChatThread(orgId: String, title: String, body: String) async throws -> API.ThreadCreatedResponse {
        struct Body: Encodable {
            let orgId: String
            let title: String
            let body: String
        }
        return try await post("/api/v1/chat/threads", body: Body(orgId: orgId, title: title, body: body))
    }

    func addChatMessage(threadId: String, text: String) async throws {
        struct Body: Encodable { let body: String }
        let _: API.CreatedResponse = try await post(
            "/api/v1/chat/threads/\(threadId)/messages",
            body: Body(body: text)
        )
    }

    // MARK: - Notes & wiki

    func notesList() async throws -> API.NotesListResponse {
        try await get("/api/v1/notes/list")
    }

    func note(id: String) async throws -> API.NoteDetailResponse {
        try await get("/api/v1/notes/\(id)")
    }

    func createQuickNote(title: String, body: String?) async throws -> API.CreatedResponse {
        struct Body: Encodable {
            let title: String
            let body: String?
        }
        return try await post("/api/v1/notes", body: Body(title: title, body: body))
    }

    func wikiTree() async throws -> API.WikiTreeResponse {
        try await get("/api/v1/wiki")
    }

    func wikiPage(id: String) async throws -> API.WikiPageResponse {
        try await get("/api/v1/wiki/\(id)")
    }

    // MARK: - Projects

    func projects() async throws -> API.ProjectsResponse {
        try await get("/api/v1/projects")
    }

    // MARK: - Inbox

    func inbox(cursor: String? = nil, limit: Int = 30) async throws -> API.InboxResponse {
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
        return try await get("/api/v1/inbox", query: query)
    }

    func inboxBadge() async throws -> API.BadgeResponse {
        try await get("/api/v1/inbox/badge")
    }

    func markInboxAllRead() async throws {
        struct Body: Encodable { let all: Bool }
        let _: API.OkResponse = try await post("/api/v1/inbox/read", body: Body(all: true))
    }

    func markInboxRead(id: String) async throws {
        struct Body: Encodable { let id: String }
        let _: API.OkResponse = try await post("/api/v1/inbox/read", body: Body(id: id))
    }

    // MARK: - Search

    func search(_ query: String) async throws -> API.SearchResponse {
        try await get("/api/v1/search", query: [URLQueryItem(name: "q", value: query)])
    }

    // MARK: - Preferences & profile

    func preferences() async throws -> API.Preferences {
        let response: API.PreferencesResponse = try await get("/api/v1/me/preferences")
        return response.preferences
    }

    struct PreferencesPatch: Encodable {
        var theme: String?
        var density: String?
        var locale: String?
        var notifications: [String: API.NotificationChannelPref]?
        var quietHours: API.QuietHours?
        var digest: API.DigestConfig?
        var notificationScope: API.NotificationScope?
    }

    @discardableResult
    func updatePreferences(_ patch: PreferencesPatch) async throws -> API.Preferences {
        let response: API.PreferencesResponse = try await self.patch("/api/v1/me/preferences", body: patch)
        return response.preferences
    }

    func updateProfile(name: String?, image: String??) async throws {
        struct Body: Encodable {
            let name: String?
            let image: String??
            enum CodingKeys: String, CodingKey { case name, image }
            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                try container.encodeIfPresent(name, forKey: .name)
                if let image { try container.encode(image, forKey: .image) }
            }
        }
        struct Response: Decodable { let ok: Bool }
        let _: Response = try await patch("/api/v1/me/profile", body: Body(name: name, image: image))
    }

    // MARK: - Saved views / per-page view state

    func views() async throws -> API.ViewStateResponse {
        try await get("/api/v1/me/views")
    }

    /// Shallow-merges `patch` into view_state[key] server-side; a
    /// `savedViews` array replaces the stored one wholesale (web parity).
    func updateViews(key: String, patch: JSONValue) async throws {
        struct Body: Encodable {
            let key: String
            let patch: JSONValue
        }
        let _: API.OkResponse = try await post("/api/v1/me/views", body: Body(key: key, patch: patch))
    }

    // MARK: - Push tokens

    func registerPushToken(_ token: String, deviceName: String?) async throws {
        struct Body: Encodable {
            let token: String
            let platform: String
            let deviceName: String?
        }
        let _: API.OkResponse = try await post(
            "/api/v1/push/tokens",
            body: Body(token: token, platform: "ios", deviceName: deviceName)
        )
    }

    func unregisterPushToken(_ token: String) async {
        struct Body: Encodable { let token: String }
        let _: API.OkResponse? = try? await delete("/api/v1/push/tokens", body: Body(token: token))
    }
}
