//
//  ProjectsView.swift
//  trackr-mobile-ios
//
//  All projects — same toolbar trio as Tasks (views + filter capsule,
//  create), newest activity first.
//

import SwiftUI

struct ProjectsView: View {
    @Bindable var model: AppModel

    @State private var showingFilters = false
    @State private var showingViews = false
    @State private var showingCreate = false
    @State private var historyProject: ProjectItem?

    private var visible: [ProjectItem] {
        model.projects
            .filter(model.projectFilters.matches)
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    private func openTasks(in project: ProjectItem) -> Int {
        model.tasks.count { $0.project == project.name && $0.status != .done }
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(visible) { project in
                    NavigationLink(value: project) {
                        ProjectListCard(
                            project: project,
                            openTasks: openTasks(in: project),
                            onHistory: { historyProject = project }
                        )
                    }
                    .buttonStyle(.plain)
                }
                if visible.isEmpty {
                    ContentUnavailableView(
                        "No matching projects",
                        systemImage: "line.3.horizontal.decrease",
                        description: Text("Try removing some filters.")
                    )
                    .padding(.top, 60)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Projects")
        .toolbar {
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
                .tint(model.projectFilters.hasActiveFilters ? .accentColor : nil)
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
            ProjectFiltersSheet(filters: $model.projectFilters, projects: model.projects)
        }
        .sheet(isPresented: $showingViews) {
            SavedViewsSheet(
                entries: model.savedProjectViews,
                summary: {
                    ProjectFilters(
                        webConfig: $0.config, directories: ViewDirectories(model: model)
                    ).summary
                },
                isActive: {
                    ProjectFilters(
                        webConfig: $0.config, directories: ViewDirectories(model: model)
                    ) == model.projectFilters
                },
                onApply: { model.sync?.applySavedView(.projects, entry: $0) },
                onCreate: { model.sync?.createSavedView(.projects, name: $0) },
                onRename: { model.sync?.renameSavedView(.projects, id: $0.id, to: $1) },
                onDelete: { model.sync?.deleteSavedView(.projects, id: $0.id) }
            )
        }
        .sheet(item: $historyProject) { project in
            ProjectHistorySheet(model: model, projectKey: project.key)
        }
        .sheet(isPresented: $showingCreate) {
            CreateProjectSheet(projects: model.projects) { project in
                model.projects.insert(project, at: 0)
            }
        }
    }
}

struct ProjectFiltersSheet: View {
    @Binding var filters: ProjectFilters
    let projects: [ProjectItem]
    @Environment(\.dismiss) private var dismiss

    private var memberOptions: [(value: UserRef, label: String)] {
        Array(Set(projects.flatMap(\.members)))
            .sorted { $0.name < $1.name }
            .map { ($0, $0.name) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Filter by") {
                    MultiSelectRow(
                        title: "Status",
                        options: ProjectStatus.allCases.map { ($0, $0.label) },
                        selection: $filters.statuses
                    )
                    MultiSelectRow(
                        title: "Member",
                        options: memberOptions,
                        selection: $filters.members
                    )
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Reset") { filters = ProjectFilters() }
                        .disabled(!filters.hasActiveFilters)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

#Preview {
    NavigationStack {
        ProjectsView(model: AppModel())
    }
}
