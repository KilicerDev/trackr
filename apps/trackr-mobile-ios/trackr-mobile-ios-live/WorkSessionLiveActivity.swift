//
//  WorkSessionLiveActivity.swift
//  trackr-mobile-ios-live
//
//  Lock-screen banner + Dynamic Island for a running work session: the
//  project tile from the in-app player, what's being worked on, and a
//  live-counting timer. Tapping anywhere opens the session player.
//

import ActivityKit
import SwiftUI
import WidgetKit

struct WorkSessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkSessionAttributes.self) { context in
            LockScreenView(context: context)
                .widgetURL(WorkSessionAttributes.openURL)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ProjectTile(attributes: context.attributes, size: 44)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.headline)
                            .font(.system(size: 15, weight: .semibold))
                            .lineLimit(1)
                        Text(context.subheadline)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .layoutPriority(-1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    // Claims its full width so the center text can't squeeze
                    // the digits onto two lines.
                    Timer(startedAt: context.state.startedAt, size: 20)
                        .fixedSize()
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if context.state.noteCount > 0 {
                        Label(context.notesLabel, systemImage: "text.bubble")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                ProjectTile(attributes: context.attributes, size: 22)
            } compactTrailing: {
                Timer(startedAt: context.state.startedAt, size: 14)
                    .foregroundStyle(context.attributes.projectColor)
                    .frame(maxWidth: 60)
            } minimal: {
                ProjectTile(attributes: context.attributes, size: 22)
            }
            .widgetURL(WorkSessionAttributes.openURL)
            .keylineTint(context.attributes.projectColor)
        }
    }
}

// MARK: - Lock screen

private struct LockScreenView: View {
    let context: ActivityViewContext<WorkSessionAttributes>

    var body: some View {
        HStack(spacing: 14) {
            ProjectTile(attributes: context.attributes, size: 52)
            VStack(alignment: .leading, spacing: 3) {
                Text(context.headline)
                    .font(.system(size: 16, weight: .semibold))
                    .lineLimit(1)
                Text(context.subheadline)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                if context.state.noteCount > 0 {
                    Label(context.notesLabel, systemImage: "text.bubble")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                        .padding(.top, 2)
                }
            }
            Spacer(minLength: 8)
            Timer(startedAt: context.state.startedAt, size: 28)
        }
        .padding(16)
        .activityBackgroundTint(Color(.systemBackground).opacity(0.85))
        .activitySystemActionForegroundColor(context.attributes.projectColor)
    }
}

// MARK: - Pieces

/// The gradient project tile from SessionPlayerView / SessionBar.
private struct ProjectTile: View {
    let attributes: WorkSessionAttributes
    let size: CGFloat

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.24)
            .fill(
                LinearGradient(
                    colors: [attributes.projectColor.opacity(0.9), attributes.projectColor.opacity(0.5)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: size, height: size)
            .overlay(
                Text(attributes.projectInitial)
                    .font(.system(size: size * 0.45, weight: .bold))
                    .foregroundStyle(.white)
            )
    }
}

/// Counts up on its own — no activity updates needed for the clock.
private struct Timer: View {
    let startedAt: Date
    let size: CGFloat

    var body: some View {
        Text(timerInterval: startedAt...Date.distantFuture, countsDown: false)
            .font(.system(size: size, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .lineLimit(1)
            .multilineTextAlignment(.trailing)
    }
}

// MARK: - Copy

private extension ActivityViewContext<WorkSessionAttributes> {
    var headline: String {
        let title = state.title.trimmingCharacters(in: .whitespaces)
        return title.isEmpty ? "Working on \(attributes.projectName)" : title
    }

    var subheadline: String {
        if let key = attributes.taskKey { return "\(key) · \(attributes.projectName)" }
        return attributes.projectName
    }

    var notesLabel: String {
        state.noteCount == 1 ? "1 note" : "\(state.noteCount) notes"
    }
}

private extension WorkSessionAttributes {
    var projectColor: Color { Color(hex: projectColorHex) }
}

// MARK: - Previews

#Preview("Lock screen", as: .content, using: WorkSessionAttributes.preview) {
    WorkSessionLiveActivity()
} contentStates: {
    WorkSessionAttributes.ContentState(startedAt: .now.addingTimeInterval(-754), title: "Work session", noteCount: 2)
    WorkSessionAttributes.ContentState(startedAt: .now.addingTimeInterval(-61), title: "", noteCount: 0)
}

#Preview("Island", as: .dynamicIsland(.expanded), using: WorkSessionAttributes.preview) {
    WorkSessionLiveActivity()
} contentStates: {
    WorkSessionAttributes.ContentState(startedAt: .now.addingTimeInterval(-754), title: "Work session", noteCount: 2)
}

private extension WorkSessionAttributes {
    static let preview = WorkSessionAttributes(
        projectName: "Trackr Software", projectColorHex: 0xEF7A6D, taskKey: "TRK-112"
    )
}
