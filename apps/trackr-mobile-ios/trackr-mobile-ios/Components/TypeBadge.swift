//
//  TypeBadge.swift
//  trackr-mobile-ios
//
//  Web parity (components/TypeBadge.svelte) in the prototype's shape: a
//  22pt rounded tile (radius 6) tinted with the type color, holding the
//  type glyph. With `showLabel` the tile grows into a chip with the name.
//

import SwiftUI

struct TypeBadge: View {
    let type: TaskType
    var showLabel = true
    /// Tile size for the icon-only form (prototype: 22 in chips, 18 in rows).
    var size: CGFloat = 22

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: type.systemImage)
                .font(.system(size: showLabel ? 11 : size * 0.55, weight: .semibold))
                .foregroundStyle(type.color)
                .frame(width: showLabel ? nil : size, height: showLabel ? nil : size)
            if showLabel {
                Text(type.label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(type.color)
            }
        }
        .padding(.horizontal, showLabel ? 7 : 0)
        .frame(height: showLabel ? 22 : size)
        .background(TK.tint(type.color), in: .rect(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(TK.tintBorder(type.color), lineWidth: 1))
        .accessibilityLabel(type.label)
    }
}

#Preview {
    VStack(spacing: 10) {
        ForEach(TaskType.allCases) { TypeBadge(type: $0) }
        HStack { ForEach(TaskType.allCases) { TypeBadge(type: $0, showLabel: false) } }
        HStack { ForEach(TaskType.allCases) { TypeBadge(type: $0, showLabel: false, size: 18) } }
    }
    .padding()
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
