//
//  DTOs.swift
//  trackr-mobile-ios
//
//  Codable mirrors of the /api/v1 JSON, byte-for-byte with the server route
//  shapes (see web/src/routes/api/v1). Dates stay String here — the server
//  mixes full ISO timestamps and YYYY-MM-DD day strings — and are parsed in
//  the mapping layer.
//

import Foundation

enum API {
    // MARK: - Instance & session

    struct Instance: Codable {
        let name: String
        let version: String?
        let api: Int?
    }

    struct DisplayUser: Codable {
        let name: String
        let color: String
    }

    struct PickerUser: Codable {
        let id: String
        let name: String
        let color: String
    }

    struct Me: Codable {
        struct User: Codable {
            let id: String
            let name: String
            let email: String
            let image: String?
        }
        struct Surfaces: Codable {
            let tickets: Bool
            let chat: Bool
            let tasks: Bool
            let projects: Bool
            let wiki: Bool
            let notes: Bool
            let admin: Bool
        }
        struct QuickCreate: Codable {
            let ticket: Bool
            let task: Bool
            let note: Bool
        }
        struct Capabilities: Codable {
            let userType: String
            let isAdmin: Bool
            let surfaces: Surfaces
            let quickCreate: QuickCreate
        }
        struct Org: Codable {
            let id: String
            let slug: String
            let name: String
            let color: String?
        }

        let user: User
        let capabilities: Capabilities
        let orgs: [Org]
        let unreadCount: Int
    }

    // MARK: - Tasks

    struct ChecklistEntry: Codable {
        let id: String?
        let text: String
        let done: Bool
    }

    struct TaskComment: Codable {
        let id: String?
        let user: String
        let date: String
        let text: String
        let createdAt: String?
    }

    struct TaskTimeLog: Codable {
        let user: String
        let date: String
        let minutes: Int
        let note: String?
        let createdAt: String?
    }

    struct Task: Codable {
        let id: String  // displayId, e.g. "TRK-142"
        let uuid: String?
        let title: String
        let status: String
        let priority: String
        let type: String?
        let project: String  // project key
        let due: String?
        let estimate: Int?
        let assignees: [String]?
        let tags: [String]?
        let createdBy: String?
        let createdAt: String?
        let description: String?
        let checklist: [ChecklistEntry]?
        let comments: [TaskComment]?
        let timeLogs: [TaskTimeLog]?
        let plannedFor: String?
        let updated: String?
        let sourceTicket: SourceTicket?
    }

    /// Back-link from a converted task to its source ticket.
    struct SourceTicket: Codable {
        let id: String
        let displayId: String
    }

    /// Back-link from a ticket to a task converted out of it.
    struct LinkedTask: Codable {
        let id: String
        let displayId: String
        let title: String
        let status: String
    }

    struct TasksResponse: Codable {
        let tasks: [Task]
        let users: [String: DisplayUser]
    }

    struct TaskDetailResponse: Codable {
        let task: Task
        let authors: [String: DisplayUser]
        let assignableUsers: [PickerUser]
        let canEdit: Bool
        let canComment: Bool
    }

    struct CreatedResponse: Codable {
        let id: String
        let displayId: String?
    }

    struct OkResponse: Codable {
        let ok: Bool
    }

    // MARK: - Project activity

    struct ProjectActivityActor: Codable {
        let id: String
        let name: String
        let color: String
    }

    /// One history line. `text` is pre-rendered by the server for typed
    /// events; for `type == "comment"` it is the comment body.
    struct ProjectActivityItem: Codable {
        let id: String
        let type: String
        let taskId: String?
        let taskRef: String?
        let text: String
        let createdAt: String
        let actor: ProjectActivityActor?
    }

    struct ProjectActivityResponse: Codable {
        let items: [ProjectActivityItem]
    }

    // MARK: - Tickets

    struct Ticket: Codable {
        let id: String  // uuid
        let orgId: String
        let orgSlug: String
        let orgName: String
        let orgColor: String?
        let displayId: String
        let subject: String
        let description: String?
        let status: String
        let priority: String
        let category: String
        let channel: String
        let customerId: String?
        let assignees: [String]
        let createdBy: String?
        let firstResponseAt: String?
        let resolvedAt: String?
        let closedAt: String?
        let tags: [String]
        let checklist: [ChecklistEntry]
        let messageCount: Int
        let lastMessageAt: String?
        let createdAt: String
        let updatedAt: String
    }

    struct TicketsResponse: Codable {
        let tickets: [Ticket]
        let users: [String: DisplayUser]
    }

    struct TicketMessage: Codable {
        let id: String
        let authorId: String?
        let body: String
        let kind: String
        let isInternalNote: Bool
        let createdAt: String
    }

    struct TicketDetailResponse: Codable {
        let ticket: Ticket
        let messages: [TicketMessage]
        let authors: [String: DisplayUser]
        let assignableUsers: [PickerUser]
        let canEdit: Bool
        let canComment: Bool
        let canInternalNote: Bool
        let linkedTasks: [LinkedTask]?
    }

    // MARK: - Chat

    struct ChatTag: Codable {
        let id: String
        let label: String
        let color: String?
    }

