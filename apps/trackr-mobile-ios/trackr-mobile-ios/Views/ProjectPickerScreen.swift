//
//  ProjectPickerScreen.swift
//  trackr-mobile-ios
//
//  Searchable project picker for big workspaces (50+ projects) — a
//  `TKPickerSheet`-styled sheet with Favorites / Recent / All bands.
//  Favorites and recently-used projects surface first; typing filters the
//  whole list. Presented with `.sheet` from the create sheet's scope chip.
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

    private struct Band: Identifiable {
        let title: String?
        let rows: [ProjectChoice]
        var id: String { title ?? "all" }
    }

    private var bands: [Band] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.isEmpty else { return [Band(title: nil, rows: filtered)] }
        var out: [Band] = []
        if !favorites.isEmpty { out.append(Band(title: "Favorites", rows: favorites)) }
        if !recentChoices.isEmpty { out.append(Band(title: "Recent", rows: recentChoices)) }
        out.append(Band(title: out.isEmpty ? nil : "All projects", rows: all))
        return out
    }

    var body: some View {
        VStack(spacing: 12) {
            TKSheetHeader(title: "Project")
            TKSearchField(text: $query, placeholder: "Search projects…", height: 42, autoFocus: choices.count > 8)
                .padding(.horizontal, TK.gutter)
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(bands) { band in
                        if let title = band.title {
                            TKGroupBand(title: title, count: band.rows.count)
                        }
                        ForEach(band.rows, id: \.name) { choice in
                            row(choice)
                            if choice != band.rows.last {
                                TKHairline(color: TK.hairlineStrong, leading: 14)
                            }
                        }
                    }
                    if bands.allSatisfy(\.rows.isEmpty) {
                        TKEmptyState(text: "No matches", padding: 24)
                    }
                }
                .background(TK.bg, in: .rect(cornerRadius: TK.rCardSm))
                .clipShape(.rect(cornerRadius: TK.rCardSm))
                .overlay(RoundedRectangle(cornerRadius: TK.rCardSm).strokeBorder(TK.border, lineWidth: 1))
                .padding(.horizontal, TK.gutter)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .tkSheet(detents: [.large])
    }

    private func row(_ choice: ProjectChoice) -> some View {
        Button {
            selection = choice.name
            dismiss()
        } label: {
            HStack(spacing: 12) {
                Text(String(choice.name.prefix(1)).uppercased())
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 26, height: 26)
                    .background(choice.color, in: .rect(cornerRadius: 7))
                Text(choice.name)
                    .font(.system(size: 16))
                    .foregroundStyle(TK.text)
                    .lineLimit(1)
                if choice.isFavorite {
                    Image(systemName: "star.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(TK.amber)
                }
                Spacer()
                if choice.name == selection {
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
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        ProjectPickerScreen(
            choices: ProjectItem.samples.map {
                ProjectChoice(name: $0.name, color: $0.color, isFavorite: $0.isFavorite)
            },
            recents: ["Siweb Shop Relaunch"],
            selection: .constant("Trackr Web")
        )
    }
    .preferredColorScheme(.dark)
}
