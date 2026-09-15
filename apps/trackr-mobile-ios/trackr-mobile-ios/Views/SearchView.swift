//
//  SearchView.swift
//  trackr-mobile-ios
//
//  Server search (/api/v1/search) — permission-scoped, grouped by type
//  into bands (DESIGN.md §5 "Search"). Results resolve into the already-
//  loaded model entities so taps push the same detail screens as the
//  lists. Idle: the last four queries as chips.
//

import SwiftUI

struct SearchView: View {
    @Bindable var model: AppModel

    /// `--search <q>` (sample mode only) seeds the field for screenshots.
    @State private var query: String = {
        let args = ProcessInfo.processInfo.arguments
        guard args.contains("--sample-data"), let index = args.firstIndex(of: "--search"),
              index + 1 < args.count else { return "" }
        return args[index + 1]
    }()
    @State private var results: [API.SearchResult] = []
    @State private var isSearching = false
    @State private var searchTask: Task<Void, Never>?
    /// Last four queries, newest first, "|"-joined.
    @AppStorage("trackr.recentSearches") private var recentRaw = ""

    private var recent: [String] {
        recentRaw.split(separator: "|").map(String.init).filter { !$0.isEmpty }
    }

    private var trimmedQuery: String { query.trimmingCharacters(in: .whitespaces) }

    private var grouped: [(label: String, items: [API.SearchResult])] {
        let order = ["ticket", "task", "project", "wiki", "note"]
        let labels = [
            "ticket": "Tickets", "task": "Tasks", "project": "Projects",
            "wiki": "Wiki", "note": "Notes",
        ]
        return order.compactMap { type in
            let items = results.filter { $0.type == type }
            guard !items.isEmpty else { return nil }
            return (labels[type] ?? type, items)
        }
    }

