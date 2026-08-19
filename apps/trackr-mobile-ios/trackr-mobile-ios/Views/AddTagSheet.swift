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
    let onAdd: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var newTag = ""

    private var suggestions: [String] {
        // All tags in use across tasks — from the API later.
        let all = Set(TaskItem.samples.flatMap(\.tags))
        return all.subtracting(existingTags).sorted()
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
        AddTagSheet(existingTags: ["mobile"]) { _ in }
    }
}