    struct ChatMessage: Codable {
        struct Meta: Codable {
            let event: String?
            let ticketId: String?
            let displayId: String?
            let subject: String?
        }
        let id: String
        let threadId: String
        let authorId: String?
        let body: String
        let kind: String
        let meta: Meta?
        let createdAt: String
    }

    struct ChatThread: Codable {
        let id: String
        let title: String?
        let status: String
        let createdBy: String?
        let createdAt: String
        let updatedAt: String
        let tagIds: [String]
        let messages: [ChatMessage]
    }

    struct ChatFeedResponse: Codable {
        let threads: [ChatThread]
        let tags: [ChatTag]
        let authors: [String: DisplayUser]
        let unreadThreadIds: [String]
    }

    struct ChatThreadDetailResponse: Codable {
        struct ThreadInfo: Codable {
            let id: String
            let title: String?
            let orgId: String
        }
        let thread: ThreadInfo
        let messages: [ChatMessage]
        let authors: [String: DisplayUser]
    }

    struct ThreadCreatedResponse: Codable {
        let threadId: String
    }

    // MARK: - Notes & wiki

    struct NoteListItem: Codable {
        let id: String
        let kind: String
        let title: String
        let icon: String?
        let pinned: Bool
        let updatedAt: String
        let meetingDate: String?
    }

    struct NotesListResponse: Codable {
        let quick: [NoteListItem]
        let meetings: [NoteListItem]
        let shared: [NoteListItem]
    }

    struct NoteDetail: Codable {
        let id: String
        let kind: String
        let title: String
        let icon: String?
        let pinned: Bool
        let bodyHtml: String
        let meetingDate: String?
        let projectId: String?
        let taskId: String?
        let updatedAt: String
    }

    struct NoteDetailResponse: Codable {
        let note: NoteDetail
    }

    struct WikiTreeNode: Codable {
        let id: String
        let parentId: String?
        let title: String
        let icon: String?
        let isFolder: Bool
        let sortOrder: Int
    }

    struct WikiTreeResponse: Codable {
        let pages: [WikiTreeNode]
    }

    struct WikiPageDetail: Codable {
        let id: String
        let title: String
        let icon: String?
        let isFolder: Bool
        let bodyHtml: String
        let updatedAt: String
    }

    struct WikiPageResponse: Codable {
        let page: WikiPageDetail
    }

    // MARK: - Projects

    struct ProjectMember: Codable {
        let id: String
        let name: String
    }

    struct Project: Codable {
        let id: String
        let key: String
        let name: String
        let description: String?
        let color: String?
        let icon: String?
        let status: String
        let leadId: String?
        let members: [ProjectMember]
        let updatedAt: String
    }

    struct ProjectsResponse: Codable {
        let projects: [Project]
    }

    // MARK: - Inbox

    struct InboxItem: Codable {
        let id: String
        let kind: String
        let title: String
        let body: String?
        let url: String
        let actorId: String?
        let entityType: String?
        let entityId: String?
        let readAt: String?
        let createdAt: String
    }

    struct InboxResponse: Codable {
        let items: [InboxItem]
        let actors: [String: DisplayUser]
        let nextCursor: String?
    }

    struct BadgeResponse: Codable {
        let unread: Int
    }

    // MARK: - Search

    struct SearchResult: Codable {
        let type: String
        let id: String
        let title: String
        let subtitle: String?
        let url: String
    }

    struct SearchResponse: Codable {
        let results: [SearchResult]
    }

    // MARK: - Preferences

    struct NotificationChannelPref: Codable {
        var email: String  // off | instant | digest
        var inApp: Bool
    }

    struct QuietHours: Codable {
        var enabled: Bool
        var start: String
        var end: String
        var weekends: Bool
    }

    struct DigestConfig: Codable {
        var frequency: String  // hourly | daily
        var hour: Int
    }

    struct NotificationScope: Codable {
        var tickets: String  // all | participating | mentions
        var chat: String
    }

    struct Preferences: Codable {
        var theme: String
        var density: String
        var defaultLanding: String
        var weekStartsOn: Int
        var locale: String
        var notifications: [String: NotificationChannelPref]
        var quietHours: QuietHours
        var digest: DigestConfig
        var notificationScope: NotificationScope
    }

    struct PreferencesResponse: Codable {
        let preferences: Preferences
    }

    /// GET /api/v1/me/views — the web pages' per-key view bookkeeping
    /// (saved views + last-used filters), kept raw: configs are opaque blobs.
    struct ViewStateResponse: Codable {
        let viewState: [String: JSONValue]
    }

    // MARK: - Events (SSE payloads)

    struct Event: Codable {
        let type: String  // entity | inbox
        let entityType: String?
        let entityId: String?
    }
}

// MARK: - Date parsing

enum APIDate {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private static let day: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    /// Parses both server date flavors: full ISO timestamps (with or without
    /// fractional seconds) and bare YYYY-MM-DD day strings.
    static func parse(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        if raw.count == 10 { return day.date(from: raw) }
        return iso.date(from: raw) ?? isoPlain.date(from: raw)
    }

    /// YYYY-MM-DD in the device's calendar — the format task PATCH expects
    /// for `due` and time logs expect for `date`.
    static func dayString(_ date: Date) -> String {
        day.string(from: date)
    }
}
