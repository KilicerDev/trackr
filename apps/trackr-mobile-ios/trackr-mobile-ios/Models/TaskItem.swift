//
//  TaskItem.swift
//  trackr-mobile-ios
//
//  Named TaskItem (not Task) to avoid clashing with Swift Concurrency's Task.
//

import SwiftUI

struct UserRef: Hashable {
    let name: String
    let initials: String
    let color: Color
    /// Server user id — nil for sample/preview data.
    var serverId: String? = nil
}

struct ChecklistItem: Identifiable, Hashable {
    // String (not UUID) so server checklist ids survive round-trips — the
    // ticket↔task checklist sync matches items by id.
    var id: String = UUID().uuidString
    var text: String
    var done = false
}

/// Cross-link between a converted ticket and its task (either direction):
/// TaskItem.sourceTicket points back at the ticket, TicketItem.linkedTasks
/// forward at the tasks. Navigation resolves the full item by uuid.
struct ConversionLink: Hashable {
    var uuid: String
    var displayId: String
    var title: String = ""
    /// Task status for linked-task rows (web parity: StatusDot per row);
    /// unused on the sourceTicket direction.
    var status: TaskStatus = .todo
}

struct TaskComment: Identifiable, Hashable {
    var id: String = UUID().uuidString
    var user: UserRef
    var date: Date
    var text: String
    var attachments: [AttachmentItem] = []
    /// Optimistic-only: files still uploading for a just-sent comment.
    var pendingFiles: [PickedFile] = []
}

/// A system event on the activity timeline ("changed status to Done") —
/// shared by tasks and tickets; comments/messages live in their own types.
/// Web parity: the Inspector's typed activity entries.
struct ActivityEvent: Identifiable, Hashable {
    let id = UUID()
    var user: UserRef
    var date: Date
    var text: String  // action phrase after the name, e.g. "changed status to Done"
    var icon: String
}

struct TimeLog: Identifiable, Hashable {
    var id: String = UUID().uuidString
    var user: UserRef
    var minutes: Int
    var date: Date
    var note: String?
}

struct TaskItem: Identifiable, Hashable {
    let id: String
    /// Server task UUID (the PATCH/comment/time endpoints key) — nil for
    /// sample/preview data.
    var uuid: String? = nil
    var title: String
    var status: TaskStatus
    var priority: TaskPriority
    var type: TaskType
    var project: String
    var details = ""
    var due: Date?
    var plannedFor: Date?
    /// Server timestamps — nil for sample data. Used by the sort keys.
    var createdAt: Date? = nil
    var updatedAt: Date? = nil
    var checklist: [ChecklistItem] = []
    var estimate: Int?  // minutes
    var assignees: [UserRef] = []
    var tags: [String] = []
    var timeLogs: [TimeLog] = []
    var comments: [TaskComment] = []
    var activity: [ActivityEvent] = []
    /// Detail-fetch only — list rows arrive without attachments and the
    /// refresh merge preserves loaded ones (like ticket messages).
    var attachments: [AttachmentItem] = []
    /// Set when this task was converted out of a ticket — the back-link.
    var sourceTicket: ConversionLink? = nil

    var checklistDone: Int { checklist.count { $0.done } }
    var checklistTotal: Int { checklist.count }
    var loggedMinutes: Int { timeLogs.reduce(0) { $0 + $1.minutes } }

    /// Web parity (utils/format.ts dueCountdown): relative label + urgency
    /// tone within a week of the due date, nil label beyond that so callers
    /// fall back to the absolute date. Done tasks are never "overdue".
    var dueCountdown: (label: String, tone: DueTone)? {
        guard let due, status != .done else { return nil }
        let days = Calendar.current
            .dateComponents([.day], from: .now.startOfDay, to: due.startOfDay)
            .day ?? 0
        switch days {
        case ..<0: return ("Overdue", .overdue)
        case 0: return ("Today", .urgent)
        case 1: return ("1d left", .urgent)
        case ...3: return ("\(days)d left", .urgent)
        case ...7: return ("\(days)d left", .soon)
        default: return nil
        }
    }
}

extension Date {
    var startOfDay: Date { Calendar.current.startOfDay(for: self) }
}

extension Int {
    /// Minutes as "2h 30m" / "3h" / "45m" — web parity with formatEstimate.
    var minutesFormatted: String {
        let h = self / 60
        let m = self % 60
        if h > 0 && m > 0 { return "\(h)h \(m)m" }
        if h > 0 { return "\(h)h" }
        return "\(m)m"
    }
}

// MARK: - Sample data (UI design phase only — replaced by /api/v1 later)

extension TaskItem {
    static let sampleUsers = [
        UserRef(name: "Max Muster", initials: "MM", color: Color(hex: 0x7A9CF0)),
        UserRef(name: "Mara Steiner", initials: "MS", color: Color(hex: 0xC08BD6)),
        UserRef(name: "Jonas Weber", initials: "JW", color: Color(hex: 0x7FC8A9)),
    ]

