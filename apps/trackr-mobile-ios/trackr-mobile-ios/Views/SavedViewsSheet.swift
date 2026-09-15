//
//  SavedViewsSheet.swift
//  trackr-mobile-ios
//
//  Legacy name kept for existing call sites — the saved-views strip of
//  the view-options sheet on its own (the page passes its own hooks):
//  tap applies, "+ Save current" snapshots the page's filters, rename /
//  update-with-current-filters / delete via context menu (web ViewsMenu
//  parity). New code presents `ViewOptionsSheet(model:context:)` which
//  shows the strip together with the layout and filter cards.
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

    var body: some View {
        ViewOptionsBody(config: ViewOptionsConfig(
            noun: "",
            count: nil,
            savedViews: SavedViewsHooks(
                entries: entries, summary: summary, isActive: isActive, onApply: onApply,
                onCreate: onCreate, onRename: onRename, onDelete: onDelete, onUpdate: onUpdate
            )
        ))
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
    .preferredColorScheme(.dark)
}
