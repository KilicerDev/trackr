//
//  StatusDot.swift
//  trackr-mobile-ios
//
//  Web parity (components/StatusDot.svelte): each status has a distinct
//  glyph, not just a color — dashed ring, ring, partial pie, pause bar,
//  filled dot.
//

import SwiftUI

struct StatusDot: View {
    let status: TaskStatus
    var size: CGFloat = 15

    private var lineWidth: CGFloat { 1.5 }

    var body: some View {
        ZStack {
            switch status {
            case .backlog:
                ring(dash: [2.5, 2.5]).opacity(0.7)
            case .todo:
                ring()
            case .inProgress:
                ring()
                pie(fraction: 0.6)
            case .paused:
                ring()
                RoundedRectangle(cornerRadius: 1)
                    .fill(status.color)
                    .frame(width: size * 0.45, height: size * 0.18)
            case .inReview:
                ring()
                pie(fraction: 0.75)
            case .done:
                Circle().fill(status.color)
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel(status.label)
    }

    private func ring(dash: [CGFloat] = []) -> some View {
        Circle()
            .strokeBorder(status.color, style: StrokeStyle(lineWidth: lineWidth, dash: dash))
    }

    private func pie(fraction: Double) -> some View {
        PieSlice(fraction: fraction)
            .fill(status.color)
            .padding(lineWidth + 2)
    }
}

/// Filled pie wedge starting at 12 o'clock, like the web's conic-gradient.
private struct PieSlice: Shape {
    let fraction: Double

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)
        path.move(to: center)
        path.addArc(
            center: center,
            radius: min(rect.width, rect.height) / 2,
            startAngle: .degrees(-90),
            endAngle: .degrees(-90 + 360 * fraction),
            clockwise: false
        )
        path.closeSubpath()
        return path
    }
}

#Preview {
    HStack(spacing: 12) {
        ForEach(TaskStatus.allCases) { StatusDot(status: $0) }
    }
    .padding()
}
