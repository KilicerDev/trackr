//
//  GroupHeader.swift
//  trackr-mobile-ios
//
//  Web parity (tasks/ListView.svelte group bar): the tinted top band of a
//  group section container — collapse chevron, group dot, semibold label,
//  mono count. Square edges on purpose: the section card clips the
//  corners. Tapping the bar collapses the group.
//

import SwiftUI

struct GroupHeader: View {
    let label: String
    var color: Color? = nil
    let count: Int
    var collapsed = false
    var onToggle: (() -> Void)? = nil

    var body: some View {
        Button {
            onToggle?()
        } label: {
            HStack(spacing: 9) {
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color(.tertiaryLabel))
                    .rotationEffect(.degrees(collapsed ? -90 : 0))
                if let color {
                    Circle()
                        .fill(color)
                        .frame(width: 8, height: 8)
                }
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.primary)
                    .lineLimit(1)
                Text("\(count)")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(Color(.tertiaryLabel))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .frame(height: 38)
            .frame(maxWidth: .infinity)
            .background(Color.webSurface2)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

/// Group-section container, web ListView look: elevated body on the page
/// background, outlined with the strong border, header band one step
/// lighter still.
extension View {
    func sectionStyle() -> some View {
        self
            // Elevated body so rows read as a card in dark mode too — the
            // page (`--bg`) → body (`--bg-elev`) → header (`--surface-2`)
            // stack from the web's dark theme.
            .background(Color.webBackgroundElevated, in: .rect(cornerRadius: 16))
            .clipShape(.rect(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(Color.webBorderStrong, lineWidth: 1)
            )
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 18) {
        VStack(spacing: 0) {
            GroupHeader(label: "In Progress", color: .yellow, count: 4)
            Text("rows go here")
                .frame(maxWidth: .infinity)
                .padding(20)
        }
        .sectionStyle()
        GroupHeader(label: "Backlog", color: .gray, count: 2, collapsed: true)
            .sectionStyle()
    }
    .padding()
    .background(Color.webBackground)
}
