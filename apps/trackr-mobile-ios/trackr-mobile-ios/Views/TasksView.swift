//
//  TasksView.swift
//  trackr-mobile-ios
//
//  Task cards with the web toolbar's group-by / window / filters behind a
//  native filter sheet. Tasks and the navigation path live in AppModel so
//  other features (work sessions) can open a task detail.
//

import SwiftUI

struct TasksView: View {
    @Bindable var model: AppModel

    @State private var showingFilters = false
    @State private var showingViews = false
    @State private var showingCreate = false
    @State private var collapsedGroups: Set<String> = []

    private var groups: [TaskGroup] { model.taskFilters.grouped(model.tasks) }

    var body: some View {
        NavigationStack(path: $model.taskPath) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    // Web ListView parity: one section container per group —
                    // header band on top, rows joined by hairline dividers.
                    ForEach(groups) { group in
                        VStack(spacing: 0) {
                            if !group.label.isEmpty {
                                GroupHeader(
                                    label: group.label,
                                    color: group.color,
                                    count: group.tasks.count,
                                    collapsed: collapsedGroups.contains(group.id)
                                ) {
                                    withAnimation(.snappy(duration: 0.25)) {
                                        if !collapsedGroups.insert(group.id).inserted {
                                            collapsedGroups.remove(group.id)
                                        }
                                    }
                                }
                            }
                            if group.label.isEmpty || !collapsedGroups.contains(group.id) {
                                ForEach(Array(group.tasks.enumerated()), id: \.element.id) {
                                    index, task in
                                    if index > 0 {
                                        Divider()
                                            .overlay(Color.webBorderStrong)
                                            .padding(.leading, 14)
                                    }
                                    NavigationLink(value: task) {
                                        TaskCard(task: task, embedded: true)
                                    }
                                    .buttonStyle(.plain)
                                    .taskContextMenu(for: task, model: model)
                                }
                            }
                        }
                        .sectionStyle()
                    }
                    if groups.allSatisfy(\.tasks.isEmpty) {
                        ContentUnavailableView(
                            "No matching tasks",
                            systemImage: "line.3.horizontal.decrease",
                            description: Text("Try removing some filters.")
                        )
                        .padding(.top, 60)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Color.webBackground)
            .refreshable { await model.sync?.refreshTasks() }
            .navigationDestination(for: TaskItem.self) { task in
                TaskDetailView(task: task, model: model)
            }
            .navigationTitle("Tasks")
            .toolbar {
                // Views + filter share one capsule, Apple Music style.
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        showingViews = true
                    } label: {
                        Image(systemName: "text.badge.plus")
                    }
                    Button {
                        showingFilters = true
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease")
                    }
                    .tint(model.taskFilters.hasActiveFilters ? .accentColor : nil)
                }
                ToolbarSpacer(.fixed, placement: .topBarTrailing)
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingCreate = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingFilters) {
                TaskFiltersSheet(filters: $model.taskFilters, tasks: model.tasks)
            }
            .sheet(isPresented: $showingViews) {
                SavedViewsSheet(
                    entries: model.savedTaskViews,
                    summary: {
                        TaskFilters(
                            webConfig: $0.config, directories: ViewDirectories(model: model)
                        ).summary
                    },
                    isActive: {
                        TaskFilters(
                            webConfig: $0.config, directories: ViewDirectories(model: model)
                        ) == model.taskFilters
                    },
                    onApply: { model.sync?.applySavedView(.tasks, entry: $0) },
                    onCreate: { model.sync?.createSavedView(.tasks, name: $0) },
                    onRename: { model.sync?.renameSavedView(.tasks, id: $0.id, to: $1) },
                    onDelete: { model.sync?.deleteSavedView(.tasks, id: $0.id) }
                )
            }
            .sheet(isPresented: $showingCreate) {
                CreateTaskSheet(tasks: model.tasks, model: model) { task in
                    model.tasks.insert(task, at: 0)
                    if let key = model.projects.first(where: { $0.name == task.project })?.key {
                        model.sync?.createTask(
                            title: task.title,
                            projectKey: key,
                            description: task.details.isEmpty ? nil : task.details,
                            status: task.status,
                            priority: task.priority,
                            type: task.type,
                            due: task.due,
                            estimate: task.estimate,
                            assignees: task.assignees,
                            checklist: task.checklist
                        )
                    }
                }
            }
        }
    }
}

#Preview {
    TasksView(model: AppModel())
}
