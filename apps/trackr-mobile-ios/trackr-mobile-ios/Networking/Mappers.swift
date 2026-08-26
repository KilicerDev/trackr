//
//  Mappers.swift
//  trackr-mobile-ios
//
//  DTO → UI-model translation. The UI models were designed screen-first
//  (display ids, resolved UserRefs, SwiftUI Colors), so every API payload
//  passes through here exactly once. Enum raw values are camelCase in Swift
//  and snake_case on the wire — the api/apiValue pairs bridge them.
//

import SwiftUI

// MARK: - Taxonomy wire values

extension TaskStatus {
    init?(api: String) {
        switch api {
        case "backlog": self = .backlog
        case "todo": self = .todo
        case "in_progress": self = .inProgress
        case "paused": self = .paused
        case "in_review": self = .inReview
        case "done": self = .done
        default: return nil
        }
    }

    var apiValue: String {
        switch self {
        case .backlog: "backlog"
        case .todo: "todo"
        case .inProgress: "in_progress"
        case .paused: "paused"
        case .inReview: "in_review"
        case .done: "done"
        }
    }
}

extension TaskPriority {
    init?(api: String) {
        self.init(rawValue: api)
    }

    var apiValue: String { rawValue }
}

extension TaskType {
    init?(api: String) {
        self.init(rawValue: api)
    }

    var apiValue: String { rawValue }
}

extension TicketStatus {
    init?(api: String) {
        switch api {
        case "open": self = .open
        case "in_progress": self = .inProgress
        case "waiting_on_customer": self = .waitingOnCustomer
        case "waiting_on_agent": self = .waitingOnAgent
        case "paused": self = .paused
        case "resolved": self = .resolved
        case "closed": self = .closed
        default: return nil
        }
    }

    var apiValue: String {
        switch self {
        case .open: "open"
        case .inProgress: "in_progress"
        case .waitingOnCustomer: "waiting_on_customer"
        case .waitingOnAgent: "waiting_on_agent"
        case .paused: "paused"
        case .resolved: "resolved"
        case .closed: "closed"
        }
    }
}

extension TicketCategory {
    init?(api: String) {
        switch api {
        case "general": self = .general
        case "billing": self = .billing
        case "technical_issue": self = .technicalIssue
        case "feature_request": self = .featureRequest
        default: return nil
        }
    }

    var apiValue: String {
        switch self {
        case .general: "general"
        case .billing: "billing"
        case .technicalIssue: "technical_issue"
        case .featureRequest: "feature_request"
        }
    }
}

extension TicketChannel {
    init?(api: String) {
        switch api {
        case "web_form": self = .webForm
        case "email": self = .email
        case "chat": self = .chat
        case "api": self = .api
        default: return nil
        }
    }

    var apiValue: String {
        switch self {
        case .webForm: "web_form"
        case .email: "email"
        case .chat: "chat"
        case .api: "api"
        }
    }
}

extension ProjectStatus {
    init?(api: String) {
        self.init(rawValue: api)
    }
}

// MARK: - Mapper

enum Mapper {
    // MARK: Users

    static func initials(for name: String) -> String {
        name.split(separator: " ")
            .compactMap { $0.first.map(String.init) }
            .prefix(2)
            .joined()
            .uppercased()
    }

    /// Mirror of the server's assigneeColor hash (tickets.ts) so a user id
    /// renders the same color even when a directory entry is missing.
    static func derivedColor(forUserId id: String) -> Color {
        var h: UInt32 = 0
        for unit in id.utf16 {
            h = h &* 31 &+ UInt32(unit)
        }
        return Color(css: "hsl(\(h % 360) 55% 60%)")
    }

    static func user(id: String?, in directory: [String: API.DisplayUser]) -> UserRef? {
        guard let id, !id.isEmpty else { return nil }
        guard let entry = directory[id] else {
            return UserRef(
                name: "Unknown",
                initials: "?",
                color: derivedColor(forUserId: id),
                serverId: id
            )
        }
        return UserRef(
            name: entry.name,
            initials: initials(for: entry.name),
            color: Color(css: entry.color, default: derivedColor(forUserId: id)),
            serverId: id
        )
    }

    static func user(_ picker: API.PickerUser) -> UserRef {
        UserRef(
            name: picker.name,
            initials: initials(for: picker.name),
            color: Color(css: picker.color, default: derivedColor(forUserId: picker.id)),
            serverId: picker.id
        )
    }

    // MARK: Icons

    /// Server icons are lucide names from the web pickers; the app renders SF
    /// Symbols. Unknown names fall back to a neutral doc glyph.
    static func sfSymbol(forServerIcon icon: String?) -> String {
        switch icon {
        case "file-text", "file", "sticky-note": "doc.text"
        case "lightbulb": "lightbulb"
        case "key", "lock": "key.fill"
        case "terminal", "code": "terminal"
        case "book", "book-open": "book.closed"
        case "folder": "folder"
        case "users", "user": "person.2"
        case "calendar": "calendar"
        case "checklist", "list-checks", "list-todo": "checklist"
        case "network", "globe": "network"
        case "database": "cylinder.split.1x2"
        case "mail", "envelope": "envelope"
        case "plane": "airplane"
        case "heart", "activity": "cross.case"
        case "phone": "iphone"
        default: "doc.text"
        }
    }

