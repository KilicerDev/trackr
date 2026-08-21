//
//  TaskCard.swift
//  trackr-mobile-ios
//
//  Each task sits on its own elevated card so items separate visually on
//  the grouped background — the row-in-a-table look didn't survive the
//  translation from desktop. The content mirrors the web TaskRow: type
//  badge + title, then key / priority / checklist / planned chip / tags
//  with the due state trailing.
//

import SwiftUI

struct TaskCard: View {
    let task: TaskItem
    /// My-week day sections already carry the planned date in their header,
    /// so the chip is redundant there (web TaskRow parity).
    var showPlanned = true
    /// Row inside a group-section container: the section owns background
    /// and border, the card renders content only.
    var embedded = false

    var body: some View {
        if embedded {
            content
        } else {
            content
                .background(
                    Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
                )
        }
    }

    private var hasChipsLine: Bool {
        (showPlanned && task.plannedFor != nil) || !task.tags.isEmpty
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Line 1: identity — title truncates, it never wraps.
            HStack(spacing: 8) {
                StatusDot(status: task.status, size: 15)
                TypeBadge(type: task.type, showLabel: false)
                Text(task.title)
                    .font(.system(size: 15, weight: .medium))
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 8)
                if !task.assignees.isEmpty {
                    AvatarStack(users: task.assignees, size: 24)
                }
            }

            // Line 2: meta — key, priority, checklist, due.
            HStack(spacing: 8) {
                Text(task.id)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.tertiary)

                if task.priority != .none {
                    PriorityBars(priority: task.priority)
                }

                if task.checklistTotal > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "checklist")
                            .font(.system(size: 10))
                        Text("\(task.checklistDone)/\(task.checklistTotal)")
                            .font(.system(size: 12, design: .monospaced))
                    }
                    .foregroundStyle(
                        task.checklistDone == task.checklistTotal
                            ? Color(hex: 0x7FC8A9)
                            : Color(.tertiaryLabel)
                    )
                }

                Spacer()

                dueLabel
            }
            .lineLimit(1)

            // Line 3 (only when there is something to show): planned + tags.
            if hasChipsLine {
                HStack(spacing: 6) {
                    if showPlanned, let planned = task.plannedFor {
                        plannedChip(planned)
                    }
                    ForEach(task.tags.prefix(3), id: \.self) { tag in
                        TagChip(tag: tag)
                    }
                    if task.tags.count > 3 {
                        Text("+\(task.tags.count - 3)")
                            .font(.system(size: 12))
                            .foregroundStyle(.tertiary)
                    }
                }
                .lineLimit(1)
            }
        }
        .padding(14)
    }

    /// Web TaskRow parity: accent-tinted planned-date chip after the title
    /// cluster (calendar + mono short date on accent-soft).
    private func plannedChip(_ date: Date) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "calendar")
                .font(.system(size: 10))
            Text(date.formatted(.dateTime.day().month(.abbreviated)))
                .font(.system(size: 12, design: .monospaced))
        }
        .foregroundStyle(Color.accentColor)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(Color.accentColor.opacity(0.14), in: .rect(cornerRadius: 6))
    }

    @ViewBuilder
    private var dueLabel: some View {
        if let countdown = task.dueCountdown {
            Text(countdown.label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(countdown.tone.color ?? .secondary)
        } else if let due = task.due {
            Text(due.formatted(.dateTime.day().month(.abbreviated)))
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(.tertiary)
        }
    }
}

#Preview {
    ScrollView {
        LazyVStack(spacing: 10) {
            ForEach(TaskItem.samples) { TaskCard(task: $0) }
        }
        .padding(16)
    }
    .background(Color.webBackground)
}
