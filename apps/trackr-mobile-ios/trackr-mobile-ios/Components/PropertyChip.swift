//
//  PropertyChip.swift
//  trackr-mobile-ios
//
//  The prototype's property chip (detail views, create sheet): 38pt tall,
//  radius 10, card fill with the strong border, 14pt medium label, optional
//  trailing chevron when the chip opens a picker. Empty fields render as
//  dashed ghost chips, the planned date as an accent-tinted chip.
//

import SwiftUI

enum PropertyChipStyle {
    /// Value set: card fill + strong hairline border, primary text.
    case filled
    /// No value yet: dashed border, no fill, secondary text.
    case empty
    /// Planned-for date / selected filter: accent-tinted fill + accent border.
    case accent
}

struct PropertyChip<Content: View>: View {
    var style: PropertyChipStyle = .filled
    /// Trailing 10pt chevron — set on chips that open a picker.
    var chevron = false
    /// Tighter leading padding for chips that start with an avatar/tile.
    var leadingInset: CGFloat = 12
    @ViewBuilder var content: () -> Content

    var body: some View {
        HStack(spacing: 8) {
            content()
            if chevron {
                TKChevron()
            }
        }
        .font(.tkChip)
        .foregroundStyle(foreground)
        .padding(.leading, leadingInset)
        .padding(.trailing, 12)
        .frame(height: 38)
        .background(background, in: .rect(cornerRadius: TK.rChip))
        .overlay {
            switch style {
            case .filled:
                RoundedRectangle(cornerRadius: TK.rChip)
                    .strokeBorder(TK.borderStrong, lineWidth: 1)
            case .empty:
                RoundedRectangle(cornerRadius: TK.rChip)
                    .strokeBorder(TK.borderDashed, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            case .accent:
                RoundedRectangle(cornerRadius: TK.rChip)
                    .strokeBorder(TK.accentBorder, lineWidth: 1)
            }
        }
        .contentShape(.rect)
    }

    // Concrete colors on purpose: inside Menu labels the hierarchical
    // styles derive from the accent tint and render pink.
    private var foreground: Color {
        switch style {
        case .filled: TK.text
        case .empty: TK.text2
        case .accent: TK.accent
        }
    }

    private var background: Color {
        switch style {
        case .filled: TK.card
        case .empty: .clear
        case .accent: TK.accentSoft
        }
    }
}

/// Left-aligned wrapping row, like the web rail's `flex flex-wrap gap-2`.
struct ChipFlow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width
            widest = max(widest, x)
            x += spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth.isFinite ? maxWidth : widest, height: y + rowHeight)
    }

    func placeSubviews(
        in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
    ) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

#Preview {
    ChipFlow {
        PropertyChip(chevron: true, leadingInset: 10) {
            TypeBadge(type: .feature, showLabel: false)
            Text("Feature")
        }
        PropertyChip(chevron: true, leadingInset: 10) {
            StatusDot(status: .inProgress, size: 18)
            Text("In Progress")
        }
        PropertyChip(chevron: true, leadingInset: 10) {
            PriorityBars(priority: .high)
            Text("High")
        }
        PropertyChip(style: .empty, chevron: true) {
            Image(systemName: "calendar").font(.system(size: 12))
            Text("Due date")
        }
        PropertyChip(style: .accent) {
            Image(systemName: "bookmark").font(.system(size: 12))
            Text("Aug 22, 2026").font(.tkMono(14))
        }
        PropertyChip {
            Text("Est").foregroundStyle(TK.text2)
            Text("8h").font(.tkMono(14))
        }
    }
    .padding()
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
