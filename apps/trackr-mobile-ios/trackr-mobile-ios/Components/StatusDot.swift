//
//  StatusDot.swift
//  trackr-mobile-ios
//
//  Task status marker: one SF Symbol per status in the status colour, the
//  native counterpart of the web's lucide icons (components/StatusDot.svelte)
//  — no hand-drawn shapes.
//    backlog → circle.dashed            todo → circle
//    in progress → circle.lefthalf.filled   paused → pause.circle
//    in review → smallcircle.filled.circle  done → checkmark.circle
//    cancelled → xmark.circle
//

import SwiftUI

struct StatusDot: View {
    let status: TaskStatus
    var size: CGFloat = 16

    private var symbol: String {
        switch status {
        case .backlog: "circle.dashed"
        case .todo: "circle"
        case .inProgress: "circle.lefthalf.filled"
        case .paused: "pause.circle"
        case .inReview: "smallcircle.filled.circle"
        case .done: "checkmark.circle"
        case .cancelled: "xmark.circle"
        }
    }

    var body: some View {
        Image(systemName: symbol)
            .resizable()
            .scaledToFit()
            .fontWeight(.medium)
            .foregroundStyle(status.color)
            .frame(width: size, height: size)
            .accessibilityLabel(status.label)
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
