//
//  TaskCard.swift
//  trackr-mobile-ios
//
//  The prototype's task ROW (tasks list, my week, search): a 36pt status
//  glyph, the title (two lines), and one meta line — type badge or
//  project dot, mono key, priority bars, checklist progress, due state.
//  Rows are flat on the page and separated by hairlines; the list owns
//  the separators.
//
//  The status glyph (`StatusDot`, same icon + color as the detail chips)
//  opens the status picker and writes straight to the shared model (same
//  push path as the context menu) without opening the detail. Tapping the
//  rest of the row calls `onOpen`; without it the row is a plain view
//  (wrap it in a NavigationLink).
//

import SwiftUI

/// Kept for call sites that still say TaskCard.
typealias TaskCard = TaskRow

struct TaskRow: View {
    enum Leading {
        /// Tasks list: 18pt type badge.
        case type
        /// Week / search: 6pt project dot.
        case projectDot
    }

    let task: TaskItem
    /// nil in previews / detached lists — the check then only reads.
    var model: AppModel? = nil
    var leading: Leading = .type
    /// Project name (11pt, text3) after the key — off when the list is
    /// already grouped by project.
    var showProject = false
    /// Week rows: play button that starts a task-bound session.
    var showPlay = false
    /// Mono trailing label after the due state (week: the row's hours).
    var timeLabel: String? = nil
    /// Accent "planned for" chip in the meta line (off on the week, where
    /// the day band already says it).
    var showPlanned = true
    /// Tap on the title/meta area. nil → the row is not a button.
    var onOpen: (() -> Void)? = nil

    @State private var pickingStatus = false

    /// The live model copy wins over the passed value so a quick edit
    /// (context menu, check) shows without the parent re-rendering.
    private var live: TaskItem {
        model?.tasks.first { $0.id == task.id } ?? task
    }

    private var done: Bool { live.status == .done }

    private var projectColor: Color {
        model?.projects.first { $0.name == live.project }?.color ?? TK.text3
    }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Button {
                pickingStatus = true
            } label: {
                StatusDot(status: live.status, size: 18)
                    .frame(width: 36, height: 36)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(model == nil)
            .accessibilityLabel("Status: \(live.status.label)")
            .accessibilityHint("Change status")

            if let onOpen {
                Button(action: onOpen) {
                    content
                }
                .buttonStyle(.plain)
            } else {
                content
            }

            if showPlay {
                playButton
            }
        }
        .padding(.vertical, 12)
        .padding(.leading, 8)
        .padding(.trailing, showPlay ? 8 : TK.gutter)
        .opacity(done ? 0.5 : 1)
        .animation(.snappy(duration: 0.2), value: done)
        .sheet(isPresented: $pickingStatus) {
            TKPickerSheet(
                title: "Status",
                options: TaskStatus.allCases.map { status in
                    TKPickerOption(status, label: status.label) { StatusDot(status: status, size: 18) }
                },
                selected: live.status
            ) { setStatus($0) }
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(live.title)
                .font(.tkRow)
                .foregroundStyle(done ? TK.text2 : TK.text)
                .strikethrough(done, color: TK.text3)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            meta
            TagRow(tags: live.tags)
        }
        .padding(.top, 7)
        .padding(.trailing, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(.rect)
    }

    private var meta: some View {
        HStack(spacing: 6) {
            switch leading {
            case .type:
                TypeBadge(type: live.type, showLabel: false, size: 18)
            case .projectDot:
                Circle()
                    .fill(projectColor)
                    .frame(width: 6, height: 6)
            }
            Text(live.id)
                .font(.tkMono(11))
                .foregroundStyle(TK.text3)
                .fixedSize()
            if live.priority != .none {
                PriorityBars(priority: live.priority)
            }
            if showProject {
                Text(live.project)
                    .font(.tkMetaSm)
                    .foregroundStyle(TK.text3)
                    .lineLimit(1)
            }
            if showPlanned, let planned = live.plannedFor {
                PlannedChip(date: planned)
            }
            if live.checklistTotal > 0 {
                HStack(spacing: 3) {
                    Image(systemName: "checklist")
                        .font(.system(size: 9, weight: .semibold))
                    Text("\(live.checklistDone)/\(live.checklistTotal)")
                        .font(.tkMono(11))
                }
                .foregroundStyle(
                    live.checklistDone == live.checklistTotal ? TK.success : TK.text3
                )
                .fixedSize()
            }
            Spacer(minLength: 8)
            dueLabel
                .fixedSize()
            if let timeLabel {
                Text(timeLabel)
                    .font(.tkMono(11))
                    .foregroundStyle(TK.text3)
                    .fixedSize()
            }
        }
        .frame(height: 18)
    }

