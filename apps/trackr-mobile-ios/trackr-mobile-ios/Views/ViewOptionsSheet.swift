//
//  ViewOptionsSheet.swift
//  trackr-mobile-ios
//
//  One sheet per list page (tasks / tickets / projects) for everything
//  that shapes the list: SAVED VIEWS chips (apply, save current, update /
//  rename / delete via context menu — web ViewsMenu parity), a LAYOUT card
//  (List/Board, Group by, Sort by + direction, Window) and a FILTERS card
//  (one row per multi-select filter, `×` to clear, "Clear all"). The
//  footer "Show N …" closes it. Replaces TaskFiltersSheet /
//  TicketFiltersSheet / ProjectFiltersSheet / SavedViewsSheet — those
//  names remain as thin wrappers so existing call sites keep compiling.
//
//  Every filter/sort/saved-view mutation goes through the same model and
//  SyncEngine paths as before (filters didSet → filtersChanged, saved
//  views → create/rename/update/delete/applySavedView).
//

import SwiftUI

enum ViewOptionsContext {
    case tasks, tickets, projects
}

struct ViewOptionsSheet: View {
    @Bindable var model: AppModel
    let context: ViewOptionsContext

    init(model: AppModel, context: ViewOptionsContext) {
        self.model = model
        self.context = context
    }

    var body: some View {
        switch context {
        case .tasks:
            ViewOptionsBody(config: .tasks(
                filters: $model.taskFilters,
                tasks: model.tasks,
                users: model.assignableUsers,
                projects: model.projects,
                savedViews: hooks(.tasks, entries: model.savedTaskViews) {
                    TaskFilters(webConfig: $0.config, directories: ViewDirectories(model: model))
                }
            ))
        case .tickets:
            ViewOptionsBody(config: .tickets(
                filters: $model.ticketFilters,
                tickets: model.tickets,
                users: model.assignableUsers,
                orgs: model.orgs,
                savedViews: hooks(.tickets, entries: model.savedTicketViews) {
                    TicketFilters(webConfig: $0.config, directories: ViewDirectories(model: model))
                }
            ))
        case .projects:
            ViewOptionsBody(config: .projects(
                filters: $model.projectFilters,
                projects: model.projects,
                users: model.assignableUsers,
                savedViews: hooks(.projects, entries: model.savedProjectViews) {
                    ProjectFilters(webConfig: $0.config, directories: ViewDirectories(model: model))
                }
            ))
        }
    }

    /// Saved-view hooks routed through SyncEngine (server round-trip) —
    /// the same closures the list pages passed to SavedViewsSheet.
    private func hooks<F: Equatable & ViewOptionsSummarizing>(
        _ key: ViewKey, entries: [SavedViewEntry], decode: @escaping (SavedViewEntry) -> F
    ) -> SavedViewsHooks {
        let current: F = switch key {
        case .tasks: model.taskFilters as! F
        case .tickets: model.ticketFilters as! F
        case .projects: model.projectFilters as! F
        }
        return SavedViewsHooks(
            entries: entries,
            summary: { decode($0).summary },
            isActive: { decode($0) == current },
            onApply: { [model] entry in
                if let sync = model.sync {
                    sync.applySavedView(key, entry: entry)
                } else {
                    // Previews / sample data: apply locally.
                    let directories = ViewDirectories(model: model)
                    switch key {
                    case .tasks: model.taskFilters = TaskFilters(webConfig: entry.config, directories: directories)
                    case .tickets: model.ticketFilters = TicketFilters(webConfig: entry.config, directories: directories)
                    case .projects: model.projectFilters = ProjectFilters(webConfig: entry.config, directories: directories)
                    }
                }
            },
            onCreate: { [model] name in
                if let sync = model.sync {
                    sync.createSavedView(key, name: name)
                } else {
                    // Previews / sample data: keep the list locally.
                    var list = Self.savedViews(model, key)
                    let config = Self.currentConfig(model, key)
                    list.append(SavedViewEntry(id: UUID().uuidString.lowercased(), name: name, config: config))
                    Self.setSavedViews(model, key, list)
                }
            },
            onRename: { [model] entry, name in
                if let sync = model.sync {
                    sync.renameSavedView(key, id: entry.id, to: name)
                } else {
                    var list = Self.savedViews(model, key)
                    if let i = list.firstIndex(where: { $0.id == entry.id }) { list[i].name = name }
                    Self.setSavedViews(model, key, list)
                }
            },
            onDelete: { [model] entry in
                if let sync = model.sync {
                    sync.deleteSavedView(key, id: entry.id)
                } else {
                    Self.setSavedViews(model, key, Self.savedViews(model, key).filter { $0.id != entry.id })
                }
            },
            onUpdate: { [model] entry in
                if let sync = model.sync {
                    sync.updateSavedView(key, id: entry.id)
                } else {
                    var list = Self.savedViews(model, key)
                    if let i = list.firstIndex(where: { $0.id == entry.id }) {
                        list[i].config = Self.currentConfig(model, key)
                    }
                    Self.setSavedViews(model, key, list)
                }
            }
        )
    }

