//
//  TicketCard.swift
//  trackr-mobile-ios
//
//  Ticket sibling of TaskCard: same elevated card recipe, ticket-specific
//  meta row — org chip, message count, SLA signal or last activity.
//

import SwiftUI

struct TicketCard: View {
    let ticket: TicketItem
    /// Row inside a group-section container: the section owns background
    /// and border, the card renders content only.
    var embedded = false

    var body: some View {
        if embedded {
            content
        } else {
            content
                .background(
                    Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
                )
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Line 1: identity — subject truncates, it never wraps.
            HStack(spacing: 10) {
                Circle()
                    .fill(ticket.status.color)
                    .frame(width: 10, height: 10)
                Text(ticket.subject)
                    .font(.system(size: 15, weight: .medium))
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 8)
                if !ticket.assignees.isEmpty {
                    AvatarStack(users: ticket.assignees, size: 24)
                }
            }

            // Line 2: meta — id, priority, org, messages, SLA/last activity.
            HStack(spacing: 10) {
                Text(ticket.id)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.tertiary)

                if ticket.priority != .none {
                    PriorityBars(priority: ticket.priority)
                }

                HStack(spacing: 4) {
                    Circle()
                        .fill(ticket.org.color)
                        .frame(width: 6, height: 6)
                    Text(ticket.org.name)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                if ticket.messageCount > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "bubble.left")
                            .font(.system(size: 10))
                        Text("\(ticket.messageCount)")
                            .font(.system(size: 12, design: .monospaced))
                    }
                    .foregroundStyle(Color(.tertiaryLabel))
                }

                Spacer()

                trailingSignal
            }
            .lineLimit(1)

            // Line 3 (only when there is something to show): tags.
            if !ticket.tags.isEmpty {
                HStack(spacing: 6) {
                    ForEach(ticket.tags.prefix(3), id: \.self) { tag in
                        TagChip(tag: tag)
                    }
                    if ticket.tags.count > 3 {
                        Text("+\(ticket.tags.count - 3)")
                            .font(.system(size: 12))
                            .foregroundStyle(.tertiary)
                    }
                }
                .lineLimit(1)
            }
        }
        .padding(14)
    }

    /// SLA signal when there is one, last-activity time otherwise — the
    /// row never shows both (web parity with the list row).
    @ViewBuilder
    private var trailingSignal: some View {
        if let sla = ticket.slaSignal {
            HStack(spacing: 4) {
                Circle()
                    .fill(sla.color)
                    .frame(width: 6, height: 6)
                Text(sla.label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        } else {
            Text(ticket.lastActivityAt.relativeShort)
                .font(.system(size: 12))
                .foregroundStyle(.tertiary)
        }
    }
}

#Preview {
    ScrollView {
        LazyVStack(spacing: 10) {
            ForEach(TicketItem.samples) { TicketCard(ticket: $0) }
        }
        .padding(16)
    }
    .background(Color.webBackground)
}
