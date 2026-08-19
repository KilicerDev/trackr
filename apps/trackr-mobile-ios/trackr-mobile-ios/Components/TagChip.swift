//
//  TagChip.swift
//  trackr-mobile-ios
//
//  Web parity (components/LabelChip.svelte): mono tag chip tinted with a
//  stable per-tag color.
//

import SwiftUI

struct TagChip: View {
    let tag: String

    /// Deterministic palette pick so a tag keeps its color everywhere —
    /// palette from the web taxonomy colors.
    static func color(for tag: String) -> Color {
        let palette: [UInt32] = [
            0x7A9CF0, 0x7FC8A9, 0xC08BD6, 0xF0A85C, 0xB591E3, 0xE9C46A, 0xEF7A6D,
        ]
        let hash = tag.unicodeScalars.reduce(5381) { ($0 << 5) &+ $0 &+ Int($1.value) }
        return Color(hex: palette[abs(hash) % palette.count])
    }

    var body: some View {
        Text(tag)
            .font(.system(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(Self.color(for: tag))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Self.color(for: tag).opacity(0.14), in: .rect(cornerRadius: 6))
    }
}

#Preview {
    HStack {
        ForEach(["mobile", "swiftui", "email", "backend"], id: \.self) {
            TagChip(tag: $0)
        }
    }
    .padding()
}
