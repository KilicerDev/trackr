//
//  ProjectPickerScreen.swift
//  trackr-mobile-ios
//
//  Searchable project picker for big workspaces (50+ projects) — pushed from
//  a Form row instead of an endless inline Menu. Favorites and recently-used
//  projects surface first; typing filters the whole list.
//

import SwiftUI

/// Lightweight picker row value — built from `ProjectItem`s when a model is
/// available, or bare names for previews/sample data.
struct ProjectChoice: Hashable {
    var name: String
    var color: Color = .gray
    var isFavorite = false
}

struct ProjectPickerScreen: View {
    let choices: [ProjectChoice]
    /// Recently-used project names (deduped, most recent first).
    var recents: [String] = []
    @Binding var selection: String
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var favorites: [ProjectChoice] {
        choices.filter(\.isFavorite).sorted { $0.name < $1.name }
    }
    private var recentChoices: [ProjectChoice] {
        // Keep the recency order; favorites already have their own section.
        recents.compactMap { name in
            choices.first { $0.name == name && !$0.isFavorite }
        }
    }
    private var all: [ProjectChoice] {
        choices.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
    private var filtered: [ProjectChoice] {
        all.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        List {
            if query.isEmpty {
                if !favorites.isEmpty {
                    Section("Favorites") { ForEach(favorites, id: \.name) { row($0) } }
                }
                if !recentChoices.isEmpty {
                    Section("Recent") { ForEach(recentChoices, id: \.name) { row($0) } }
                }
                Section(favorites.isEmpty && recentChoices.isEmpty ? "" : "All projects") {
                    ForEach(all, id: \.name) { row($0) }
                }
            } else {
                ForEach(filtered, id: \.name) { row($0) }
            }
        }
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always))
        .navigationTitle("Project")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(_ choice: ProjectChoice) -> some View {
        Button {
            selection = choice.name
            dismiss()
        } label: {
            HStack(spacing: 10) {
                Circle()
                    .fill(choice.color)
                    .frame(width: 10, height: 10)
                Text(choice.name)
                    .foregroundStyle(Color(.label))
                Spacer()
                if choice.name == selection {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        ProjectPickerScreen(
            choices: [
                ProjectChoice(name: "Webim Campaign", color: .blue, isFavorite: true),
                ProjectChoice(name: "Maja Demo", color: .purple),
                ProjectChoice(name: "Trackr Internal", color: .orange)
            ],
            recents: ["Maja Demo"],
            selection: .constant("Trackr Internal")
        )
    }
}
