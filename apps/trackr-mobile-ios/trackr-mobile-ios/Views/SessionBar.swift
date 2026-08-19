//
//  SessionBar.swift
//  trackr-mobile-ios
//
//  Mini player above the tab bar (tabViewBottomAccessory) while a work
//  session is running. Tapping expands the full session player.
//

import SwiftUI

struct SessionBar: View {
    @Bindable var model: AppModel

    var body: some View {
        Button {
            model.showingPlayer = true
        } label: {
            HStack(spacing: 10) {
                if let project = model.session.project {
                    RoundedRectangle(cornerRadius: 7)
                        .fill(
                            LinearGradient(
                                colors: [project.color.opacity(0.9), project.color.opacity(0.5)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 30, height: 30)
                        .overlay(
                            Text(project.initial)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white)
                        )
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(barTitle)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Color.primary)
                        .lineLimit(1)
                    if let startedAt = model.session.startedAt {
                        Text(startedAt, style: .timer)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(Color(.secondaryLabel))
                    }
                }
                Spacer()
                Image(systemName: "chevron.up")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color(.secondaryLabel))
            }
            .padding(.horizontal, 12)
        }
        .buttonStyle(.plain)
    }

    private var barTitle: String {
        let title = model.session.title.trimmingCharacters(in: .whitespaces)
        if !title.isEmpty { return title }
        if let project = model.session.project { return "Working on \(project.name)" }
        return "Work session"
    }
}
