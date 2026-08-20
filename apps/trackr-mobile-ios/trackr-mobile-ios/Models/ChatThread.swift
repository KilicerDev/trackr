//
//  ChatThread.swift
//  trackr-mobile-ios
//
//  Web parity: server/chat.ts FeedThread — the org support chat. A
//  thread is a titled forum-style conversation: root message + replies,
//  tags, open/resolved status, and system markers (ticket created).
//

import SwiftUI

struct ChatTag: Hashable {
    let label: String
    let color: Color
}

struct ChatMessageItem: Identifiable, Hashable {
    let id = UUID()
    var user: UserRef
    var date: Date
    var text: String
    /// System marker (kind='system'), e.g. a ticket created from the thread.
    var systemTicketId: String?

    var isSystem: Bool { systemTicketId != nil }
}

struct ChatThread: Identifiable, Hashable {
    let id: String
    var org: OrgRef
    var title: String
    var resolved = false
    var unread = false
    var tags: [ChatTag] = []
    var messages: [ChatMessageItem] = []

    var root: ChatMessageItem? { messages.first }
    var replyCount: Int { max(0, messages.count - 1) }
    var lastActivityAt: Date { messages.map(\.date).max() ?? .distantPast }
}

// MARK: - Sample data (UI design phase only — replaced by /api/v1 later)

extension ChatThread {
    static let sampleTags: [ChatTag] = [
        ChatTag(label: "urgent", color: Color(hex: 0xEF4F5E)),
        ChatTag(label: "billing", color: Color(hex: 0xE9C46A)),
        ChatTag(label: "network", color: Color(hex: 0x7A9CF0)),
        ChatTag(label: "hardware", color: Color(hex: 0x7FC8A9)),
        ChatTag(label: "feature", color: Color(hex: 0xC08BD6)),
    ]

    static let samples: [ChatThread] = {
        let cal = Calendar.current
        func ago(hours: Int) -> Date {
            cal.date(byAdding: .hour, value: -hours, to: .now)!
        }
        let agents = TaskItem.sampleUsers
        let customers = TicketItem.sampleCustomers
        let orgs = TicketItem.sampleOrgs
        let tags = sampleTags
        return [
            ChatThread(id: "th-printer", org: orgs[0],
                       title: "Printer in the lab keeps jamming",
                       unread: true,
                       tags: [tags[3]],
                       messages: [
                           ChatMessageItem(user: customers[0], date: ago(hours: 3),
                                           text: "The lab printer jams on every second page since this morning. We cleaned the tray — no change. Can someone take a look this week?"),
                           ChatMessageItem(user: agents[2], date: ago(hours: 2),
                                           text: "Sounds like the pickup roller again. I'm on site Thursday anyway — I'll bring a replacement kit."),
                           ChatMessageItem(user: customers[0], date: ago(hours: 1),
                                           text: "Thursday works, thank you!"),
                       ]),
            ChatThread(id: "th-vpn", org: orgs[1],
                       title: "VPN feels slow in the mornings",
                       tags: [tags[2], tags[0]],
                       messages: [
                           ChatMessageItem(user: customers[1], date: ago(hours: 28),
                                           text: "Between 8 and 9 the VPN crawls — file shares take forever. After 9 everything is fine."),
                           ChatMessageItem(user: agents[1], date: ago(hours: 26),
                                           text: "That's the backup window overlapping with the morning login wave. I'll move the offsite backup to 5am and we'll watch it tomorrow."),
                           ChatMessageItem(user: agents[1], date: ago(hours: 25),
                                           text: "Tracked as a ticket so it doesn't get lost:",
                                           systemTicketId: "BAUM-31"),
                           ChatMessageItem(user: customers[1], date: ago(hours: 4),
                                           text: "This morning was noticeably better — thanks."),
                       ]),
            ChatThread(id: "th-monitors", org: orgs[2],
                       title: "Two more monitors for the service desk",
                       tags: [tags[3]],
                       messages: [
                           ChatMessageItem(user: customers[2], date: ago(hours: 50),
                                           text: "The two new colleagues at the service desk each need a second monitor, same model as the existing ones if possible."),
                           ChatMessageItem(user: agents[0], date: ago(hours: 47),
                                           text: "Same model is still available — I'll add them to next week's hardware order."),
                       ]),
            ChatThread(id: "th-invoice", org: orgs[0],
                       title: "Question about the August invoice",
                       resolved: true,
                       tags: [tags[1]],
                       messages: [
                           ChatMessageItem(user: customers[0], date: ago(hours: 120),
                                           text: "Is the practice software maintenance included in the flat fee or billed separately? The August invoice reads ambiguous."),
                           ChatMessageItem(user: agents[0], date: ago(hours: 118),
                                           text: "Included — the separate line is only the license pass-through. I'll make the wording clearer from September."),
                           ChatMessageItem(user: customers[0], date: ago(hours: 117),
                                           text: "Perfect, that clears it up."),
                       ]),
            ChatThread(id: "th-teams", org: orgs[1],
                       title: "Teams status not syncing with phone system",
                       tags: [tags[4]],
                       messages: [
                           ChatMessageItem(user: customers[1], date: ago(hours: 80),
                                           text: "When someone is on a call via the phone system, Teams still shows them as available. Could the two be linked?"),
                           ChatMessageItem(user: agents[1], date: ago(hours: 70),
                                           text: "There's a presence connector for that — it needs a small license upgrade. I'll put a proposal together."),
                       ]),
        ]
    }()
}
