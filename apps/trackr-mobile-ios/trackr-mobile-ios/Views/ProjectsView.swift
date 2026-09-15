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
                ProjectFiltersSheet(
                    filters: $model.projectFilters,
                    projects: model.projects,
                    matching: visible.count
                )
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
                    onDelete: { model.sync?.deleteSavedView(.projects, id: $0.id) },
                    onUpdate: { model.sync?.updateSavedView(.projects, id: $0.id) }
                )
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

// MARK: - Filters sheet

struct ProjectFiltersSheet: View {
    @Binding var filters: ProjectFilters
    let projects: [ProjectItem]
    var matching: Int = 0
    @Environment(\.dismiss) private var dismiss

    private enum Picker: String, Identifiable {
        case status, member
        var id: String { rawValue }
    }

    @State private var picker: Picker?

    private var memberOptions: [UserRef] {
        Array(Set(projects.flatMap(\.members))).sorted { $0.name < $1.name }
    }

    private var activeCount: Int {
        (filters.statuses.isEmpty ? 0 : 1) + (filters.members.isEmpty ? 0 : 1)
    }

    private var statusSummary: String {
        switch filters.statuses.count {
        case 0: "Any"
        case 1: filters.statuses.first?.label ?? "1 selected"
        default: "\(filters.statuses.count) selected"
        }
    }

    private var memberSummary: String {
        switch filters.members.count {
        case 0: "Anyone"
        case 1: filters.members.first?.name ?? "1 selected"
        default: "\(filters.members.count) selected"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            TKSheetHeader(title: "Filters", badge: activeCount)

            VStack(alignment: .leading, spacing: 10) {
                TKSectionLabel("Filters")
                    .padding(.leading, 2)
                VStack(spacing: 0) {
                    filterRow("Status", dot: filters.statuses.first?.color, value: statusSummary,
                              active: !filters.statuses.isEmpty,
                              clear: { filters.statuses = [] }) { picker = .status }
                    TKHairline(color: TK.hairlineStrong)
                    filterRow("Member", dot: nil, value: memberSummary,
                              active: !filters.members.isEmpty,
                              clear: { filters.members = [] }) { picker = .member }
                }
                .background(TK.bg, in: .rect(cornerRadius: TK.rCardSm))
                .overlay(RoundedRectangle(cornerRadius: TK.rCardSm).strokeBorder(TK.border, lineWidth: 1))
            }
            .padding(.horizontal, TK.gutter)
            .padding(.top, 18)

            Spacer(minLength: 16)

            VStack(spacing: 8) {
                TKPrimaryButton(title: "Show \(matching) project\(matching == 1 ? "" : "s")") { dismiss() }
                TKQuietButton(title: "Reset filters", color: filters.hasActiveFilters ? TK.text2 : TK.text5) {
                    filters = ProjectFilters()
                }
                .disabled(!filters.hasActiveFilters)
            }
            .padding(.horizontal, TK.gutter)
            .padding(.bottom, 20)
        }
        .tkSheet(detents: [.height(360), .large])
        .sheet(item: $picker) { which in
            switch which {
            case .status:
                ProjectMultiPickerSheet(
                    title: "Status",
                    options: ProjectStatus.allCases.map { status in
                        TKPickerOption(status, label: status.label) { TKPickerIcon.dot(status.color) }
                    },
                    selection: $filters.statuses
                )
            case .member:
                ProjectMultiPickerSheet(
                    title: "Member",
                    options: memberOptions.map { user in
                        TKPickerOption(user, label: user.name) { TKPickerIcon.avatar(user) }
                    },
                    selection: $filters.members
                )
            }
        }
    }

    private func filterRow(
        _ label: String, dot: Color?, value: String, active: Bool,
        clear: @escaping () -> Void, action: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 0) {
            Button(action: action) {
                HStack(spacing: 8) {
                    if let dot {
                        TKDot(color: dot)
                    }
                    Text(label)
                        .font(.tkRow)
                        .foregroundStyle(TK.text)
                    Spacer(minLength: 8)
                    TKRowValue(value: value, color: active ? TK.text : TK.text2)
                }
                .padding(.horizontal, 14)
                .frame(minHeight: 52)
                .contentShape(.rect)
            }
            .buttonStyle(TKPressStyle())
            if active {
                TKCircleButton(systemImage: "xmark", size: 28, fill: TK.mono(0.08), iconSize: 10, action: clear)
                    .padding(.trailing, 10)
            }
        }
    }
}

/// Multi-select variant of the option picker: every selected value shows
/// a check, the sheet stays open until closed.
private struct ProjectMultiPickerSheet<Value: Hashable>: View {
    let title: String
    let options: [TKPickerOption<Value>]
    @Binding var selection: Set<Value>

    private var detent: PresentationDetent {
        let rows = CGFloat(min(options.count, 9))
        return .height(min(UIScreen.main.bounds.height * 0.8, 120 + rows * 50))
    }

    var body: some View {
        VStack(spacing: 12) {
            TKSheetHeader(title: title)
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(options) { option in
                        let selected = selection.contains(option.value)
                        Button {
                            withAnimation(.snappy(duration: 0.15)) {
                                if selected { selection.remove(option.value) } else { selection.insert(option.value) }
                            }
                        } label: {
                            HStack(spacing: 12) {
                                if let icon = option.icon {
                                    icon.frame(width: 26)
                                }
                                Text(option.label)
                                    .font(.system(size: 16))
                                    .foregroundStyle(TK.text)
                                    .lineLimit(1)
                                Spacer()
                                if selected {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(TK.accent)
                                }
                            }
                            .padding(.horizontal, 14)
                            .frame(minHeight: 50)
                            .contentShape(.rect)
                        }
                        .buttonStyle(TKPressStyle())
                        if option.id != options.last?.id {
                            TKHairline(color: TK.hairlineStrong)
                        }
                    }
                    if options.isEmpty {
                        TKEmptyState(text: "Nothing to pick", padding: 24)
                    }
                }
                .background(TK.bg, in: .rect(cornerRadius: TK.rCardSm))
                .overlay(RoundedRectangle(cornerRadius: TK.rCardSm).strokeBorder(TK.border, lineWidth: 1))
                .padding(.horizontal, TK.gutter)
                .padding(.bottom, 24)
            }
        }
        .tkSheet(detents: [detent, .large])
    }
}

#Preview("Projects") {
    ProjectsView(model: AppModel())
        .preferredColorScheme(.dark)
}

#Preview("Filters") {
    @Previewable @State var filters = ProjectFilters(statuses: [.active])
    Color.clear.sheet(isPresented: .constant(true)) {
        ProjectFiltersSheet(filters: $filters, projects: ProjectItem.samples, matching: 3)
    }
    .preferredColorScheme(.dark)
}
