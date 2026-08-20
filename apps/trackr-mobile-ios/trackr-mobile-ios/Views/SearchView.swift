//
//  SearchView.swift
//  trackr-mobile-ios
//
//  Server search (/api/v1/search) — permission-scoped, grouped by type.
//  Results resolve into the already-loaded model entities so taps push the
//  same detail screens as the lists.
//

import SwiftUI

struct SearchView: View {
    @Bindable var model: AppModel

    @State private var query = ""
    @State private var results: [API.SearchResult] = []
    @State private var isSearching = false
    @State private var searchTask: Task<Void, Never>?

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
        NavigationStack {
            Group {
                if query.isEmpty {
                    ContentUnavailableView(
                        "Search trackr",
                        systemImage: "magnifyingglass",
                        description: Text("Tickets, tasks, projects, notes and wiki.")
                    )
                } else if results.isEmpty && !isSearching {
                    ContentUnavailableView.search(text: query)
                } else {
                    List {
                        ForEach(grouped, id: \.label) { group in
                            Section(group.label) {
                                ForEach(group.items, id: \.id) { result in
                                    row(result)
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Search")
            .navigationDestination(for: TaskItem.self) { task in
                TaskDetailView(task: task, model: model)
            }
            .navigationDestination(for: TicketItem.self) { ticket in
                TicketDetailView(ticket: ticket, model: model)
            }
            .navigationDestination(for: NoteItem.self) { note in
                NoteDetailView(model: model, note: note)
            }
            .navigationDestination(for: WikiPageItem.self) { page in
                WikiPageView(page: page, model: model)
            }
            .navigationDestination(for: ProjectItem.self) { project in
                ProjectDetailView(model: model, project: project)
            }
        }
        .searchable(text: $query, prompt: "Tickets, tasks, notes…")
        .onChange(of: query) { _, fresh in
            search(fresh)
        }
    }

    @ViewBuilder
    private func row(_ result: API.SearchResult) -> some View {
        // Resolve into the loaded model entity when possible; unresolvable
        // hits still render, just without navigation.
        if result.type == "task",
           let task = model.tasks.first(where: { $0.uuid == result.id || $0.id == result.id })
        {
            NavigationLink(value: task) { rowLabel(result) }
        } else if result.type == "ticket",
                  let ticket = model.tickets.first(where: { $0.uuid == result.id || $0.id == result.id })
        {
            NavigationLink(value: ticket) { rowLabel(result) }
        } else if result.type == "note", let note = model.notes.first(where: { $0.id == result.id }) {
            NavigationLink(value: note) { rowLabel(result) }
        } else if result.type == "wiki", let page = model.wikiPages.first(where: { $0.id == result.id }) {
            NavigationLink(value: page) { rowLabel(result) }
        } else if result.type == "project",
                  let project = model.projects.first(where: { $0.serverId == result.id })
        {
            NavigationLink(value: project) { rowLabel(result) }
        } else {
            rowLabel(result)
        }
    }

    private func rowLabel(_ result: API.SearchResult) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(result.title)
                .font(.system(size: 15, weight: .medium))
                .lineLimit(1)
            if let subtitle = result.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }

    private func search(_ text: String) {
        searchTask?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2, let sync = model.sync else {
            results = []
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
        }
    }
}

#Preview {
    SearchView(model: AppModel())
}
