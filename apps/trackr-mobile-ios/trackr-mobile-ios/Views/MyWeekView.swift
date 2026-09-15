//
//  MyWeekView.swift
//  trackr-mobile-ios
//
//  Native port of the web /week planner in the prototype's chrome: header
//  with the date range, Today / prev-next / KW / NOW toolbar row with the
//  week capacity, Monday–Sunday day bands with hairline task rows (play
//  button starts a task-bound session) and an "+ Add task" row per day,
//  then the unscheduled backlog (past / mine / others) at the bottom.
//

import SwiftUI

struct MyWeekView: View {
    @Bindable var model: AppModel

    @State private var weekStart = MyWeekView.monday(of: .now)
    @State private var unscheduledTab: UnscheduledTab = .past

    // Web parity (week/+page.svelte): 8h day capacity, 5×8h week capacity,
    // tasks without any time information count as 1h.
    private static let defaultEstimate = 60
    private static let dayCapacity = 8 * 60
    private static let weekCapacity = 5 * 8 * 60

    enum UnscheduledTab: CaseIterable, Identifiable {
        case past, mine, others
        var id: Self { self }
        var label: String {
            switch self {
            case .past: "Past"
            case .mine: "My tasks"
            case .others: "Others"
            }
        }
    }

    // MARK: - Week math

    private static func monday(of date: Date) -> Date {
        let start = date.startOfDay
        let weekday = Calendar.current.component(.weekday, from: start)  // 1 = Sunday
        let offset = (weekday + 5) % 7
        return Calendar.current.date(byAdding: .day, value: -offset, to: start)!
    }

    private var weekDates: [Date] {
        (0..<7).map { Calendar.current.date(byAdding: .day, value: $0, to: weekStart)! }
    }

    private var isCurrentWeek: Bool {
        weekStart == MyWeekView.monday(of: .now)
    }

    private var weekLabel: String {
        let week = Calendar(identifier: .iso8601).component(.weekOfYear, from: weekStart)
        return "KW" + String(format: "%02d", week)
    }

    private var weekRangeLabel: String {
        let fmt = Date.FormatStyle().month(.abbreviated).day()
        return "\(weekStart.formatted(fmt)) – \(weekDates[6].formatted(fmt))"
    }

    // MARK: - Task buckets

    /// Web parity (utils/task.ts taskTimeMinutes): logged time wins over the
    /// estimate; no time info at all falls back to the default hour.
    private func timeMinutes(_ task: TaskItem) -> Int {
        if task.loggedMinutes > 0 { return task.loggedMinutes }
        return task.estimate ?? MyWeekView.defaultEstimate
    }

    private func planned(on day: Date) -> [TaskItem] {
        model.tasks.filter {
            guard let plannedFor = $0.plannedFor else { return false }
            return Calendar.current.isDate(plannedFor, inSameDayAs: day)
        }
    }

    private func minutes(in tasks: [TaskItem]) -> Int {
        tasks.reduce(0) { $0 + timeMinutes($1) }
    }

    /// Mon–Fri only, like the web's 40h capacity line.
    private var weekMinutes: Int {
        weekDates.prefix(5).reduce(0) { $0 + minutes(in: planned(on: $1)) }
    }

    /// Per-project sub-sections within a day, alphabetical — the rows are
    /// listed in this order (each row carries its project dot + name) so a
    /// mixed day still reads project by project.
    private func projectGroups(in tasks: [TaskItem]) -> [(name: String, color: Color, tasks: [TaskItem])] {
        let names = Array(Set(tasks.map(\.project)))
        return names
            .map { name in
                let color = model.projects.first { $0.name == name }?.color ?? Color(hex: 0x7C7C84)
                return (name, color, tasks.filter { $0.project == name })
            }
            .sorted { $0.0 < $1.0 }
    }

    private var unscheduled: [TaskItem] {
        // Open = still actionable; done/in-review never surfaces here.
        let isOpen = { (t: TaskItem) in t.status != .done && t.status != .inReview }
        let me = model.me
        // Match by server id when both sides have one (UserRef color/initials
        // can differ between /me and the tasks directory), fall back to
        // whole-value equality for sample data.
        let mine = { (t: TaskItem) in
            t.assignees.contains { assignee in
                if let mineId = me.serverId, let theirId = assignee.serverId {
                    return mineId == theirId
                }
                return assignee == me
            }
        }

        switch unscheduledTab {
        case .past:
            // Open tasks planned for a day in a week before this one — so
            // overdue work isn't forgotten. Oldest first.
            return model.tasks
                .filter { isOpen($0) && ($0.plannedFor.map { $0 < weekStart } ?? false) }
                .sorted { ($0.plannedFor ?? .distantPast) < ($1.plannedFor ?? .distantPast) }
        case .mine:
            return model.tasks.filter { isOpen($0) && $0.plannedFor == nil && mine($0) }
        case .others:
            return model.tasks.filter { isOpen($0) && $0.plannedFor == nil && !mine($0) }
        }
    }

    // MARK: - Body

