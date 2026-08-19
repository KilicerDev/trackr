//
//  TaskFiltersSheet.swift
//  trackr-mobile-ios
//

import SwiftUI

struct TaskFiltersSheet: View {
    @Binding var filters: TaskFilters
    /// Filter options are derived from the loaded tasks, like the web
    /// toolbar builds its option lists from page data.
    let tasks: [TaskItem]
    @Environment(\.dismiss) private var dismiss

    private var assigneeOptions: [(value: UserRef, label: String)] {
        Array(Set(tasks.flatMap(\.assignees)))
            .sorted { $0.name < $1.name }
            .map { ($0, $0.name) }
    }

    private var projectOptions: [(value: String, label: String)] {
        Set(tasks.map(\.project)).sorted().map { ($0, $0) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("View") {
                    Picker("Group by", selection: $filters.group) {
                        ForEach(GroupBy.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                    Picker("Due within", selection: $filters.window) {
                        ForEach(TimeWindow.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                }

                Section("Filter by") {
                    MultiSelectRow(
                        title: "Status",
                        options: TaskStatus.allCases.map { ($0, $0.label) },
                        selection: $filters.statuses
                    )
                    MultiSelectRow(
                        title: "Priority",
                        options: TaskPriority.allCases.map { ($0, $0.label) },
                        selection: $filters.priorities
                    )
                    MultiSelectRow(
                        title: "Assignee",
                        options: assigneeOptions,
                        selection: $filters.assignees
                    )
                    MultiSelectRow(
                        title: "Project",
                        options: projectOptions,
                        selection: $filters.projects
                    )
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Reset") {
                        filters.reset()
                    }
                    .disabled(!filters.hasActiveFilters && filters.window == .month)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

#Preview {
    @Previewable @State var filters = TaskFilters()
    Color.clear.sheet(isPresented: .constant(true)) {
        TaskFiltersSheet(filters: $filters, tasks: TaskItem.samples)
    }
}
