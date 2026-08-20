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

    @State private var filters = TaskFilters()
    @State private var showingFilters = false
    @State private var showingViews = false
    @State private var showingCreate = false

    private var groups: [TaskGroup] { filters.grouped(model.tasks) }

    var body: some View {
        NavigationStack(path: $model.taskPath) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    ForEach(groups) { group in
                        if !group.label.isEmpty {
                            GroupHeader(group: group)
                                .padding(.top, 14)
                                .padding(.leading, 4)
                        }
                        ForEach(group.tasks) { task in
                            NavigationLink(value: task) {
                                TaskCard(task: task)
                            }
                            .buttonStyle(.plain)
                        }
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
            .background(Color(.systemGroupedBackground))
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
                    .tint(filters.hasActiveFilters ? .accentColor : nil)
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
                TaskFiltersSheet(filters: $filters, tasks: model.tasks)
            }
            .sheet(isPresented: $showingViews) {
                SavedViewsSheet(filters: $filters)
            }
            .sheet(isPresented: $showingCreate) {
                CreateTaskSheet(tasks: model.tasks, model: model) { task in
                    model.tasks.insert(task, at: 0)
                    // POST accepts title/project/description; the rest lands
                    // via a follow-up PATCH inside createTask.
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

private struct GroupHeader: View {
    let group: TaskGroup

    var body: some View {
        HStack(spacing: 7) {
            if let color = group.color {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
            }
            Text(group.label)
                .font(.system(size: 13, weight: .semibold))
            Text("\(group.tasks.count)")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(.tertiary)
        }
    }
}

#Preview {
    TasksView(model: AppModel())
}