    // MARK: Tasks

    static func task(
        _ dto: API.Task,
        users: [String: API.DisplayUser],
        projectName: (String) -> String
    ) -> TaskItem {
        TaskItem(
            id: dto.id,
            uuid: dto.uuid,
            title: dto.title,
            status: TaskStatus(api: dto.status) ?? .todo,
            priority: TaskPriority(api: dto.priority) ?? .none,
            type: TaskType(api: dto.type ?? "task") ?? .task,
            project: projectName(dto.project),
            details: dto.description ?? "",
            due: APIDate.parse(dto.due),
            plannedFor: APIDate.parse(dto.plannedFor),
            checklist: (dto.checklist ?? []).map {
                ChecklistItem(id: $0.id ?? UUID().uuidString, text: $0.text, done: $0.done)
            },
            estimate: dto.estimate,
            assignees: (dto.assignees ?? []).compactMap { user(id: $0, in: users) },
            tags: dto.tags ?? [],
            timeLogs: (dto.timeLogs ?? []).map { log in
                TimeLog(
                    user: user(id: log.user, in: users)
                        ?? UserRef(name: "Unknown", initials: "?", color: .gray),
                    minutes: log.minutes,
                    date: APIDate.parse(log.createdAt) ?? APIDate.parse(log.date) ?? .now,
                    note: (log.note?.isEmpty == false) ? log.note : nil
                )
            },
            comments: (dto.comments ?? []).map { comment in
                TaskComment(
                    id: comment.id ?? UUID().uuidString,
                    user: user(id: comment.user, in: users)
                        ?? UserRef(name: "Unknown", initials: "?", color: .gray),
                    date: APIDate.parse(comment.createdAt) ?? APIDate.parse(comment.date) ?? .now,
                    text: comment.text
                )
            }
        )
    }

    // MARK: Tickets

    static func orgRef(fromTicket dto: API.Ticket) -> OrgRef {
        // "MEDI-14" → "MEDI"; slug-prefixed display ids keep everything
        // before the trailing number.
        let key = dto.displayId.split(separator: "-").dropLast().joined(separator: "-")
        return OrgRef(
            key: key.isEmpty ? dto.orgSlug.uppercased() : key,
            name: dto.orgName,
            color: Color(css: dto.orgColor),
            serverId: dto.orgId
        )
    }

    /// SF Symbol per activity type (web TYPE_STYLE parity). Comments have
    /// no icon — that's what ProjectEvent.isComment keys on.
    private static let activityIcons: [String: String] = [
        "task.created": "plus.circle",
        "task.deleted": "trash",
        "task.status": "arrow.triangle.2.circlepath",
        "task.priority": "arrow.up",
        "task.type": "square",
        "task.assignee": "person.2",
        "time.logged": "clock",
        "project.name": "gearshape",
        "project.description": "gearshape",
        "project.status": "arrow.triangle.2.circlepath",
        "project.color": "paintpalette",
        "member.added": "person.2",
        "member.removed": "person.2",
        "member.role": "person.2",
        "lead.set": "star",
        "lead.cleared": "person.2",
    ]

    static func projectEvent(_ dto: API.ProjectActivityItem) -> ProjectEvent {
        let actor = dto.actor.map {
            UserRef(
                name: $0.name,
                initials: initials(for: $0.name),
                color: Color(css: $0.color, default: derivedColor(forUserId: $0.id)),
                serverId: $0.id
            )
        } ?? UserRef(name: "System", initials: "•", color: .gray)
        let isComment = dto.type == "comment"
        // A comment left on a task (not the project itself) keeps its
        // context in the line: web shows "commented on TRK-12".
        let text = isComment && dto.taskId != nil
            ? "commented on \(dto.taskRef ?? "a task"): \(dto.text)"
            : dto.text
        return ProjectEvent(
            user: actor,
            date: APIDate.parse(dto.createdAt) ?? .now,
            text: text,
            icon: isComment ? nil : (activityIcons[dto.type] ?? "circle"),
            serverId: dto.id
        )
    }

