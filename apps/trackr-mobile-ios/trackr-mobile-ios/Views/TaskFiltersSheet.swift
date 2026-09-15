//
//  TaskFiltersSheet.swift
//  trackr-mobile-ios
//
//  Legacy name kept for existing call sites — the view-options sheet
//  (layout + filters) bound to a filters value, without the saved-views
//  strip (no model here). New code presents `ViewOptionsSheet(model:
//  context: .tasks)` instead.
//

import SwiftUI

struct TaskFiltersSheet: View {
    @Binding var filters: TaskFilters
    /// Filter options are derived from the loaded tasks, like the web
    /// toolbar builds its option lists from page data.
    let tasks: [TaskItem]

    var body: some View {
        ViewOptionsBody(config: .tasks(filters: $filters, tasks: tasks))
    }
}

#Preview {
    @Previewable @State var filters = TaskFilters()
    Color.clear.sheet(isPresented: .constant(true)) {
        TaskFiltersSheet(filters: $filters, tasks: TaskItem.samples)
    }
    .preferredColorScheme(.dark)
}
