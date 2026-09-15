//
//  TasksView.swift
//  trackr-mobile-ios
//
//  Root surface of the Tasks tab: page header, view chip + filter button,
//  then a flat list — one collapsible group band per group with hairline
//  rows. Tasks and the navigation path live in AppModel so other features
//  (work sessions, deep links) can open a task detail.
//

import SwiftUI

struct TasksView: View {
    @Bindable var model: AppModel

    @State private var showingFilters = false
    @State private var collapsedGroups: Set<String> = []
    @AppStorage("trackr.tasksLayout") private var layoutRaw = TKLayout.list.rawValue

    private var layout: Binding<TKLayout> {
        Binding(get: { TKLayout(rawValue: layoutRaw) ?? .list }, set: { layoutRaw = $0.rawValue })
    }

    private var groups: [TaskGroup] { model.taskFilters.grouped(model.tasks) }



    /// Number of multi-select filters in use (the badge on Filter).
    private var activeFilterCount: Int {
        let f = model.taskFilters
        return [f.statuses.isEmpty, f.priorities.isEmpty, f.assignees.isEmpty, f.projects.isEmpty]
            .count { !$0 }
    }

    var body: some View {
        NavigationStack(path: $model.taskPath) {
            Group {
                if layout.wrappedValue == .board && !groups.allSatisfy(\.tasks.isEmpty) {
                    VStack(spacing: 0) {
                        pageHeader
                        board
                    }
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            pageHeader
                            list
                        }
                        .padding(.bottom, 24)
                    }
                    .refreshable { await model.sync?.refreshTasks() }
                }
            }
            .navigationTitle("Tasks")
            .tkRootScreen(model)
            .navigationDestination(for: TaskItem.self) { task in
                TaskDetailView(task: task, model: model)
                    .tkDetailScreen()
            }
            .sheet(isPresented: $showingFilters) {
                ViewOptionsSheet(model: model, context: .tasks)
            }
            // Screenshot hook: `--view-options` opens the sheet at launch.
            .onAppear {
                guard ProcessInfo.processInfo.arguments.contains("--view-options"), model.selectedTab == .tasks else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { showingFilters = true }
            }
        }
    }

    @ViewBuilder
    private var list: some View {
        ForEach(groups) { group in
            let collapsed = collapsedGroups.contains(group.id)
            if !group.label.isEmpty {
                TKGroupBand(
                    title: group.label,
                    color: group.color,
                    count: group.tasks.count,
                    collapsible: true,
                    collapsed: collapsed
                ) {
                    withAnimation(.snappy(duration: 0.2)) {
                        if !collapsedGroups.insert(group.id).inserted {
                            collapsedGroups.remove(group.id)
                        }
                    }
                }
            }
            if group.label.isEmpty || !collapsed {
                ForEach(group.tasks) { task in
                    TKHairline()
                    TaskRow(
                        task: task,
                        model: model,
                        showProject: model.taskFilters.group != .project
                    ) {
                        model.taskPath.append(task)
                    }
                    .taskContextMenu(for: task, model: model)
                }
            }
        }
        if groups.allSatisfy(\.tasks.isEmpty) {
            TKHairline(color: TK.hairlineStrong)
            TKEmptyState(
                text: model.taskFilters.hasActiveFilters
                    ? "No matching tasks. Try removing some filters."
                    : "You're all caught up."
            )
        } else {
            TKHairline()
        }
    }

    private var board: some View {
        TKBoard(columns: groups.filter { !$0.tasks.isEmpty || !$0.label.isEmpty }) { group in
            TKBoardColumnHeader(
                title: group.label.isEmpty ? "All tasks" : group.label,
                color: group.color,
                count: group.tasks.count
            )
        } cards: { group in
            ForEach(group.tasks) { task in
                Button {
                    model.taskPath.append(task)
                } label: {
                    TaskBoardCard(task: task, model: model, showProject: model.taskFilters.group != .project)
                }
                .buttonStyle(TKScaleStyle())
                .taskContextMenu(for: task, model: model)
            }
        }
    }

    /// Header: title + Filter (saved views and List/Board live inside the
    /// view options sheet).
    private var pageHeader: some View {
        TKPageHeader("Tasks") {
            TKFilterButton(count: activeFilterCount) { showingFilters = true }
        }
        .padding(.bottom, 10)
    }
}

#Preview {
    TasksView(model: AppModel())
        .preferredColorScheme(.dark)
}
