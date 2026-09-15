//
//  TicketConversationView.swift
//  trackr-mobile-ios
//
//  The ticket's activity timeline, rendered inline on the detail page
//  (no separate push any more): customer / agent replies as MessageCards,
//  amber-tinted internal notes, and system events as icon nodes — all in
//  time order. The composer lives on the detail's bottom inset.
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

    private var events: [TicketTimelineEvent] { TicketTimelineEvent.events(for: ticket) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(events) { event in
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
        // The rail: a hairline behind the node column.
        .background(alignment: .leading) {
            if events.count > 1 {
                Rectangle()
                    .fill(TK.hairlineStrong)
                    .frame(width: 1)
                    .offset(x: TimelineRow<EmptyView>.nodeSize / 2)
                    .padding(.vertical, 12)
            }
        }
    }

    @ViewBuilder
    private func row(for event: TicketTimelineEvent) -> some View {
        switch event {
        case .message(let message):
            TimelineRow(
                node: .avatar(message.user),
                name: message.user.name,
                action: message.internalNote ? "added an" : "replied",
                date: message.date,
                tag: message.internalNote ? ("internal note", TK.amber) : nil
            ) {
                MessageCard(
                    text: message.text,
                    accent: message.internalNote ? TK.amber : nil,
                    attachments: message.attachments,
                    pendingFiles: message.pendingFiles
                )
            }
        case .activity(let activity):
            TimelineRow(
                node: .icon(activity.icon),
                name: activity.user.name,
                action: activity.text,
                date: activity.date
            )
        }
    }
}

#Preview {
    ScrollView {
        TicketConversationView(ticket: TicketItem.samples[1])
            .padding(16)
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
