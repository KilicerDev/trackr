//
//  TaskCard.swift
//  trackr-mobile-ios
//
//  Each task sits on its own elevated card so items separate visually on
//  the grouped background — the row-in-a-table look didn't survive the
//  translation from desktop.
//

import SwiftUI

struct TaskCard: View {
    let task: TaskItem

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                StatusDot(status: task.status, size: 15)
                Text(task.title)
                    .font(.system(size: 15, weight: .medium))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                if !task.assignees.isEmpty {
                    AvatarStack(users: task.assignees, size: 24)
                }
            }

            HStack(spacing: 10) {
                Text(task.id)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.tertiary)

                if task.priority == .high || task.priority == .urgent {
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
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
        )
    }

    @ViewBuilder
    private var dueLabel: some View {
        if let countdown = task.dueCountdown {
            Text(countdown.label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(countdown.tone.color ?? .secondary)
        } else if let due = task.due {
            Text(due.formatted(.dateTime.day().month(.abbreviated)))
                .font(.system(size: 12))
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
    .background(Color(.systemGroupedBackground))
}