    static func ticket(
        _ dto: API.Ticket,
        users: [String: API.DisplayUser],
        messages: [API.TicketMessage] = []
    ) -> TicketItem {
        var activity: [ActivityEvent] = []
        var mapped: [TicketMessage] = []
        for message in messages {
            let author = user(id: message.authorId, in: users)
                ?? UserRef(name: "System", initials: "•", color: .gray)
            let date = APIDate.parse(message.createdAt) ?? .now
            if message.kind == "system" {
                activity.append(
                    ActivityEvent(user: author, date: date, text: message.body, icon: "info.circle")
                )
            } else {
                mapped.append(
                    TicketMessage(
                        id: message.id,
                        user: author,
                        date: date,
                        text: message.body,
                        internalNote: message.isInternalNote
                    )
                )
            }
        }

        var ticket = TicketItem(
            id: dto.displayId,
            uuid: dto.id,
            subject: dto.subject,
            details: dto.description ?? "",
            status: TicketStatus(api: dto.status) ?? .open,
            priority: TaskPriority(api: dto.priority) ?? .medium,
            category: TicketCategory(api: dto.category) ?? .general,
            channel: TicketChannel(api: dto.channel) ?? .webForm,
            org: orgRef(fromTicket: dto),
            customer: user(id: dto.customerId, in: users),
            createdBy: user(id: dto.createdBy, in: users),
            assignees: dto.assignees.compactMap { user(id: $0, in: users) },
            tags: dto.tags,
            checklist: dto.checklist.map {
                ChecklistItem(id: $0.id ?? UUID().uuidString, text: $0.text, done: $0.done)
            },
            messages: mapped,
            activity: activity,
            createdAt: APIDate.parse(dto.createdAt) ?? .now,
            firstResponseAt: APIDate.parse(dto.firstResponseAt),
            resolvedAt: APIDate.parse(dto.resolvedAt)
        )
        // The list endpoint has no messages inline — carry its counts so the
        // cards still show conversation info before the detail fetch.
        ticket.serverMessageCount = dto.messageCount
        ticket.serverLastMessageAt = APIDate.parse(dto.lastMessageAt)
        return ticket
    }

    // MARK: Chat

    static func chatThread(
        _ dto: API.ChatThread,
        org: OrgRef,
        tagsById: [String: API.ChatTag],
        authors: [String: API.DisplayUser],
        unread: Bool
    ) -> ChatThread {
        ChatThread(
            id: dto.id,
            org: org,
            title: dto.title ?? "",
            resolved: dto.status == "resolved",
            unread: unread,
            tags: dto.tagIds.compactMap { id in
                guard let tag = tagsById[id] else { return nil }
                return ChatTag(label: tag.label, color: Color(css: tag.color, default: Color(hex: 0x7A9CF0)))
            },
            messages: dto.messages.map { chatMessage($0, authors: authors) }
        )
    }

    static func chatMessage(
        _ dto: API.ChatMessage,
        authors: [String: API.DisplayUser]
    ) -> ChatMessageItem {
        let author = user(id: dto.authorId, in: authors)
            ?? UserRef(name: "System", initials: "•", color: .gray)
        let ticketRef: String? =
            dto.kind == "system" && dto.meta?.event == "ticket_created"
                ? (dto.meta?.displayId ?? dto.meta?.ticketId)
                : nil
        return ChatMessageItem(
            id: dto.id,
            user: author,
            date: APIDate.parse(dto.createdAt) ?? .now,
            text: dto.body,
            systemTicketId: ticketRef
        )
    }

    // MARK: Notes & wiki

    static func note(_ dto: API.NoteListItem, sharedBy: UserRef? = nil) -> NoteItem {
        NoteItem(
            id: dto.id,
            kind: NoteKind(rawValue: dto.kind) ?? .quick,
            title: dto.title,
            icon: sfSymbol(forServerIcon: dto.icon),
            pinned: dto.pinned,
            sharedBy: sharedBy,
            updatedAt: APIDate.parse(dto.updatedAt) ?? .now,
            meetingDate: APIDate.parse(dto.meetingDate)
        )
    }

    static func noteDetail(_ dto: API.NoteDetail, into existing: NoteItem?) -> NoteItem {
        var note = existing ?? NoteItem(
            id: dto.id,
            kind: NoteKind(rawValue: dto.kind) ?? .quick,
            title: dto.title,
            icon: sfSymbol(forServerIcon: dto.icon)
        )
        note.title = dto.title
        note.pinned = dto.pinned
        note.bodyHtml = dto.bodyHtml
        note.meetingDate = APIDate.parse(dto.meetingDate)
        note.taskId = dto.taskId
        note.updatedAt = APIDate.parse(dto.updatedAt) ?? .now
        return note
    }

    static func wikiPage(_ dto: API.WikiTreeNode) -> WikiPageItem {
        WikiPageItem(
            id: dto.id,
            parentId: dto.parentId,
            title: dto.title,
            icon: dto.isFolder ? "folder" : sfSymbol(forServerIcon: dto.icon),
            isFolder: dto.isFolder,
            sortOrder: dto.sortOrder
        )
    }

    // MARK: Projects

    static func project(_ dto: API.Project, isFavorite: Bool) -> ProjectItem {
        let members = dto.members.map { member in
            UserRef(
                name: member.name,
                initials: initials(for: member.name),
                color: derivedColor(forUserId: member.id),
                serverId: member.id
            )
        }
        return ProjectItem(
            key: dto.key,
            serverId: dto.id,
            name: dto.name,
            color: Color(css: dto.color, default: Color(hex: 0x7A9CF0)),
            about: dto.description ?? "",
            status: ProjectStatus(api: dto.status) ?? .active,
            lead: dto.leadId.flatMap { leadId in members.first { $0.serverId == leadId } },
            members: members,
            updatedAt: APIDate.parse(dto.updatedAt) ?? .now,
            isFavorite: isFavorite
        )
    }
}