    private static func savedViews(_ model: AppModel, _ key: ViewKey) -> [SavedViewEntry] {
        switch key {
        case .tasks: model.savedTaskViews
        case .tickets: model.savedTicketViews
        case .projects: model.savedProjectViews
        }
    }

    private static func setSavedViews(_ model: AppModel, _ key: ViewKey, _ views: [SavedViewEntry]) {
        switch key {
        case .tasks: model.savedTaskViews = views
        case .tickets: model.savedTicketViews = views
        case .projects: model.savedProjectViews = views
        }
    }

    private static func currentConfig(_ model: AppModel, _ key: ViewKey) -> JSONValue {
        let directories = ViewDirectories(model: model)
        return switch key {
        case .tasks: model.taskFilters.webConfig(directories: directories)
        case .tickets: model.ticketFilters.webConfig(directories: directories)
        case .projects: model.projectFilters.webConfig(directories: directories)
        }
    }
}

/// The three filter structs expose `summary` (SavedView.swift); this lets
/// the hooks builder stay generic.
protocol ViewOptionsSummarizing { var summary: String { get } }
extension TaskFilters: ViewOptionsSummarizing {}
extension TicketFilters: ViewOptionsSummarizing {}
extension ProjectFilters: ViewOptionsSummarizing {}

// MARK: - Configuration

struct SavedViewsHooks {
    var entries: [SavedViewEntry]
    var summary: (SavedViewEntry) -> String
    var isActive: (SavedViewEntry) -> Bool
    var onApply: (SavedViewEntry) -> Void
    var onCreate: (String) -> Void
    var onRename: (SavedViewEntry, String) -> Void
    var onDelete: (SavedViewEntry) -> Void
    /// Overwrite the entry with the page's current filters.
    var onUpdate: (SavedViewEntry) -> Void
}

/// A LAYOUT row: single-value picker (+ optional sort direction toggle).
struct ViewOptionsLayoutRow: Identifiable {
    let id: String
    let label: String
    let value: String
    let options: [TKPickerOption<String>]
    let selected: String
    let onPick: (String) -> Void
    var sortAscending: Bool? = nil
    var onToggleDirection: (() -> Void)? = nil
}

/// A FILTERS row: multi-select over type-erased option values.
struct ViewOptionsFilterRow: Identifiable {
    let id: String
    let label: String
    let symbol: String
    let options: [TKPickerOption<AnyHashable>]
    let selected: Set<AnyHashable>
    var searchable = false
    let onToggle: (AnyHashable) -> Void
    let onClear: () -> Void

    var isActive: Bool { !selected.isEmpty }

    /// "Any", the single pick, or "N selected".
    var summary: String {
        let picked = options.filter { selected.contains($0.value) }
        switch picked.count {
        case 0: return "Any"
        case 1: return picked[0].label
        case 2: return picked.map(\.label).joined(separator: ", ")
        default: return "\(picked.count) selected"
        }
    }
}

struct ViewOptionsConfig {
    /// "tasks" / "tickets" / "projects" — the footer noun.
    var noun: String
    /// Visible items with the current filters; nil hides the footer.
    var count: Int?
    var savedViews: SavedViewsHooks?
    /// Tickets: the List/Board segmented row (bound to
    /// `@AppStorage("trackr.ticketsLayout")` inside the body).
    var showsLayoutSegment = false
    var layout: [ViewOptionsLayoutRow] = []
    var filters: [ViewOptionsFilterRow] = []
    var canClearAll = false
    var onClearAll: () -> Void = {}

