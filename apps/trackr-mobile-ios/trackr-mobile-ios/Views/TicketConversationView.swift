//
//  TicketConversationView.swift
//  trackr-mobile-ios
//
//  The ticket's conversation, rendered inline on the detail page: chat
//  bubbles (others left with their avatar and name in their color, the
//  signed-in user right in the accent tint, internal notes amber), day
//  separators between days, and system events as plain icon rows in time
//  order. The composer lives on the detail's bottom inset.
//

import SwiftUI

/// One entry of the ticket timeline — messages and typed activity merged.
enum TicketTimelineEvent: Identifiable {
    case message(TicketMessage)
    case activity(ActivityEvent)

    var id: String {
        switch self {
        case .message(let m): m.id
        case .activity(let a): a.id.uuidString
        }
    }

    var date: Date {
        switch self {
        case .message(let m): m.date
        case .activity(let a): a.date
        }
    }

    /// Messages and activity in time order. The description is shown as
    /// the detail's description block, so it stays out of the timeline.
    static func events(for ticket: TicketItem) -> [TicketTimelineEvent] {
        (ticket.messages.map(TicketTimelineEvent.message)
            + ticket.activity.map(TicketTimelineEvent.activity))
            .sorted { $0.date < $1.date }
    }
}

struct TicketConversationView: View {
    let ticket: TicketItem
    /// The signed-in user — their messages go on the right.
    var me: UserRef? = nil

    private var events: [TicketTimelineEvent] { TicketTimelineEvent.events(for: ticket) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(events.enumerated()), id: \.element.id) { index, event in
                if index == 0 || !Calendar.current.isDate(events[index - 1].date, inSameDayAs: event.date) {
                    ChatDayPill(date: event.date)
                }
                row(for: event).id(event.id)
            }
            if events.isEmpty {
                Text("No activity yet.")
                    .font(.system(size: 14))
                    .foregroundStyle(TK.text3)
                    .padding(.vertical, 8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Rows

    @ViewBuilder
    private func row(for event: TicketTimelineEvent) -> some View {
        switch event {
        case .message(let message):
            ChatBubbleRow(
                user: message.user,
                text: message.text,
                date: message.date,
                attachments: message.attachments,
                pendingFiles: message.pendingFiles,
                mine: message.user.isSame(as: me),
                accent: message.internalNote ? TK.amber : nil,
                badge: message.internalNote ? "lock.fill" : nil
            )
        case .activity(let activity):
            TimelineRow(
                node: .icon(activity.icon),
                name: activity.user.name,
                action: activity.text,
                date: activity.date
            )
            .padding(.vertical, 2)
        }
    }
}

#Preview {
    ScrollView {
        TicketConversationView(ticket: TicketItem.samples[1], me: TaskItem.sampleUsers[0])
            .padding(16)
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
