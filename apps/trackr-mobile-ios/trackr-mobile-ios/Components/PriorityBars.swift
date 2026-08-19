//
//  PriorityBars.swift
//  trackr-mobile-ios
//
//  Web parity (components/PriorityBars.svelte): three ascending bars,
//  unlit bars at 35% opacity.
//

import SwiftUI

struct PriorityBars: View {
    let priority: TaskPriority

    private let heights: [CGFloat] = [5, 8, 11]

    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(0..<3, id: \.self) { index in
                RoundedRectangle(cornerRadius: 1)
                    .fill(priority.color)
                    .frame(width: 4, height: heights[index])
                    // Bar 1 lights up from level 1, bars 2/3 from their level.
                    .opacity(priority.bars >= max(index + 1, 1) && priority.bars > 0 ? 1 : 0.35)
            }
        }
        .frame(height: 13, alignment: .bottom)
        .accessibilityLabel(priority.label)
    }
}

#Preview {
    HStack(spacing: 16) {
        ForEach(TaskPriority.allCases) { PriorityBars(priority: $0) }
    }
    .padding()
}