    var activeCount: Int { filters.count(where: \.isActive) }

    // MARK: Builders

    static func tasks(filters: Binding<TaskFilters>, tasks: [TaskItem], users: [UserRef] = [],
                      projects: [ProjectItem] = [], savedViews: SavedViewsHooks? = nil) -> ViewOptionsConfig {
        let f = filters.wrappedValue
        let assigneeOptions = mergedUsers(tasks.flatMap(\.assignees), users)
        let projectNames: [(String, Color?)] = projects.isEmpty
            ? Set(tasks.map(\.project)).sorted().map { ($0, nil) }
            : projects.filter { $0.status != .archived }.map { ($0.name, $0.color) }
        return ViewOptionsConfig(
            noun: "tasks",
            count: f.grouped(tasks).reduce(0) { $0 + $1.tasks.count },
            savedViews: savedViews,
            layout: [
                layoutRow(id: "group", label: "Group by", options: GroupBy.allCases, selected: f.group,
                          label: \.label) { filters.wrappedValue.group = $0 },
                sortRow(options: TaskSortKey.allCases, selected: f.sortBy, ascending: f.sortAscending,
                        label: \.label, onPick: { filters.wrappedValue.setSortKey($0) },
                        onToggle: { filters.wrappedValue.sortAscending.toggle() }),
                layoutRow(id: "window", label: "Window", options: TimeWindow.allCases, selected: f.window,
                          label: \.label) { filters.wrappedValue.window = $0 },
            ],
            filters: [
                filterRow(id: "status", label: "Status", symbol: "circle.lefthalf.filled",
                          options: TaskStatus.allCases, selection: filters.statuses, label: \.label) {
                    StatusDot(status: $0, size: 18)
                },
                filterRow(id: "priority", label: "Priority", symbol: "chart.bar",
                          options: TaskPriority.allCases, selection: filters.priorities, label: \.label) {
                    PriorityBars(priority: $0).frame(width: 26)
                },
                filterRow(id: "assignee", label: "Assignee", symbol: "person",
                          options: assigneeOptions, selection: filters.assignees, label: \.name,
                          searchable: assigneeOptions.count > 8) {
                    AvatarView(user: $0, size: 26)
                },
                filterRow(id: "project", label: "Project", symbol: "folder",
                          options: projectNames.map(\.0), selection: filters.projects, label: { $0 },
                          searchable: projectNames.count > 8) { name in
                    TKPickerIcon.dot(projectNames.first { $0.0 == name }?.1 ?? TK.text4)
                },
            ],
            canClearAll: f.hasActiveFilters || f.window != .month || !f.isDefaultSort,
            onClearAll: { filters.wrappedValue.reset() }
        )
    }

    static func tickets(filters: Binding<TicketFilters>, tickets: [TicketItem], users: [UserRef] = [],
                        orgs: [OrgRef] = [], savedViews: SavedViewsHooks? = nil) -> ViewOptionsConfig {
        let f = filters.wrappedValue
        let assigneeOptions = mergedUsers(tickets.flatMap(\.assignees), users)
        var orgOptions = orgs
        for org in tickets.map(\.org) where !orgOptions.contains(where: { $0.sameOrg(as: org) }) {
            orgOptions.append(org)
        }
        orgOptions.sort { $0.name < $1.name }
        return ViewOptionsConfig(
            noun: "tickets",
            count: f.grouped(tickets).reduce(0) { $0 + $1.tickets.count },
            savedViews: savedViews,
            showsLayoutSegment: true,
            layout: [
                layoutRow(id: "group", label: "Group by", options: TicketGroupBy.allCases, selected: f.group,
                          label: \.label) { filters.wrappedValue.group = $0 },
                sortRow(options: TicketSortKey.allCases, selected: f.sortBy, ascending: f.sortAscending,
                        label: \.label, onPick: { filters.wrappedValue.setSortKey($0) },
                        onToggle: { filters.wrappedValue.sortAscending.toggle() }),
            ],
            filters: [
                filterRow(id: "status", label: "Status", symbol: "circle.lefthalf.filled",
                          options: TicketStatus.allCases, selection: filters.statuses, label: \.label) {
                    TKPickerIcon.dot($0.color)
                },
                filterRow(id: "priority", label: "Priority", symbol: "chart.bar",
                          options: TaskPriority.ticketCases, selection: filters.priorities, label: \.label) {
                    PriorityBars(priority: $0).frame(width: 26)
                },
                filterRow(id: "category", label: "Category", symbol: "tag",
                          options: TicketCategory.allCases, selection: filters.categories, label: \.label) {
                    TKPickerIcon.dot($0.color)
                },
                filterRow(id: "org", label: "Organization", symbol: "building.2",
                          options: orgOptions, selection: filters.orgs, label: \.name,
                          searchable: orgOptions.count > 8) {
                    TKPickerIcon.dot($0.color)
                },
                filterRow(id: "assignee", label: "Assignee", symbol: "person",
                          options: assigneeOptions, selection: filters.assignees, label: \.name,
                          searchable: assigneeOptions.count > 8) {
                    AvatarView(user: $0, size: 26)
                },
            ],
            canClearAll: f.hasActiveFilters || !f.isDefaultSort,
            onClearAll: { filters.wrappedValue.reset() }
        )
    }