    var body: some View {
        NavigationStack(path: $model.weekPath) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    TKPageHeader("My week", meta: weekRangeLabel)
                    weekToolbar
                        .padding(.horizontal, TK.gutter)
                        .padding(.top, 10)
                        .padding(.bottom, 12)

                    ForEach(Array(weekDates.enumerated()), id: \.element) { index, day in
                        daySection(index: index, day: day)
                    }

                    unscheduledSection
                        .padding(.top, 20)
                }
                .padding(.bottom, 24)
            }
            .navigationTitle("My week")
            .tkRootScreen(model)
            .refreshable { await model.sync?.refreshTasks() }
            .onAppear {
                // Screen-appear revalidation, same as the Tasks tab.
                Task { await model.sync?.refreshTasks() }
            }
            .navigationDestination(for: TaskItem.self) { task in
                TaskDetailView(task: task, model: model)
                    .tkDetailScreen()
            }
        }
    }

    // MARK: - Toolbar

    private var weekToolbar: some View {
        HStack(spacing: 8) {
            TKToolbarButton(action: { withAnimation(.snappy(duration: 0.2)) { weekStart = MyWeekView.monday(of: .now) } }) {
                Text("Today")
            }
            .opacity(isCurrentWeek ? 0.55 : 1)
            .disabled(isCurrentWeek)

            prevNext

            Text(weekLabel)
                .font(.tkMono(14, weight: .semibold))
                .foregroundStyle(TK.text)
            if isCurrentWeek {
                TKPill(text: "Now")
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 5) {
                Text("\(weekMinutes / 60)h / \(MyWeekView.weekCapacity / 60)h")
                    .font(.tkMono(12))
                    .foregroundStyle(TK.text2)
                TKBar(
                    fraction: Double(weekMinutes) / Double(MyWeekView.weekCapacity),
                    color: weekMinutes > MyWeekView.weekCapacity ? TK.danger : TK.accent,
                    height: 3,
                    width: 64
                )
            }
        }
    }

    /// One 36pt pill, two halves split by a hairline.
    private var prevNext: some View {
        HStack(spacing: 0) {
            Button {
                withAnimation(.snappy(duration: 0.2)) {
                    weekStart = Calendar.current.date(byAdding: .day, value: -7, to: weekStart)!
                }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(TK.text)
                    .frame(width: 36, height: 36)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Previous week")
            Rectangle().fill(TK.border).frame(width: 1, height: 36)
            Button {
                withAnimation(.snappy(duration: 0.2)) {
                    weekStart = Calendar.current.date(byAdding: .day, value: 7, to: weekStart)!
                }
            } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(TK.text)
                    .frame(width: 36, height: 36)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Next week")
        }
        .background(TK.card, in: .rect(cornerRadius: TK.rChip))
        .overlay(RoundedRectangle(cornerRadius: TK.rChip).strokeBorder(TK.border, lineWidth: 1))
    }

    // MARK: - Days

    /// Day band, its task rows (project by project) and the add row. An
    /// empty day is just its band + add row, so the week grid stays visible.
    @ViewBuilder
    private func daySection(index: Int, day: Date) -> some View {
        let tasks = planned(on: day)
        let mins = minutes(in: tasks)
        let isToday = Calendar.current.isDateInToday(day)

        TKDayBand(
            name: day.formatted(.dateTime.weekday(.wide)),
            date: day.formatted(.dateTime.day().month(.abbreviated)),
            isToday: isToday,
            muted: index >= 5,
            count: tasks.count,
            trailing: mins > 0 ? mins.minutesFormatted : "0m"
        )
        ForEach(projectGroups(in: tasks), id: \.name) { group in
            ForEach(group.tasks) { task in
                TKHairline()
                TaskRow(
                    task: task,
                    model: model,
                    leading: .projectDot,
                    showProject: true,
                    showPlay: true,
                    timeLabel: timeMinutes(task).minutesFormatted
                ) {
                    model.weekPath.append(task)
                }
                .taskContextMenu(for: task, model: model)
            }
        }
        TKHairline()
        addRow(plannedFor: day)
    }

    /// "+ Add task" — opens the create sheet as a task planned for the day
    /// (the tab bar's "+" path), scope left to the sheet.
    private func addRow(plannedFor day: Date?) -> some View {
        Button {
            model.presentCreate(kind: .task, plannedFor: day)
        } label: {
            HStack(spacing: 0) {
                Image(systemName: "plus")
                    .font(.system(size: 16, weight: .regular))
                    .frame(width: 36, height: 36)
                Text("Add task")
                    .font(.system(size: 14))
                Spacer(minLength: 0)
            }
            .foregroundStyle(TK.text4)
            .padding(.leading, 8)
            .padding(.trailing, TK.gutter)
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(TKPressStyle())
    }

    // MARK: - Unscheduled

    private var unscheduledSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            TKGroupBand(title: "Unscheduled", count: unscheduled.count)
            TKSegmented(UnscheduledTab.allCases, selection: $unscheduledTab) { $0.label }
                .padding(.horizontal, TK.gutter)
                .padding(.vertical, 12)

            if unscheduled.isEmpty {
                TKHairline()
                TKEmptyState(text: "Nothing here — inbox zero.", padding: 28)
            } else {
                ForEach(unscheduled) { task in
                    TKHairline()
                    TaskRow(
                        task: task,
                        model: model,
                        leading: .projectDot,
                        showProject: true,
                        timeLabel: unscheduledTab == .past
                            ? task.plannedFor?.formatted(.dateTime.day().month(.abbreviated))
                            : nil
                    ) {
                        model.weekPath.append(task)
                    }
                    .taskContextMenu(for: task, model: model)
                }
                TKHairline()
            }
        }
    }
}

#Preview {
    MyWeekView(model: AppModel())
        .preferredColorScheme(.dark)
}
