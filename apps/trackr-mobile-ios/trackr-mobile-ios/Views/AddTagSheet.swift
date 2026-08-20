//
//  AddTagSheet.swift
//  trackr-mobile-ios
//
//  Web parity (Inspector tags popover): free-text tag plus suggestions
//  from tags already in use, minus the ones on this task.
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
        Set(allTags).subtracting(existingTags).sorted()
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("New tag", text: $newTag)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onSubmit(add)
                }

                if !suggestions.isEmpty {
                    Section("Suggestions") {
                        ForEach(suggestions, id: \.self) { tag in
                            Button {
                                onAdd(tag)
                                dismiss()
                            } label: {
                                HStack {
                                    TagChip(tag: tag)
                                    Spacer()
                                    Image(systemName: "plus")
                                        .font(.system(size: 13))
                                        .foregroundStyle(Color(.tertiaryLabel))
                                }
                            }
                        }
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Add Tag")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add", action: add)
                        .fontWeight(.semibold)
                        .disabled(newTag.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func add() {
        let tag = newTag.trimmingCharacters(in: .whitespaces).lowercased()
        guard !tag.isEmpty, !existingTags.contains(tag) else { return }
        onAdd(tag)
        dismiss()
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        AddTagSheet(existingTags: ["mobile"], allTags: TaskItem.samples.flatMap(\.tags)) { _ in }
    }
}