    static func projects(filters: Binding<ProjectFilters>, projects: [ProjectItem], users: [UserRef] = [],
                         savedViews: SavedViewsHooks? = nil) -> ViewOptionsConfig {
        let f = filters.wrappedValue
        let memberOptions = mergedUsers(projects.flatMap(\.members), users)
        return ViewOptionsConfig(
            noun: "projects",
            count: projects.filter(f.matches).count,
            savedViews: savedViews,
            filters: [
                filterRow(id: "status", label: "Status", symbol: "circle.lefthalf.filled",
                          options: ProjectStatus.allCases, selection: filters.statuses, label: \.label) {
                    TKPickerIcon.dot($0.color)
                },
                filterRow(id: "members", label: "Member", symbol: "person.2",
                          options: memberOptions, selection: filters.members, label: \.name,
                          searchable: memberOptions.count > 8) {
                    AvatarView(user: $0, size: 26)
                },
            ],
            canClearAll: f.hasActiveFilters,
            onClearAll: {
                filters.wrappedValue.statuses = []
                filters.wrappedValue.members = []
            }
        )
    }

    // MARK: Row helpers

    /// Page-derived users first, then the directory — deduped by server id.
    private static func mergedUsers(_ fromItems: [UserRef], _ directory: [UserRef]) -> [UserRef] {
        var out: [UserRef] = []
        for user in fromItems + directory where !out.contains(where: { $0.sameUser(as: user) }) {
            out.append(user)
        }
        return out.sorted { $0.name < $1.name }
    }

    private static func layoutRow<V: Hashable & Identifiable>(
        id: String, label: String, options: [V], selected: V, label name: (V) -> String,
        onPick: @escaping (V) -> Void
    ) -> ViewOptionsLayoutRow where V.ID == String {
        ViewOptionsLayoutRow(
            id: id, label: label, value: name(selected),
            options: options.map { TKPickerOption($0.id, label: name($0)) },
            selected: selected.id,
            onPick: { picked in
                if let value = options.first(where: { $0.id == picked }) { onPick(value) }
            }
        )
    }

    private static func sortRow<V: Hashable & Identifiable>(
        options: [V], selected: V, ascending: Bool, label name: (V) -> String,
        onPick: @escaping (V) -> Void, onToggle: @escaping () -> Void
    ) -> ViewOptionsLayoutRow where V.ID == String {
        var row = layoutRow(id: "sort", label: "Sort by", options: options, selected: selected,
                            label: name, onPick: onPick)
        row.sortAscending = ascending
        row.onToggleDirection = onToggle
        return row
    }

