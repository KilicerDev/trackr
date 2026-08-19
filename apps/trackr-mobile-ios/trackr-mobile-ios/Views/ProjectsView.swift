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

    @State private var filters = ProjectFilters()
    @State private var showingFilters = false
    @State private var showingViews = false
    @State private var showingCreate = false
    @State private var historyProject: ProjectItem?

    private var visible: [ProjectItem] {
        model.projects
            .filter(filters.matches)
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
            ProjectFiltersSheet(filters: $filters, projects: model.projects)
        }
        .sheet(isPresented: $showingViews) {
            ProjectViewsSheet(filters: $filters)
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

struct ProjectViewsSheet: View {
    @Binding var filters: ProjectFilters
    @Environment(\.dismiss) private var dismiss

    private static let presets: [(name: String, icon: String, statuses: Set<ProjectStatus>)] = [
        ("Active", "bolt", [.active]),
        ("Pipeline", "hourglass", [.prospect, .planned]),
        ("Delivered", "checkmark.seal", [.completed]),
        ("Everything", "tray.full", []),
    ]

    var body: some View {
        NavigationStack {
            List(Self.presets, id: \.name) { preset in
                Button {
                    filters.statuses = preset.statuses
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: preset.icon)
                            .font(.system(size: 17))
                            .foregroundStyle(Color.accentColor)
                            .frame(width: 26)
                        Text(preset.name)
                            .foregroundStyle(Color.primary)
                        Spacer()
                        if filters.statuses == preset.statuses {
                            Image(systemName: "checkmark")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                }
            }
            .navigationTitle("Views")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium])
    }
}

#Preview {
    NavigationStack {
        ProjectsView(model: AppModel())
    }
}
