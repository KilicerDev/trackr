//
//  SavedViewsSheet.swift
//  trackr-mobile-ios
//
//  Saved views for a page (tasks / tickets / projects) — the entries synced
//  with the web ViewsMenu. Tap applies, "Save current filters" snapshots the
//  page's active filters, rename/delete via context menu and swipe, "update with current
//  filters" via context menu and leading swipe (web ViewsMenu parity).
//

import SwiftUI

struct SavedViewsSheet: View {
    let entries: [SavedViewEntry]
    let summary: (SavedViewEntry) -> String
    let isActive: (SavedViewEntry) -> Bool
    let onApply: (SavedViewEntry) -> Void
    let onCreate: (String) -> Void
    let onRename: (SavedViewEntry, String) -> Void
    let onDelete: (SavedViewEntry) -> Void
    /// Overwrite the entry with the page's current filters.
    let onUpdate: (SavedViewEntry) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var namingNew = false
    @State private var newName = ""
    @State private var renaming: SavedViewEntry?
    @State private var renameText = ""

    private var atLimit: Bool { entries.count >= SavedViewEntry.maxCount }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        newName = ""
                        namingNew = true
                    } label: {
                        Label("Save current filters", systemImage: "plus.circle")
                            .foregroundStyle(atLimit ? Color(.tertiaryLabel) : Color.accentColor)
                    }
                    .disabled(atLimit)
                }

                if entries.isEmpty {
                    Section {
                        Text("No saved views yet — set some filters, then save them here.")
                            .font(.footnote)
                            .foregroundStyle(Color(.secondaryLabel))
                    }
                } else {
                    Section {
                        ForEach(entries) { entry in
                            Button {
                                onApply(entry)
                                dismiss()
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "line.3.horizontal.decrease.circle")
                                        .font(.system(size: 17))
                                        .foregroundStyle(Color.accentColor)
                                        .frame(width: 26)

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(entry.name)
                                            .foregroundStyle(Color.primary)
                                        Text(summary(entry))
                                            .font(.footnote)
                                            // Concrete color: inside a Button
                                            // label, .secondary derives from
                                            // the tint and renders washed-out
                                            // accent.
                                            .foregroundStyle(Color(.secondaryLabel))
                                            .lineLimit(1)
                                    }

                                    Spacer()

                                    if isActive(entry) {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 14, weight: .semibold))
                                            .foregroundStyle(Color.accentColor)
                                    }
                                }
                            }
                            .contextMenu {
                                if !isActive(entry) {
                                    Button {
                                        onUpdate(entry)
                                    } label: {
                                        Label("Update with current filters",
                                              systemImage: "arrow.triangle.2.circlepath")
                                    }
                                }
                                Button {
                                    renameText = entry.name
                                    renaming = entry
                                } label: {
                                    Label("Rename", systemImage: "pencil")
                                }
                                Button(role: .destructive) {
                                    onDelete(entry)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    onDelete(entry)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .leading) {
                                if !isActive(entry) {
                                    Button {
                                        onUpdate(entry)
                                    } label: {
                                        Label("Update", systemImage: "arrow.triangle.2.circlepath")
                                    }
                                    .tint(.accentColor)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Views")
            .navigationBarTitleDisplayMode(.inline)
            .alert("Save view", isPresented: $namingNew) {
                TextField("Name", text: $newName)
                Button("Cancel", role: .cancel) {}
                Button("Save") {
                    onCreate(newName)
                }
                .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty)
            } message: {
                Text("Saves the current filters as a reusable view — on the web too.")
            }
            .alert("Rename view", isPresented: Binding(
                get: { renaming != nil },
                set: { if !$0 { renaming = nil } }
            )) {
                TextField("Name", text: $renameText)
                Button("Cancel", role: .cancel) { renaming = nil }
                Button("Rename") {
                    if let entry = renaming {
                        onRename(entry, renameText)
                    }
                    renaming = nil
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        SavedViewsSheet(
            entries: [
                SavedViewEntry(id: "1", name: "Urgent work", config: .object([:])),
                SavedViewEntry(id: "2", name: "My tasks", config: .object([:])),
            ],
            summary: { _ in "High & Urgent" },
            isActive: { $0.id == "1" },
            onApply: { _ in },
            onCreate: { _ in },
            onRename: { _, _ in },
            onDelete: { _ in },
            onUpdate: { _ in }
        )
    }
}
