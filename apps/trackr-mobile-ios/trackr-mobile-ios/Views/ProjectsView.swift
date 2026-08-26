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
        // A List (not a ScrollView) so rows get native swipe actions; the
        // chrome is stripped so it still reads as the same card stack.
        List {
            ForEach(visible) { project in
                ProjectListCard(
                    project: project,
                    openTasks: openTasks(in: project),
                    onHistory: { historyProject = project }
                )
                .overlay {
                    // Hidden link keeps the tap-to-open behaviour without the
                    // List's disclosure chevron.
                    NavigationLink(value: project) { EmptyView() }.opacity(0)
                }
                .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                // Both on the trailing edge: a leading swipe collides with the
                // NavigationStack's edge-swipe-to-go-back on this pushed screen.
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button {
                        model.toggleFavorite(projectKey: project.key)
                    } label: {
                        Label(
                            project.isFavorite ? "Unfavorite" : "Favorite",
                            systemImage: project.isFavorite ? "star.slash.fill" : "star.fill"
                        )
                    }
                    .tint(.yellow)
                    Button {
                        historyProject = project
                    } label: {
                        Label("History", systemImage: "clock.arrow.circlepath")
                    }
                    .tint(.gray)
                }
            }
            if visible.isEmpty {
                ContentUnavailableView(
                    "No matching projects",
                    systemImage: "line.3.horizontal.decrease",
                    description: Text("Try removing some filters.")
                )
                .padding(.top, 60)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .contentMargins(.vertical, 11, for: .scrollContent)
        .background(Color.webBackground)
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