    /// Web dueCountdown parity: relative label in the urgency tone within
    /// a week, the short absolute date (text3, mono) otherwise.
    @ViewBuilder
    private var dueLabel: some View {
        if let countdown = live.dueCountdown {
            Text(countdown.label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(countdown.tone.color ?? TK.text3)
        } else if let due = live.due {
            Text(due.formatted(.dateTime.day().month(.abbreviated)))
                .font(.tkMono(11))
                .foregroundStyle(TK.text3)
        }
    }

    private var playButton: some View {
        let running = model?.session.isRunning ?? false
        let thisTask = model?.session.taskId == live.id
        return TKPlayButton(active: !running || thisTask) {
            guard let model else { return }
            if thisTask {
                model.showingPlayer = true
            } else if !running {
                model.startSession(for: live)
            }
        }
    }

    /// Status on the shared model + push (context-menu path).
    private func setStatus(_ status: TaskStatus) {
        guard let model, let index = model.tasks.firstIndex(where: { $0.id == task.id }) else { return }
        guard model.tasks[index].status != status else { return }
        model.tasks[index].status = status
        model.sync?.pushTask(model.tasks[index])
    }
}

/// Board card (tasks board, week board): status + type + key, title,
/// project · due · avatar; optional play button for the week.
struct TaskBoardCard: View {
    let task: TaskItem
    var model: AppModel? = nil
    var showPlay = false
    var showProject = true
    var showPlanned = true
    var timeLabel: String? = nil

    private var live: TaskItem { model?.tasks.first { $0.id == task.id } ?? task }
    private var done: Bool { live.status == .done }
    private var projectColor: Color {
        model?.projects.first { $0.name == live.project }?.color ?? TK.text3
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                StatusDot(status: live.status, size: 16)
                TypeBadge(type: live.type, showLabel: false, size: 18)
                Text(live.id)
                    .font(.tkMono(11))
                    .foregroundStyle(TK.text3)
                Spacer(minLength: 4)
                if live.priority != .none {
                    PriorityBars(priority: live.priority)
                }
                if showPlay, let model {
                    let running = model.session.isRunning
                    let thisTask = model.session.taskId == live.id
                    TKPlayButton(active: !running || thisTask) {
                        if thisTask { model.showingPlayer = true } else if !running { model.startSession(for: live) }
                    }
                    .frame(width: 24, height: 24)
                }
            }
            Text(live.title)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(done ? TK.text2 : TK.text)
                .strikethrough(done, color: TK.text3)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 6) {
                if showProject {
                    Circle().fill(projectColor).frame(width: 6, height: 6)
                    Text(live.project)
                        .font(.tkMetaSm)
                        .foregroundStyle(TK.text3)
                        .lineLimit(1)
                }
                if showPlanned, let planned = live.plannedFor {
                    PlannedChip(date: planned)
                }
                if live.checklistTotal > 0 {
                    Text("☑ \(live.checklistDone)/\(live.checklistTotal)")
                        .font(.tkMono(11))
                        .foregroundStyle(live.checklistDone == live.checklistTotal ? TK.success : TK.text3)
                        .fixedSize()
                }
                Spacer(minLength: 4)
                if let countdown = live.dueCountdown {
                    Text(countdown.label)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(countdown.tone.color ?? TK.text3)
                } else if let due = live.due {
                    Text(due.formatted(.dateTime.day().month(.abbreviated)))
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                }
                if let timeLabel {
                    Text(timeLabel)
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                }
                if let first = live.assignees.first {
                    AvatarView(user: first, size: 22)
                }
            }
            .lineLimit(1)
            TagRow(tags: live.tags)
        }
        .tkCard(radius: TK.rCardSm, padding: 12)
        .opacity(done ? 0.55 : 1)
        .contentShape(.rect)
    }
}

#Preview("List") {
    let model = AppModel()
    return ScrollView {
        VStack(spacing: 0) {
            ForEach(model.tasks) { task in
                TKHairline()
                TaskRow(task: task, model: model, showProject: true) {}
            }
        }
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}

#Preview("Week") {
    let model = AppModel()
    return ScrollView {
        VStack(spacing: 0) {
            ForEach(model.tasks.prefix(4)) { task in
                TKHairline()
                TaskRow(task: task, model: model, leading: .projectDot, showProject: true,
                        showPlay: true, timeLabel: "1h 30m") {}
            }
        }
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
