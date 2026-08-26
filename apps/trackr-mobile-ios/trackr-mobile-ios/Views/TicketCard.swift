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
    /// Hide the org chip when the list is already grouped by organization.
    var showOrg = true

    var body: some View {
        Group {
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
        // Make the whole card tappable. Embedded cards have no background, and
        // a plain-style NavigationLink only hit-tests opaque pixels — so the
        // gaps between text/avatars would otherwise swallow the tap.
        .contentShape(.rect)
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

            // Line 2: compact mono stats — id, priority, checklist, messages —
            // and the SLA / last-activity signal. Nothing here truncates:
            // the stats are fixed-size and the signal is short.
            HStack(spacing: 8) {
                Text(ticket.id)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.tertiary)
                    .fixedSize()

                if ticket.priority != .none {
                    PriorityBars(priority: ticket.priority)
                }

                if ticket.checklistTotal > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "checklist")
                            .font(.system(size: 10))
                        Text("\(ticket.checklistDone)/\(ticket.checklistTotal)")
                            .font(.system(size: 12, design: .monospaced))
                    }
                    .foregroundStyle(
                        ticket.checklistDone == ticket.checklistTotal
                            ? Color(hex: 0x7FC8A9)
                            : Color(.tertiaryLabel)
                    )
                    .fixedSize()
                }

                if ticket.messageCount > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "bubble.left")
                            .font(.system(size: 10))
                        Text("\(ticket.messageCount)")
                            .font(.system(size: 12, design: .monospaced))
                    }
                    .foregroundStyle(Color(.tertiaryLabel))
                    .fixedSize()
                }

                Spacer(minLength: 8)

                trailingSignal
                    .fixedSize()
            }
            .lineLimit(1)

            // Line 3 (only when there is something to show): org + tags —
            // the wide, text-heavy bits get their own line.
            if hasChipsLine {
                HStack(spacing: 6) {
                    if showOrg {
                        orgChip
                    }
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

    private var hasChipsLine: Bool { showOrg || !ticket.tags.isEmpty }

    /// Org as a soft chip, tinted with the org color (web TicketRow parity).
    private var orgChip: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(ticket.org.color)
                .frame(width: 6, height: 6)
            Text(ticket.org.name)
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
        }
        .foregroundStyle(.secondary)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(ticket.org.color.opacity(0.12), in: .rect(cornerRadius: 6))
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
