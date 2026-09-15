//
//  PriorityBars.swift
//  trackr-mobile-ios
//
//  Web parity (components/PriorityBars.svelte) in the prototype's metric:
//  three ascending 3pt bars (5 / 8.5 / 12), unlit bars on white-15%.
//

import SwiftUI

struct PriorityBars: View {
    let priority: TaskPriority

    private let heights: [CGFloat] = [5, 8.5, 12]

    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(0..<3, id: \.self) { index in
                RoundedRectangle(cornerRadius: 1)
                    .fill(priority.bars > index ? priority.color : TK.mono(0.15))
                    .frame(width: 3, height: heights[index])
            }
        }
        .frame(height: 12, alignment: .bottom)
        .accessibilityLabel(priority.label)
    }
}

#Preview {
    HStack(spacing: 16) {
        ForEach(TaskPriority.allCases) { PriorityBars(priority: $0) }
    }
    .padding()
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