    private static func filterRow<V: Hashable>(
        id: String, label: String, symbol: String, options: [V], selection: Binding<Set<V>>,
        label name: (V) -> String, searchable: Bool = false, icon: ((V) -> any View)? = nil
    ) -> ViewOptionsFilterRow {
        ViewOptionsFilterRow(
            id: id, label: label, symbol: symbol,
            options: options.map { value in
                TKPickerOption(AnyHashable(value), label: name(value), icon: icon.map { make in { make(value) } })
            },
            selected: Set(selection.wrappedValue.map { AnyHashable($0) }),
            searchable: searchable,
            onToggle: { erased in
                guard let value = erased as? V else { return }
                if selection.wrappedValue.contains(value) {
                    selection.wrappedValue.remove(value)
                } else {
                    selection.wrappedValue.insert(value)
                }
            },
            onClear: { selection.wrappedValue = [] }
        )
    }
}

// MARK: - Body

struct ViewOptionsBody: View {
    let config: ViewOptionsConfig
    @Environment(\.dismiss) private var dismiss
    @AppStorage("trackr.ticketsLayout") private var ticketsLayout = "list"
    @State private var presented: Presented?

    private enum Presented: Identifiable {
        case layout(String)
        case filter(String)
        case newView
        case rename(SavedViewEntry)

        var id: String {
            switch self {
            case .layout(let id): "layout-\(id)"
            case .filter(let id): "filter-\(id)"
            case .newView: "new-view"
            case .rename(let entry): "rename-\(entry.id)"
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            TKSheetHeader(title: "View options", badge: config.activeCount)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let hooks = config.savedViews {
                        savedViewsSection(hooks)
                    }
                    if config.showsLayoutSegment || !config.layout.isEmpty {
                        layoutSection
                    }
                    if !config.filters.isEmpty {
                        filtersSection
                    }
                }
                .padding(.horizontal, TK.gutter)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
            if let count = config.count {
                VStack(spacing: 0) {
                    TKHairline(color: TK.hairlineStrong)
                    TKPrimaryButton(title: "Show \(count) \(count == 1 ? String(config.noun.dropLast()) : config.noun)") {
                        dismiss()
                    }
                    .padding(.horizontal, TK.gutter)
                    .padding(.top, 12)
                    .padding(.bottom, 12)
                }
            }
        }
        .tkSheet(detents: [.large])
        .sheet(item: $presented) { sheet($0) }
        // Screenshot hook: `--auto-save-view <name>` opens the save prompt.
        .onAppear {
            guard ProcessInfo.processInfo.arguments.contains("--auto-save-view") else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { presented = .newView }
        }
    }

    // MARK: Saved views

    private func savedViewsSection(_ hooks: SavedViewsHooks) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                TKSectionLabel("Saved views")
                if !hooks.entries.isEmpty {
                    Text("\(hooks.entries.count)")
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(hooks.entries) { entry in
                        let active = hooks.isActive(entry)
                        TKBookmarkChip(name: entry.name, selected: active) {
                            hooks.onApply(entry)
                        }
                        .contextMenu {
                            Text(hooks.summary(entry))
                            if !active {
                                Button {
                                    hooks.onUpdate(entry)
                                } label: {
                                    Label("Update with current filters", systemImage: "arrow.triangle.2.circlepath")
                                }
                            }
                            Button {
                                presented = .rename(entry)
                            } label: {
                                Label("Rename", systemImage: "pencil")
                            }
                            Button(role: .destructive) {
                                hooks.onDelete(entry)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                    let atLimit = hooks.entries.count >= SavedViewEntry.maxCount
                    TKGhostChip(title: "Save current") { presented = .newView }
                        .disabled(atLimit)
                        .opacity(atLimit ? 0.4 : 1)
                }
                .padding(.horizontal, TK.gutter)
            }
            .padding(.horizontal, -TK.gutter)
            if hooks.entries.isEmpty {
                Text("No saved views yet — set some filters, then save them here.")
                    .font(.system(size: 12))
                    .foregroundStyle(TK.text3)
            }
        }
    }

    // MARK: Layout

