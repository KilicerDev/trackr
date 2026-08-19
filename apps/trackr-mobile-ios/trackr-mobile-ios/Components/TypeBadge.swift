//
//  TypeBadge.swift
//  trackr-mobile-ios
//
//  Web parity (components/TypeBadge.svelte): tinted rounded badge with the
//  type icon, optional label.
//

import SwiftUI

struct TypeBadge: View {
    let type: TaskType
    var showLabel = true

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: type.systemImage)
                .font(.system(size: 11, weight: .semibold))
            if showLabel {
                Text(type.label)
                    .font(.system(size: 12, weight: .medium))
            }
        }
        .foregroundStyle(type.color)
        .padding(.horizontal, 6)
        .frame(height: 20)
        .background(type.color.opacity(0.08), in: .rect(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(type.color.opacity(0.25), lineWidth: 1)
        )
        .accessibilityLabel(type.label)
    }
}

#Preview {
    VStack(spacing: 10) {
        ForEach(TaskType.allCases) { TypeBadge(type: $0) }
        ForEach(TaskType.allCases) { TypeBadge(type: $0, showLabel: false) }
    }
    .padding()
}
