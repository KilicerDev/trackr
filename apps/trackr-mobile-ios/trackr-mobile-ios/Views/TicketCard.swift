//
//  TicketCard.swift
//  trackr-mobile-ios
//
//  Prototype ticket row (list) and ticket card (board). The row is flat —
//  the list separates rows with hairlines; the board card is a small
//  `.tkCard`. Both are dumb views: the list attaches navigation and the
//  context menu.
//

import SwiftUI

/// Kept for call sites that still name the old card.
typealias TicketCard = TicketRow

/// List row: bars · KEY · org on line 1, subject on line 2, SLA/time +
/// assignee avatar + chevron on the right. 60pt minimum.
struct TicketRow: View {
    let ticket: TicketItem
    /// Hide the org when the list is already grouped by organization.
    var showOrg = true

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    PriorityBars(priority: ticket.priority)
                    Text(ticket.id)
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                        .fixedSize()
                    if showOrg {
                        Text(ticket.org.name)
                            .font(.tkMetaSm)
                            .foregroundStyle(TK.text3)
                            .lineLimit(1)
                    }
                    if ticket.checklistTotal > 0 {
                        HStack(spacing: 3) {
                            Image(systemName: "checklist")
                                .font(.system(size: 9))
                            Text("\(ticket.checklistDone)/\(ticket.checklistTotal)")
                                .font(.tkMono(11))
                        }
                        .foregroundStyle(
                            ticket.checklistDone == ticket.checklistTotal ? TK.success : TK.text3
                        )
                        .fixedSize()
                    }
                }
                Text(ticket.subject)
                    .font(.tkRow)
                    .foregroundStyle(TK.text)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            signal
            AvatarView(user: ticket.assignees.first, size: 26)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(TK.mono(0.30))
        }
        .padding(.horizontal, TK.gutter)
        .padding(.vertical, 12)
        .frame(minHeight: 60)
        .contentShape(.rect)
    }

    /// SLA signal (colored dot + when) or the last-activity time — one
    /// short mono value, never both (web list row parity).
    @ViewBuilder
    private var signal: some View {
        if let sla = ticket.slaSignal {
            HStack(spacing: 4) {
                TKDot(color: sla.color, size: 6)
                Text(slaWhen)
                    .font(.tkMono(11))
                    .foregroundStyle(TK.text3)
            }
            .fixedSize()
        } else {
            Text(ticket.lastActivityAt.relativeShort)
                .font(.tkMono(11))
                .foregroundStyle(TK.text3)
                .fixedSize()
        }
    }

    private var slaWhen: String {
        if ticket.status.isClosed, let when = ticket.resolvedAt { return when.relativeShort }
        return ticket.createdAt.relativeShort
    }
}

/// Board card: KEY + bars on top, subject 14, org · avatar 22.
struct TicketBoardCard: View {
    let ticket: TicketItem

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(ticket.id)
                    .font(.tkMono(11))
                    .foregroundStyle(TK.text3)
                Spacer(minLength: 4)
                if let sla = ticket.slaSignal {
                    TKDot(color: sla.color, size: 6)
                }
                PriorityBars(priority: ticket.priority)
            }
            Text(ticket.subject)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(TK.text)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 6) {
                TKDot(color: ticket.org.color, size: 6)
                Text(ticket.org.name)
                    .font(.tkMetaSm)
                    .foregroundStyle(TK.text3)
                    .lineLimit(1)
                Spacer(minLength: 4)
                AvatarView(user: ticket.assignees.first, size: 22)
            }
        }
        .tkCard(radius: TK.rCardSm, padding: 12)
        .contentShape(.rect)
    }
}

#Preview("Rows") {
    ScrollView {
        VStack(spacing: 0) {
            ForEach(TicketItem.samples) { ticket in
                TKHairline()
                TicketRow(ticket: ticket)
            }
        }
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}

#Preview("Board card") {
    VStack(spacing: 8) {
        ForEach(TicketItem.samples.prefix(3)) { TicketBoardCard(ticket: $0) }
    }
    .frame(width: 250)
    .padding()
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
