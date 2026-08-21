//
//  PropertyChip.swift
//  trackr-mobile-ios
//
//  Web parity (TaskPropertyRail.svelte / Inspector chips): neutral surface
//  buttons — colored glyph, primary label, hairline border. Empty fields
//  render as dashed ghost chips, the planned date as an accent-tinted chip.
//

import SwiftUI

enum PropertyChipStyle {
    /// Value set: surface background + solid hairline border, primary text.
    case filled
    /// No value yet: dashed border, no fill, tertiary text.
    case empty
    /// Planned-for date: accent-tinted fill, accent text, no border.
    case accent
}

struct PropertyChip<Content: View>: View {
    var style: PropertyChipStyle = .filled
    @ViewBuilder var content: () -> Content

    var body: some View {
        HStack(spacing: 6, content: content)
            .font(.system(size: 14))
            .foregroundStyle(foreground)
            .padding(.horizontal, 11)
            .frame(height: 34)
            .background(background, in: .rect(cornerRadius: 10))
            .overlay {
                switch style {
                case .filled:
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(Color(.separator).opacity(0.5), lineWidth: 1)
                case .empty:
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(
                            Color(.separator).opacity(0.8),
                            style: StrokeStyle(lineWidth: 1, dash: [4, 3])
                        )
                case .accent:
                    EmptyView()
                }
            }
    }

    // Concrete colors on purpose: inside Menu labels the hierarchical
    // styles derive from the accent tint and render pink.
    private var foreground: Color {
        switch style {
        case .filled: Color.primary
        case .empty: Color(.tertiaryLabel)
        case .accent: Color.accentColor
        }
    }

    private var background: Color {
        switch style {
        case .filled: Color(.secondarySystemGroupedBackground)
        case .empty: .clear
        case .accent: Color.accentColor.opacity(0.14)
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
        PropertyChip {
            TypeBadge(type: .feature, showLabel: false)
            Text("Feature")
        }
        PropertyChip {
            StatusDot(status: .inProgress, size: 14)
            Text("In Progress")
        }
        PropertyChip {
            PriorityBars(priority: .high)
            Text("High")
        }
        PropertyChip(style: .empty) {
            Image(systemName: "calendar").font(.system(size: 12))
            Text("Due date")
        }
        PropertyChip(style: .accent) {
            Image(systemName: "bookmark").font(.system(size: 12))
            Text("Aug 22, 2026").monospaced()
        }
        PropertyChip {
            Text("Est").foregroundStyle(Color(.secondaryLabel))
            Text("8h").monospaced()
        }
    }
    .padding()
}