    var body: some View {
        NavigationStack(path: $model.searchPath) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    TKPageHeader("Search")

                    // The main tabs stay mounted behind each other, so the
                    // field only auto-focuses while Search is the visible
                    // surface (re-created on every switch).
                    TKSearchField(
                        text: $query,
                        placeholder: "Tickets, tasks, projects…",
                        autoFocus: model.selectedTab == .search
                    )
                    .id(model.selectedTab == .search)
                    .padding(.horizontal, TK.gutter)
                    .padding(.top, 8)
                    .padding(.bottom, 14)

                    if trimmedQuery.isEmpty {
                        idle
                    } else if results.isEmpty {
                        if isSearching {
                            ProgressView()
                                .tint(TK.text3)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 48)
                        } else if trimmedQuery.count < 2 {
                            hint("Keep typing — searches start at two characters.")
                        } else {
                            TKEmptyState(text: "No results for “\(trimmedQuery)”")
                        }
                    } else {
                        ForEach(grouped, id: \.label) { group in
                            SearchBand(title: group.label, count: group.items.count)
                            ForEach(Array(group.items.enumerated()), id: \.element.id) { index, result in
                                if index > 0 {
                                    TKHairline(leading: TK.gutter + 34)
                                }
                                row(result)
                            }
                        }
                        TKHairline(color: TK.hairlineStrong)
                    }
                }
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .tkRootScreen(model)
            .onAppear { if !trimmedQuery.isEmpty, results.isEmpty { search(query) } }
            .navigationDestination(for: TaskItem.self) { task in
                TaskDetailView(task: task, model: model)
                    .tkDetailScreen()
            }
            .navigationDestination(for: TicketItem.self) { ticket in
                TicketDetailView(ticket: ticket, model: model)
                    .tkDetailScreen()
            }
            .navigationDestination(for: NoteItem.self) { note in
                NoteDetailView(model: model, note: note)
                    .tkDetailScreen()
            }
            .navigationDestination(for: WikiPageItem.self) { page in
                WikiPageView(page: page, model: model)
                    .tkDetailScreen()
            }
            .navigationDestination(for: ProjectItem.self) { project in
                ProjectDetailView(model: model, project: project)
                    .tkDetailScreen()
            }
        }
        .onChange(of: query) { _, fresh in
            search(fresh)
        }
    }

    // MARK: - Idle

    private var idle: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !recent.isEmpty {
                TKSectionLabel("Recent")
                ChipFlow {
                    ForEach(recent, id: \.self) { term in
                        Button {
                            query = term
                        } label: {
                            PropertyChip(leadingInset: 10) {
                                Image(systemName: "clock.arrow.circlepath")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(TK.text3)
                                Text(term)
                                    .lineLimit(1)
                            }
                        }
                        .buttonStyle(TKScaleStyle())
                        .contextMenu {
                            Button(role: .destructive) {
                                forget(term)
                            } label: {
                                Label("Remove", systemImage: "xmark")
                            }
                        }
                    }
                }
            }
            Text("Search across tickets, tasks, projects, notes and the wiki — keys like TRK-118 work too.")
                .font(.system(size: 12))
                .foregroundStyle(TK.text4)
                .lineSpacing(2)
                .padding(.top, recent.isEmpty ? 0 : 6)
        }
        .padding(.horizontal, TK.gutter)
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12))
            .foregroundStyle(TK.text4)
            .padding(.horizontal, TK.gutter)
    }

    // MARK: - Rows

    /// Resolve into the loaded model entity when possible; unresolvable
    /// hits still render, just without navigation.
    @ViewBuilder
    private func row(_ result: API.SearchResult) -> some View {
        if result.type == "task",
           let task = model.tasks.first(where: { $0.uuid == result.id || $0.id == result.id })
        {
            NavigationLink(value: task) {
                SearchRow(result: result, key: task.id) {
                    TypeBadge(type: task.type, showLabel: false, size: 22)
                }
            }
            .buttonStyle(TKPressStyle())
        } else if result.type == "ticket",
                  let ticket = model.tickets.first(where: { $0.uuid == result.id || $0.id == result.id })
        {
            NavigationLink(value: ticket) {
                SearchRow(result: result, key: ticket.id) {
                    SearchTile(color: ticket.org.color) { TKDot(color: ticket.org.color) }
                }
            }
            .buttonStyle(TKPressStyle())
        } else if result.type == "note", let note = model.notes.first(where: { $0.id == result.id }) {
            NavigationLink(value: note) {
                SearchRow(result: result) { SearchTile { symbol("note.text") } }
            }
            .buttonStyle(TKPressStyle())
        } else if result.type == "wiki", let page = model.wikiPages.first(where: { $0.id == result.id }) {
            NavigationLink(value: page) {
                SearchRow(result: result) { SearchTile { symbol("book") } }
            }
            .buttonStyle(TKPressStyle())
        } else if result.type == "project",
                  let project = model.projects.first(where: { $0.serverId == result.id || $0.key == result.id })
        {
            NavigationLink(value: project) {
                SearchRow(result: result, key: project.key) { ProjectTile(project: project, size: 22) }
            }
            .buttonStyle(TKPressStyle())
        } else {
            SearchRow(result: result) { SearchTile { symbol(Self.symbol(for: result.type)) } }
        }
    }

    private func symbol(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(TK.text2)
    }

    private static func symbol(for type: String) -> String {
        switch type {
        case "ticket": "ticket"
        case "task": "checkmark.square"
        case "project": "folder"
        case "wiki": "book"
        case "note": "note.text"
        default: "magnifyingglass"
        }
    }

    // MARK: - Search

    private func search(_ text: String) {
        searchTask?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 else {
            results = []
            isSearching = false
            return
        }
        guard let sync = model.sync else {
            // No server (previews, sample mode): match the loaded entities.
            results = localResults(trimmed)
            isSearching = false
            if !results.isEmpty { remember(trimmed) }
            return
        }
        isSearching = true
        searchTask = Task {
            // Debounce a keystroke burst into one request.
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            let fresh = await sync.search(trimmed)
            guard !Task.isCancelled else { return }
            results = fresh
            isSearching = false
            if !fresh.isEmpty { remember(trimmed) }
        }
    }

    private func localResults(_ q: String) -> [API.SearchResult] {
        func hit(_ text: String) -> Bool { text.localizedCaseInsensitiveContains(q) }
        var out: [API.SearchResult] = []
        out += model.tickets.filter { hit($0.subject) || hit($0.id) }.map {
            API.SearchResult(type: "ticket", id: $0.id, title: $0.subject, subtitle: "\($0.org.name) · \($0.status.label)", url: "")
        }
        out += model.tasks.filter { hit($0.title) || hit($0.id) }.map {
            API.SearchResult(type: "task", id: $0.id, title: $0.title, subtitle: "\($0.project) · \($0.status.label)", url: "")
        }
        out += model.projects.filter { hit($0.name) || hit($0.key) }.map {
            API.SearchResult(type: "project", id: $0.key, title: $0.name, subtitle: $0.status.label, url: "")
        }
        out += model.wikiPages.filter { hit($0.title) }.map {
            API.SearchResult(type: "wiki", id: $0.id, title: $0.title, subtitle: "Wiki", url: "")
        }
        out += model.notes.filter { hit($0.title) }.map {
            API.SearchResult(type: "note", id: $0.id, title: $0.title, subtitle: "Note", url: "")
        }
        return out
    }

    private func remember(_ term: String) {
        var list = recent.filter { $0.caseInsensitiveCompare(term) != .orderedSame }
        list.insert(term.replacingOccurrences(of: "|", with: " "), at: 0)
        recentRaw = list.prefix(4).joined(separator: "|")
    }

    private func forget(_ term: String) {
        recentRaw = recent.filter { $0 != term }.joined(separator: "|")
    }
}

