//
//  MyWeekView.swift
//  trackr-mobile-ios
//
//  Native port of the web /week planner: Monday–Sunday day sections with
//  per-day capacity bars, project sub-groups within a day, and the
//  unscheduled backlog (past / mine / others) at the bottom.
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
            case .mine: "My Tasks"
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
        return "\(weekStart.formatted(fmt)) — \(weekDates[6].formatted(fmt))"
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

    /// Per-project sub-sections within a day, alphabetical — so a mixed day
    /// reads as "which project gets how much of it" at a glance.
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
        let me = TaskItem.sampleUsers[0]  // current user later
        let mine = { (t: TaskItem) in t.assignees.contains(me) }

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
        NavigationStack {
            ScrollView {
                // Pinned day headers on a solid background — web parity with
                // the sticky border-y day bars; that's what keeps the days
                // apart while cards scroll underneath.
                LazyVStack(alignment: .leading, spacing: 10, pinnedViews: [.sectionHeaders]) {
                    weekHeader
                        .padding(.bottom, 4)

                    ForEach(Array(weekDates.enumerated()), id: \.element) { index, day in
                        daySection(index: index, day: day)
                    }

                    unscheduledSection
                        .padding(.top, 14)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))
            .navigationDestination(for: TaskItem.self) { task in
                TaskDetailView(task: task)
            }
            .navigationTitle("My Week")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        weekStart = Calendar.current.date(byAdding: .day, value: -7, to: weekStart)!
                    } label: {
                        Image(systemName: "chevron.left")
                    }
                    Button {
                        weekStart = Calendar.current.date(byAdding: .day, value: 7, to: weekStart)!
                    } label: {
                        Image(systemName: "chevron.right")
                    }
                }
                ToolbarSpacer(.fixed, placement: .topBarTrailing)
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        weekStart = MyWeekView.monday(of: .now)
                    } label: {
                        Image(systemName: "calendar.badge.clock")
                    }
                    .disabled(isCurrentWeek)
                }
            }
        }
    }

    private var weekHeader: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 7) {
                    Text(weekLabel)
                        .font(.system(size: 17, weight: .bold, design: .monospaced))
                    if isCurrentWeek {
                        Text("NOW")
                            .font(.system(size: 10, weight: .semibold))
                            .tracking(0.6)
                            .foregroundStyle(Color.accentColor)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2.5)
                            .background(Color.accentColor.opacity(0.12), in: .capsule)
                    }
                }
                Text(weekRangeLabel)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 5) {
                Text("\(weekMinutes / 60)h / \(MyWeekView.weekCapacity / 60)h")
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                CapacityBar(
                    fraction: Double(weekMinutes) / Double(MyWeekView.weekCapacity),
                    color: .accentColor
                )
                .frame(width: 96)
            }
        }
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private func daySection(index: Int, day: Date) -> some View {
        let tasks = planned(on: day)

        Section {
            ForEach(projectGroups(in: tasks), id: \.name) { group in
                HStack(spacing: 7) {
                    Circle()
                        .fill(group.color)
                        .frame(width: 8, height: 8)
                    Text(group.name)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(minutes(in: group.tasks).minutesFormatted)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 4)
                ForEach(group.tasks) { task in
                    NavigationLink(value: task) {
                        TaskCard(task: task)
                    }
                    .buttonStyle(.plain)
                }
            }
        } header: {
            dayHeader(index: index, day: day, tasks: tasks)
        }
    }

    private func dayHeader(index: Int, day: Date, tasks: [TaskItem]) -> some View {
        let mins = minutes(in: tasks)
        let isToday = Calendar.current.isDateInToday(day)
        let isWeekend = index >= 5
        let over = mins > MyWeekView.dayCapacity

        return HStack(spacing: 7) {
            Text(day.formatted(.dateTime.weekday(.wide)))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(isToday ? Color.accentColor : isWeekend ? Color(.secondaryLabel) : Color(.label))
            Text("\(Calendar.current.component(.day, from: day))")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(.tertiary)
            if !tasks.isEmpty {
                Text("\(tasks.count)")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.tertiary)
            }
            Spacer()
            CapacityBar(
                fraction: Double(mins) / Double(MyWeekView.dayCapacity),
                color: over ? Color(hex: 0xEF4F5E) : isToday ? .accentColor : Color(.systemGray2)
            )
            .frame(width: 64)
            Text(mins > 0 ? mins.minutesFormatted : "0m")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 52, alignment: .trailing)
        }
        .padding(.horizontal, 4)
        .padding(.top, 16)
        .padding(.bottom, 8)
        // Solid bar so cards visibly slide under the pinned header, with a
        // hairline marking where the day starts.
        .background(Color(.systemGroupedBackground))
        .overlay(alignment: .top) {
            Divider()
        }
    }

    private var unscheduledSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                Text("Unscheduled")
                    .font(.system(size: 13, weight: .semibold))
                Text("\(unscheduled.count)")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 4)

            Picker("Unscheduled", selection: $unscheduledTab) {
                ForEach(UnscheduledTab.allCases) { tab in
                    Text(tab.label).tag(tab)
                }
            }
            .pickerStyle(.segmented)

            ForEach(unscheduled) { task in
                NavigationLink(value: task) {
                    TaskCard(task: task)
                }
                .buttonStyle(.plain)
            }
            if unscheduled.isEmpty {
                HStack(spacing: 7) {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 13))
                    Text("Nothing here — inbox zero.")
                        .font(.system(size: 13))
                }
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)
                .padding(.vertical, 6)
            }
        }
    }
}

/// Thin capacity meter, web parity with the day/week progress bars.
private struct CapacityBar: View {
    let fraction: Double
    let color: Color

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color(.systemGray5))
                Capsule()
                    .fill(color)
                    .frame(width: geo.size.width * min(1, max(0, fraction)))
            }
        }
        .frame(height: 4)
    }
}

#Preview {
    MyWeekView(model: AppModel())
}