    static let samples: [TaskItem] = {
        let cal = Calendar.current
        func day(_ offset: Int) -> Date {
            cal.date(byAdding: .day, value: offset, to: .now)!
        }
        return [
            TaskItem(id: "TRK-142", title: "Native iOS tab bar with Liquid Glass",
                     status: .inProgress, priority: .high, type: .feature,
                     project: "Mobile App",
                     details: "Rebuild the mobile shell as a native SwiftUI app. Start with the new iOS 26 tab bar, then port the task views screen by screen.",
                     due: day(1),
                     plannedFor: day(1),
                     checklist: [
                         ChecklistItem(text: "Tab bar with search role", done: true),
                         ChecklistItem(text: "Tasks list with cards", done: true),
                         ChecklistItem(text: "Filter sheet"),
                         ChecklistItem(text: "Task detail view"),
                         ChecklistItem(text: "Create task sheet"),
                     ],
                     estimate: 480,
                     assignees: [sampleUsers[0], sampleUsers[2]],
                     tags: ["mobile", "swiftui"],
                     timeLogs: [
                         TimeLog(user: sampleUsers[0], minutes: 150, date: day(-1),
                                 note: "Tab bar and navigation skeleton"),
                         TimeLog(user: sampleUsers[0], minutes: 90, date: day(0),
                                 note: "Task cards and filters"),
                     ],
                     comments: [
                         TaskComment(user: sampleUsers[2], date: day(-2),
                                     text: "Should we mirror the web taxonomy colors 1:1 or adapt them for OLED black? I'd vote 1:1 so screenshots match."),
                         TaskComment(user: sampleUsers[0], date: day(-1),
                                     text: "1:1 — the hex values come straight from taxonomy.ts now. Filter sheet is next."),
                         TaskComment(user: sampleUsers[1], date: day(0),
                                     text: "Looks great on the 16 Pro Max. One thing: the group headers could use a bit more top spacing."),
                     ],
                     activity: [
                         ActivityEvent(user: sampleUsers[0], date: day(-3),
                                       text: "created the task", icon: "plus.circle"),
                         ActivityEvent(user: sampleUsers[0], date: day(-2),
                                       text: "added Jonas Weber", icon: "person.badge.plus"),
                         ActivityEvent(user: sampleUsers[0], date: day(-1),
                                       text: "changed status to In Progress",
                                       icon: "arrow.triangle.2.circlepath"),
                     ]),
            TaskItem(id: "TRK-139", title: "Fix dark mode colors in email templates",
                     status: .inProgress, priority: .urgent, type: .bug,
                     project: "Trackr Web",
                     details: "Outlook dark mode inverts the header background — logo becomes invisible.",
                     due: day(0),
                     plannedFor: day(0),
                     estimate: 120,
                     assignees: [sampleUsers[1]],
                     tags: ["email"],
                     timeLogs: [
                         TimeLog(user: sampleUsers[1], minutes: 45, date: day(0),
                                 note: "Reproduced in Outlook and litmus"),
                     ],
                     comments: [
                         TaskComment(user: sampleUsers[1], date: day(0),
                                     text: "Root cause: Outlook inverts any background darker than #333. Fix is a VML fallback."),
                     ],
                     activity: [
                         ActivityEvent(user: sampleUsers[1], date: day(-1),
                                       text: "created the task", icon: "plus.circle"),
                         ActivityEvent(user: sampleUsers[1], date: day(0),
                                       text: "changed priority to Urgent", icon: "flag"),
                     ]),
            TaskItem(id: "TRK-131", title: "Project differentiation in my-week view",
                     status: .inReview, priority: .medium, type: .improvement,
                     project: "Trackr Web", due: day(6), plannedFor: day(3),
                     assignees: [sampleUsers[0]], tags: ["ui"]),
            TaskItem(id: "TRK-127", title: "History quick view link",
                     status: .done, priority: .medium, type: .feature,
                     project: "Trackr Web",
                     estimate: 60,
                     assignees: [sampleUsers[2]],
                     timeLogs: [
                         TimeLog(user: sampleUsers[2], minutes: 75, date: day(-4),
                                 note: "Link + quick view popover"),
                     ],
                     comments: [
                         TaskComment(user: sampleUsers[2], date: day(-5),
                                     text: "Quick view opens in a popover instead of navigating away — matches the web."),
                     ],
                     activity: [
                         ActivityEvent(user: sampleUsers[0], date: day(-6),
                                       text: "created the task", icon: "plus.circle"),
                         ActivityEvent(user: sampleUsers[2], date: day(-4),
                                       text: "changed status to Done",
                                       icon: "arrow.triangle.2.circlepath"),
                     ]),
            TaskItem(id: "TRK-125", title: "Selection color follows primary color",
                     status: .done, priority: .low, type: .improvement,
                     project: "Trackr Web",
                     assignees: [sampleUsers[0]]),
            TaskItem(id: "TRK-118", title: "Migrate email polling to our own IMAP server",
                     status: .todo, priority: .high, type: .task,
                     project: "Infrastructure",
                     details: "Replace the external provider with our own mail server, IMAP-poll based.",
                     due: day(-2),
                     plannedFor: day(-8),
                     checklist: [
                         ChecklistItem(text: "Mail server on staging"),
                         ChecklistItem(text: "IMAP poll worker"),
                         ChecklistItem(text: "Cutover plan"),
                     ],
                     estimate: 360,
                     assignees: [sampleUsers[1]],
                     tags: ["email", "backend"]),
            TaskItem(id: "TRK-116", title: "Upgrade Postgres to 17 on staging",
                     status: .todo, priority: .none, type: .chore,
                     project: "Infrastructure"),
            TaskItem(id: "TRK-102", title: "Push notifications via FCM worker",
                     status: .backlog, priority: .low, type: .feature,
                     project: "Mobile App", due: day(21),
                     tags: ["mobile"]),
            TaskItem(id: "TRK-097", title: "Keyboard shortcuts cheat sheet",
                     status: .backlog, priority: .none, type: .task,
                     project: "Trackr Web",
                     assignees: [sampleUsers[2]]),
            TaskItem(id: "TRK-090", title: "Rate limiting on public ticket form",
                     status: .paused, priority: .medium, type: .improvement,
                     project: "Infrastructure", due: day(4), plannedFor: day(1),
                     estimate: 90,
                     assignees: [sampleUsers[0]], tags: ["backend"]),
        ]
    }()
}
