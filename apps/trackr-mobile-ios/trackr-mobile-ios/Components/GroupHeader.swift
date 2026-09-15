//
//  GroupHeader.swift
//  trackr-mobile-ios
//
//  Web parity (tasks/ListView.svelte group bar) in the prototype's flat
//  list metric: the band is `TKGroupBand` (full-bleed, raised background,
//  hairline above). Kept as a thin wrapper so existing call sites keep
//  compiling; new code can use TKGroupBand directly.
//

import SwiftUI

struct GroupHeader: View {
    let label: String
    var color: Color? = nil
    let count: Int
    var collapsed = false
    var onToggle: (() -> Void)? = nil

    var body: some View {
        TKGroupBand(
            title: label,
            color: color,
            count: count,
            collapsible: onToggle != nil,
            collapsed: collapsed,
            onToggle: onToggle
        )
    }
}

/// Group-section container. The prototype lists are flat (bands + hairline
/// rows on the page); this stays for the few card-style sections that
/// still want an outline.
extension View {
    func sectionStyle() -> some View {
        self
            .background(TK.card, in: .rect(cornerRadius: TK.rCard))
            .clipShape(.rect(cornerRadius: TK.rCard))
            .overlay(
                RoundedRectangle(cornerRadius: TK.rCard)
                    .strokeBorder(TK.border, lineWidth: 1)
            )
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 0) {
        GroupHeader(label: "In Progress", color: .yellow, count: 4) {}
        Text("rows go here")
            .foregroundStyle(TK.text)
            .frame(maxWidth: .infinity)
            .padding(20)
        GroupHeader(label: "Backlog", color: .gray, count: 2, collapsed: true) {}
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
