//
//  ProjectsView.swift
//  trackr-mobile-ios
//
//  The Projects surface (account menu → Projects): page header with the
//  active count, the saved-view chip + filter toolbar, and one card per
//  project (DESIGN.md §5 "Projects"). Favorites and history live in the
//  card's context menu; "+" opens the create sheet.
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

    private var activeCount: Int {
        model.projects.count { $0.status == .active }
    }

    private var filterCount: Int {
        (model.projectFilters.statuses.isEmpty ? 0 : 1) + (model.projectFilters.members.isEmpty ? 0 : 1)
    }

    /// The saved view whose config equals the current filters, if any.
    private var activeViewName: String {
        let directories = ViewDirectories(model: model)
        let match = model.savedProjectViews.first {
            ProjectFilters(webConfig: $0.config, directories: directories) == model.projectFilters
        }
        return match?.name ?? (model.projectFilters.hasActiveFilters ? "Custom view" : "All projects")
    }

    var body: some View {
        NavigationStack(path: $model.projectsPath) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    TKPageHeader("Projects", meta: "\(activeCount) active")

                    HStack(spacing: 8) {
                        TKViewChip(name: activeViewName) { showingViews = true }
                        Spacer(minLength: 8)
                        TKFilterButton(count: filterCount) { showingFilters = true }
                        TKToolbarButton(action: { showingCreate = true }) {
                            Image(systemName: "plus")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .accessibilityLabel("New project")
                    }
                    .padding(.horizontal, TK.gutter)
                    .padding(.bottom, 4)

                    ForEach(visible) { project in
                        NavigationLink(value: project) {
                            ProjectCard(project: project)
                        }
                        .buttonStyle(TKScaleStyle())
                        .contextMenu {
                            Button {
                                model.toggleFavorite(projectKey: project.key)
                            } label: {
                                Label(
                                    project.isFavorite ? "Unfavorite" : "Favorite",
                                    systemImage: project.isFavorite ? "star.slash" : "star"
                                )
                            }
                            Button {
                                historyProject = project
                            } label: {
                                Label("History", systemImage: "clock.arrow.circlepath")
                            }
                        }
                        .padding(.horizontal, TK.gutter)
                    }

                    if visible.isEmpty {
                        VStack(spacing: 4) {
                            TKEmptyState(text: "No matching projects.", padding: 48)
                            if model.projectFilters.hasActiveFilters {
                                TKQuietButton(title: "Clear filters", color: TK.accent, weight: .medium) {
                                    model.projectFilters = ProjectFilters()
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.top, -36)
                            }
                        }
                    }
                }
                .padding(.bottom, 24)
            }
            .tkRootScreen(model)
            .navigationDestination(for: ProjectItem.self) { project in
                ProjectDetailView(model: model, project: project)
                    .tkDetailScreen()
            }
            .navigationDestination(for: TaskItem.self) { task in
                TaskDetailView(task: task, model: model)
                    .tkDetailScreen()
            }
            .sheet(isPresented: $showingFilters) {
                ViewOptionsSheet(model: model, context: .projects)
            }
            .sheet(isPresented: $showingViews) {
                ViewOptionsSheet(model: model, context: .projects)
            }
            .sheet(item: $historyProject) { project in
                ProjectHistorySheet(model: model, projectKey: project.key)
            }
            .sheet(isPresented: $showingCreate) {
                CreateProjectSheet(projects: model.projects, lead: model.me) { project in
                    model.projects.insert(project, at: 0)
                    model.toast("\(project.key) created")
                }
            }
        }
    }
}

// MARK: - Card

/// DESIGN.md §5 "Projects": 40pt letter tile · name + mono key · status on
/// the right · one-line description · 3pt color bar · team + lead/updated.
struct ProjectCard: View {
    let project: ProjectItem

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                ProjectTile(project: project, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 5) {
                        Text(project.name)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(TK.text)
                            .lineLimit(1)
                        if project.isFavorite {
                            Image(systemName: "star.fill")
                                .font(.system(size: 10))
                                .foregroundStyle(TK.amber)
                        }
                    }
                    Text(project.key)
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                }
                Spacer(minLength: 8)
                HStack(spacing: 6) {
                    TKDot(color: project.status.color)
                    Text(project.status.label)
                        .font(.system(size: 12))
                        .foregroundStyle(TK.text2)
                }
            }

            if !project.about.isEmpty {
                Text(project.about)
                    .font(.system(size: 13))
                    .foregroundStyle(TK.text2)
                    .lineLimit(1)
            }

            RoundedRectangle(cornerRadius: 1.5)
                .fill(project.color)
                .frame(height: 3)

            HStack(spacing: 8) {
                if !project.members.isEmpty {
                    AvatarStack(users: project.members, size: 24)
                }
                Spacer(minLength: 8)
                Text(footerText)
                    .font(.system(size: 12))
                    .foregroundStyle(TK.text3)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tkCard(padding: 14)
        .contentShape(.rect)
    }

    private var footerText: String {
        let updated = project.updatedAt.relativeShort
        if let lead = project.lead {
            let first = lead.name.split(separator: " ").first.map(String.init) ?? lead.name
            return "Lead \(first) · \(updated)"
        }
        return "Updated \(updated)"
    }
}

/// Letter tile on the project color (cards 40, detail 56, search rows 22).
struct ProjectTile: View {
    let project: ProjectItem
    var size: CGFloat = 40

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.275)
            .fill(project.color)
            .frame(width: size, height: size)
            .overlay(
                Text(project.initial)
                    .font(.system(size: size * 0.45, weight: .bold))
                    .foregroundStyle(.white)
            )
    }
}

#Preview("Projects") {
    ProjectsView(model: AppModel())
        .preferredColorScheme(.dark)
}
