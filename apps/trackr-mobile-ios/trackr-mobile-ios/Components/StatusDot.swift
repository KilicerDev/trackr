//
//  StatusDot.swift
//  trackr-mobile-ios
//
//  Web parity (components/StatusDot.svelte) with the prototype's glyphs:
//  dashed ring (backlog), ring (todo), half pie (in progress), ring with a
//  pause bar (paused), three-quarter pie (in review), filled dot with a
//  check (done). Colors come from the taxonomy.
//

import SwiftUI

struct StatusDot: View {
    let status: TaskStatus
    var size: CGFloat = 16

    private var lineWidth: CGFloat { max(1.4, size * 0.1) }

    var body: some View {
        ZStack {
            switch status {
            case .backlog:
                ring(dash: [2, 2])
            case .todo:
                ring()
            case .inProgress:
                ring()
                pie(fraction: 0.5)
            case .paused:
                ring()
                RoundedRectangle(cornerRadius: 1)
                    .fill(status.color)
                    .frame(width: size * 0.4, height: lineWidth)
            case .inReview:
                ring()
                pie(fraction: 0.75)
            case .done:
                Circle().fill(status.color)
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.45, weight: .bold))
                    .foregroundStyle(TK.bg)
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
            .padding(lineWidth + 1.5)
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
        ForEach(TaskStatus.allCases) { StatusDot(status: $0, size: 18) }
    }
    .padding()
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