// MARK: - Band & row

/// Type band: uppercase 11pt label + mono count on the raised surface.
private struct SearchBand: View {
    let title: String
    let count: Int

    var body: some View {
        HStack(spacing: 8) {
            TKSectionLabel(title, color: TK.text3)
            Text("\(count)")
                .font(.tkMono(11))
                .foregroundStyle(TK.text4)
            Spacer()
        }
        .padding(.horizontal, TK.gutter)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, minHeight: 34)
        .background(TK.bgRaised)
        .overlay(alignment: .top) { TKHairline(color: TK.hairlineStrong) }
    }
}

/// 22pt icon tile · title 15 · KEY mono + meta 11 · chevron.
private struct SearchRow<Icon: View>: View {
    let result: API.SearchResult
    var key: String? = nil
    @ViewBuilder var icon: Icon

    var body: some View {
        HStack(spacing: 12) {
            icon
                .frame(width: 22, height: 22)
            VStack(alignment: .leading, spacing: 3) {
                Text(result.title)
                    .font(.tkRow)
                    .foregroundStyle(TK.text)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let key {
                        Text(key)
                            .font(.tkMono(11))
                            .foregroundStyle(TK.text3)
                    }
                    if let subtitle = result.subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.tkMetaSm)
                            .foregroundStyle(TK.text3)
                            .lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(TK.text5)
        }
        .padding(.horizontal, TK.gutter)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .contentShape(.rect)
    }
}

/// 22pt rounded tile behind a glyph (tinted by `color`, card-neutral else).
private struct SearchTile<Content: View>: View {
    var color: Color? = nil
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(width: 22, height: 22)
            .background(color.map(TK.tint) ?? TK.elevated, in: .rect(cornerRadius: 6))
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .strokeBorder(color.map(TK.tintBorder) ?? TK.border, lineWidth: 1)
            )
    }
}

#Preview("Idle") {
    SearchView(model: AppModel())
        .preferredColorScheme(.dark)
}

#Preview("Results") {
    let model = AppModel()
    let sample: [API.SearchResult] = [
        API.SearchResult(type: "ticket", id: "SIWEB-14", title: "Checkout button unresponsive on iOS",
                         subtitle: "Siweb GmbH · Open", url: ""),
        API.SearchResult(type: "task", id: "TRK-139", title: "Fix Outlook rendering of the digest mail",
                         subtitle: "Trackr Web · In Progress", url: ""),
        API.SearchResult(type: "project", id: "TRK", title: "Trackr Web", subtitle: "Active", url: ""),
        API.SearchResult(type: "wiki", id: "w1", title: "Deployment checklist", subtitle: "Wiki", url: ""),
    ]
    ScrollView {
        VStack(spacing: 0) {
            TKPageHeader("Search")
            TKSearchField(text: .constant("digest"), placeholder: "Tickets, tasks, projects…")
                .padding(.horizontal, TK.gutter)
                .padding(.vertical, 8)
            ForEach(sample, id: \.id) { result in
                SearchBand(title: result.type, count: 1)
                SearchRow(result: result, key: result.id) {
                    SearchTile(color: model.projects[0].color) { TKDot(color: model.projects[0].color) }
                }
            }
            TKHairline(color: TK.hairlineStrong)
        }
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