    private var layoutSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            TKSectionLabel("Layout")
            VStack(spacing: 0) {
                if config.showsLayoutSegment {
                    TKRow(label: "View") {
                        TKSegmented(["list", "board"], selection: $ticketsLayout, fill: TK.card) {
                            $0 == "list" ? "List" : "Board"
                        }
                    }
                    if !config.layout.isEmpty { TKHairline(color: TK.hairlineStrong) }
                }
                ForEach(config.layout) { row in
                    TKValueRow(label: row.label, value: row.value, active: true) {
                        presented = .layout(row.id)
                    } leading: {
                        EmptyView()
                    } accessory: {
                        if let ascending = row.sortAscending, let toggle = row.onToggleDirection {
                            Button(action: toggle) {
                                Image(systemName: ascending ? "arrow.up" : "arrow.down")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(TK.text)
                                    .frame(width: 28, height: 28)
                                    .background(TK.card, in: .rect(cornerRadius: TK.rSegmentItem))
                                    .overlay(RoundedRectangle(cornerRadius: TK.rSegmentItem).strokeBorder(TK.border, lineWidth: 1))
                                    .contentShape(.rect)
                            }
                            .buttonStyle(TKScaleStyle())
                            .accessibilityLabel(ascending ? "Ascending" : "Descending")
                        }
                    }
                    if row.id != config.layout.last?.id {
                        TKHairline(color: TK.hairlineStrong)
                    }
                }
            }
            .tkCard(padding: nil, fill: TK.bg)
        }
    }

    // MARK: Filters

    private var filtersSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                TKSectionLabel("Filters")
                Spacer()
                if config.canClearAll {
                    TKQuietButton(title: "Clear all", color: TK.accent, weight: .medium, action: config.onClearAll)
                }
            }
            VStack(spacing: 0) {
                ForEach(config.filters) { row in
                    TKValueRow(label: row.label, value: row.summary, active: row.isActive,
                               onClear: row.onClear) {
                        presented = .filter(row.id)
                    } leading: {
                        Image(systemName: row.symbol)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(row.isActive ? TK.accent : TK.text3)
                            .frame(width: 20)
                    }
                    if row.id != config.filters.last?.id {
                        TKHairline(color: TK.hairlineStrong)
                    }
                }
            }
            .tkCard(padding: nil, fill: TK.bg)
        }
    }

    // MARK: Sheets

    @ViewBuilder
    private func sheet(_ which: Presented) -> some View {
        switch which {
        case .layout(let id):
            if let row = config.layout.first(where: { $0.id == id }) {
                TKPickerSheet(title: row.label, options: row.options, selected: row.selected, onPick: row.onPick)
            }
        case .filter(let id):
            if let row = config.filters.first(where: { $0.id == id }) {
                TKMultiPickerSheet(
                    title: row.label,
                    options: row.options,
                    selected: row.selected,
                    searchable: row.searchable,
                    onToggle: row.onToggle,
                    onClear: row.onClear
                )
            }
        case .newView:
            TKTextPromptSheet(
                title: "Save view",
                placeholder: "View name",
                hint: "Saves the current filters as a reusable view — on the web too.",
                maxLength: SavedViewEntry.maxNameLength
            ) { name in
                config.savedViews?.onCreate(name)
            }
        case .rename(let entry):
            TKTextPromptSheet(
                title: "Rename view",
                placeholder: "View name",
                confirmTitle: "Rename",
                initialText: entry.name,
                maxLength: SavedViewEntry.maxNameLength
            ) { name in
                config.savedViews?.onRename(entry, name)
            }
        }
    }
}

// MARK: - Previews

#Preview("Tasks") {
    let model = AppModel()
    model.taskFilters.statuses = [.todo, .inProgress]
    model.taskFilters.priorities = [.high]
    model.savedTaskViews = [
        SavedViewEntry(id: "1", name: "Urgent work", config: model.taskFilters.webConfig(directories: ViewDirectories(model: model))),
        SavedViewEntry(id: "2", name: "My tasks", config: .object([:])),
    ]
    return Color.clear.sheet(isPresented: .constant(true)) {
        ViewOptionsSheet(model: model, context: .tasks)
    }
    .preferredColorScheme(.dark)
}

#Preview("Tickets") {
    let model = AppModel()
    return Color.clear.sheet(isPresented: .constant(true)) {
        ViewOptionsSheet(model: model, context: .tickets)
    }
    .preferredColorScheme(.dark)
}

#Preview("Projects") {
    let model = AppModel()
    return Color.clear.sheet(isPresented: .constant(true)) {
        ViewOptionsSheet(model: model, context: .projects)
    }
    .preferredColorScheme(.dark)
}
