//
//  AddTagSheet.swift
//  trackr-mobile-ios
//
//  Web parity (Inspector tags popover): free-text tag plus suggestions
//  from tags already in use, minus the ones on this task. Kit-styled:
//  sheet header, search-style field that doubles as the new-tag input,
//  suggestion rows with tag chips, "Add" CTA.
//

import SwiftUI

struct AddTagSheet: View {
    let existingTags: [String]
    /// Suggestion pool: every tag in use across the caller's collection
    /// (all loaded tasks or tickets).
    var allTags: [String] = []
    let onAdd: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var newTag = ""

    private var suggestions: [String] {
        let pool = Set(allTags).subtracting(existingTags).sorted()
        let q = normalized
        guard !q.isEmpty else { return pool }
        return pool.filter { $0.localizedCaseInsensitiveContains(q) }
    }

    private var normalized: String { newTag.trimmingCharacters(in: .whitespaces).lowercased() }

    private var canAdd: Bool { !normalized.isEmpty && !existingTags.contains(normalized) }

    var body: some View {
        VStack(spacing: 12) {
            TKSheetHeader(title: "Add tag")
            TKSearchField(text: $newTag, placeholder: "New tag", height: 44, autoFocus: true)
                .textInputAutocapitalization(.never)
                .onSubmit(add)
                .padding(.horizontal, TK.gutter)

            if !existingTags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        TKSectionLabel("On this item")
                            .padding(.trailing, 4)
                        ForEach(existingTags, id: \.self) { TagChip(tag: $0) }
                    }
                    .padding(.horizontal, TK.gutter)
                }
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    if !suggestions.isEmpty {
                        TKSectionLabel("Suggestions")
                        VStack(spacing: 0) {
                            ForEach(suggestions, id: \.self) { tag in
                                Button {
                                    onAdd(tag)
                                    dismiss()
                                } label: {
                                    HStack {
                                        TagChip(tag: tag)
                                        Spacer()
                                        Image(systemName: "plus")
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundStyle(TK.text3)
                                    }
                                    .padding(.horizontal, 14)
                                    .frame(minHeight: 46)
                                    .contentShape(.rect)
                                }
                                .buttonStyle(TKPressStyle())
                                if tag != suggestions.last {
                                    TKHairline(color: TK.hairlineStrong)
                                }
                            }
                        }
                        .tkCard(radius: TK.rCardSm, padding: nil, fill: TK.bg)
                    } else if normalized.isEmpty {
                        TKEmptyState(text: "Type a tag, or pick one already in use.", padding: 24)
                    }
                }
                .padding(.horizontal, TK.gutter)
                .padding(.bottom, 12)
            }
            .scrollDismissesKeyboard(.interactively)

            TKPrimaryButton(title: normalized.isEmpty ? "Add tag" : "Add “\(normalized)”",
                            enabled: canAdd, action: add)
                .padding(.horizontal, TK.gutter)
                .padding(.bottom, 16)
        }
        .tkSheet(detents: [.medium, .large])
    }

    private func add() {
        let tag = normalized
        guard !tag.isEmpty, !existingTags.contains(tag) else { return }
        onAdd(tag)
        dismiss()
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        AddTagSheet(existingTags: ["mobile"], allTags: TaskItem.samples.flatMap(\.tags)) { _ in }
    }
    .preferredColorScheme(.dark)
}
