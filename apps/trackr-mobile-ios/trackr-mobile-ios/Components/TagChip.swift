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
            .font(.tkMono(11))
            .foregroundStyle(Self.color(for: tag))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Self.color(for: tag).opacity(0.15), in: .rect(cornerRadius: 5))
    }
}

/// Third line of list rows / board cards: up to four tag chips + "+N".
struct TagRow: View {
    let tags: [String]
    var limit = 4

    var body: some View {
        if !tags.isEmpty {
            HStack(spacing: 6) {
                ForEach(tags.prefix(limit), id: \.self) { TagChip(tag: $0) }
                if tags.count > limit {
                    Text("+\(tags.count - limit)")
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                }
            }
            .lineLimit(1)
        }
    }
}

/// Accent "planned for" chip (bookmark + mono short date) for rows/cards.
struct PlannedChip: View {
    let date: Date

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "bookmark")
                .font(.system(size: 9, weight: .semibold))
            Text(date.formatted(.dateTime.day().month(.abbreviated)))
                .font(.tkMono(11))
        }
        .foregroundStyle(TK.accent)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(TK.accentSoft, in: .rect(cornerRadius: 5))
        .fixedSize()
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
