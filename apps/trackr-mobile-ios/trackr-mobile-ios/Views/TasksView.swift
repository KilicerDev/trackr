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
    @State private var showingViews = false
    @State private var collapsedGroups: Set<String> = []

    private var groups: [TaskGroup] { model.taskFilters.grouped(model.tasks) }

    private var openCount: Int { model.tasks.count { $0.status != .done } }

    /// Name of the saved view whose config equals the current filters —
    /// "Custom view" when none matches (web ViewsMenu parity).
    private var currentViewName: String {
        let directories = ViewDirectories(model: model)
        let match = model.savedTaskViews.first {
            TaskFilters(webConfig: $0.config, directories: directories) == model.taskFilters
        }
        return match?.name ?? "Custom view"
    }

    /// Number of multi-select filters in use (the badge on Filter).
    private var activeFilterCount: Int {
        let f = model.taskFilters
        return [f.statuses.isEmpty, f.priorities.isEmpty, f.assignees.isEmpty, f.projects.isEmpty]
            .count { !$0 }
    }

    var body: some View {
        NavigationStack(path: $model.taskPath) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    TKPageHeader("Tasks", meta: "\(openCount) open")
                    toolbar
                        .padding(.horizontal, TK.gutter)
                        .padding(.top, 10)
                        .padding(.bottom, 12)

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
                .padding(.bottom, 24)
            }
            .navigationTitle("Tasks")
            .tkRootScreen(model)
            .refreshable { await model.sync?.refreshTasks() }
            .navigationDestination(for: TaskItem.self) { task in
                TaskDetailView(task: task, model: model)
                    .tkDetailScreen()
            }
            .sheet(isPresented: $showingFilters) {
                ViewOptionsSheet(model: model, context: .tasks)
            }
            .sheet(isPresented: $showingViews) {
                ViewOptionsSheet(model: model, context: .tasks)
            }
        }
    }

    private var toolbar: some View {
        HStack(spacing: 8) {
            TKViewChip(name: currentViewName) {
                showingViews = true
            }
            .frame(maxWidth: 240, alignment: .leading)
            Spacer(minLength: 8)
            TKFilterButton(count: activeFilterCount) {
                showingFilters = true
            }
        }
    }
}

#Preview {
    TasksView(model: AppModel())
        .preferredColorScheme(.dark)
}
